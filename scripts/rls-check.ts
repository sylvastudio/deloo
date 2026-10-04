/**
 * Phase 2 exit check: row-level security, run against the local Supabase stack.
 * Signs in as the seeded TEST users with the public (anon) key — exactly what a
 * browser or a hand-written API call could do — and tries things RLS must refuse.
 *
 *   npm run db:reset && npm run check:rls
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const line = file.split("\n").find((l) => l.startsWith(name + "="));
  if (!line) throw new Error(`${name} missing: copy .env.example to .env.local and fill it from \`npx supabase status\``);
  return line.slice(name.length + 1).trim();
}
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL");
const KEY = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const GRACE = "aaaaaaaa-0000-4000-8000-000000000001";
const NORTHGATE = "bbbbbbbb-0000-4000-8000-000000000002";
const CHOIR = "aaaaaaaa-1000-4000-8000-000000000002";
const VOLUNTEER_ID = "22222222-2222-4222-8222-222222222222";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function as(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "deloo-test-123" });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

async function main() {
  const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
  const vol = await as("volunteer@grace.test");
  const admin = await as("admin@grace.test");
  const other = await as("admin@northgate.test");

  // --- Signed-out ---------------------------------------------------------------
  {
    const { data } = await anon.from("brand_kits").select("id");
    check("signed-out visitor sees no brand kits", (data ?? []).length === 0, `${data?.length ?? 0} rows`);
  }

  // --- Volunteer: can read the kit, cannot change it --------------------------------
  const { data: kit } = await vol.from("brand_kits").select("id, colours").eq("org_id", GRACE).single();
  check("volunteer can read their org's brand kit", !!kit);
  {
    const { data, error } = await vol.from("brand_kits")
      .update({ colours: { primary: "#FF0000", accent: "#00FF00", paper: "#FFFFFF", ink: "#000000" } })
      .eq("org_id", GRACE).select();
    const { data: after } = await admin.from("brand_kits").select("colours").eq("org_id", GRACE).single();
    check("volunteer UPDATE brand_kits is refused", (data ?? []).length === 0 && after?.colours.primary === kit?.colours.primary,
      error ? error.message : `${data?.length ?? 0} rows changed, primary still ${after?.colours.primary}`);
  }
  {
    const { error } = await vol.from("brand_kits").insert({ org_id: GRACE, unit_id: CHOIR });
    check("volunteer INSERT brand_kits is refused", !!error, error?.message);
  }
  {
    const { data } = await vol.from("brand_kits").delete().eq("org_id", GRACE).select();
    check("volunteer DELETE brand_kits is refused", (data ?? []).length === 0);
  }
  {
    const { error } = await vol.storage.from("brand").upload(`${GRACE}/logo-hijack.svg`, new Blob(["<svg/>"], { type: "image/svg+xml" }));
    check("volunteer cannot upload to the brand bucket", !!error, error?.message);
  }
  {
    const { data } = await vol.from("memberships").update({ role: "admin" }).eq("user_id", VOLUNTEER_ID).select();
    const { data: m } = await admin.from("memberships").select("role").eq("user_id", VOLUNTEER_ID).single();
    check("volunteer cannot promote themselves to admin", (data ?? []).length === 0 && m?.role === "volunteer");
  }
  {
    const { error } = await vol.from("briefs").insert({ org_id: GRACE, unit_id: CHOIR, author_id: VOLUNTEER_ID, category_key: "event" });
    check("volunteer cannot create a brief in another unit", !!error, error?.message);
  }
  {
    const { data, error } = await vol.from("briefs")
      .insert({ org_id: GRACE, unit_id: "aaaaaaaa-1000-4000-8000-000000000001", author_id: VOLUNTEER_ID, category_key: "quote", raw_text: "rls-check" })
      .select("id").single();
    check("volunteer can create a brief in their own unit", !!data && !error, error?.message);
    if (data) await vol.from("briefs").delete().eq("id", data.id);
  }
  {
    const { error } = await vol.rpc("create_organisation", { org_name: "Sneaky Org", org_type: "other", org_structure: "single" });
    check("existing member cannot create a second organisation", !!error, error?.message);
  }

  // --- Admin: can change the kit ----------------------------------------------------
  {
    const next = { ...kit!.colours, accent: "#E8B84B" };
    const { data, error } = await admin.from("brand_kits").update({ colours: next }).eq("org_id", GRACE).select("colours");
    check("admin UPDATE brand_kits succeeds", (data ?? []).length === 1 && !error, error?.message);
    await admin.from("brand_kits").update({ colours: kit!.colours }).eq("org_id", GRACE);
  }
  {
    const path = `${GRACE}/rls-check.svg`;
    const { error } = await admin.storage.from("brand").upload(path, new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"], { type: "image/svg+xml" }), { upsert: true });
    check("admin can upload to their org's brand folder", !error, error?.message);
    const { data: seen, error: dlErr } = await vol.storage.from("brand").download(path);
    check("volunteer can read the org's brand files", !!seen && !dlErr, dlErr?.message);
    const { data: leak } = await other.storage.from("brand").download(path);
    check("another org cannot read those brand files", !leak);
    await admin.storage.from("brand").remove([path]);
  }

  // --- Org isolation ------------------------------------------------------------------
  for (const table of ["organisations", "units", "brand_kits", "briefs", "org_categories", "org_templates"] as const) {
    const col = table === "organisations" ? "id" : "org_id";
    const { data } = await other.from(table).select(col);
    const orgs = new Set((data ?? []).map((r: Record<string, string>) => r[col]));
    check(`Northgate admin sees only Northgate rows in ${table}`, orgs.size === 1 && orgs.has(NORTHGATE), [...orgs].join(","));
  }
  {
    const { data } = await other.from("brand_kits").update({ tone: "hijacked" }).eq("org_id", GRACE).select();
    check("Northgate admin cannot edit Grace's brand kit", (data ?? []).length === 0);
  }
  {
    const { error } = await other.storage.from("brand").upload(`${GRACE}/x.svg`, new Blob(["<svg/>"], { type: "image/svg+xml" }));
    check("Northgate admin cannot upload into Grace's folder", !!error, error?.message);
  }
  {
    const { data } = await vol.from("briefs").select("org_id");
    check("Grace volunteer sees no Northgate briefs", (data ?? []).every((r) => r.org_id === GRACE), `${data?.length ?? 0} rows`);
  }

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll RLS checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
