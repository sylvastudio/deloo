/**
 * Phase 0 exit check: row-level security on the rental schema.
 * Signs in as the seeded TEST users with the public (anon) key, exactly what a browser or a
 * hand-written API call could do, and tries things RLS must refuse.
 *
 * Run against a TEST project only (migrations 0006–0007 + supabase/seed.sql), never the live one:
 *   npm run check:rls
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const line = file.split("\n").find((l) => l.startsWith(name + "="));
  if (!line) throw new Error(`${name} missing: set it in the environment or .env.local`);
  return line.slice(name.length + 1).trim();
}
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL");
const KEY = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const RENTER = "11111111-1111-4111-8111-111111111111";
const SOUND_CITY = "aaaaaaaa-0000-4000-8000-000000000001";   // approved
const GRACE = "bbbbbbbb-0000-4000-8000-000000000002";        // not approved
const SPEAKER = "aaaaaaaa-2000-4000-8000-000000000001";
const SPEAKER_UNIT = "aaaaaaaa-3000-4000-8000-000000000001";
const GRACE_MIC = "bbbbbbbb-2000-4000-8000-000000000001";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function as(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "deloo-test-123" });
  if (error) throw new Error(`sign-in ${email}: ${error.message} (is this the TEST project with seed.sql?)`);
  return c;
}

// A fixed far-future window so repeated runs don't collide with real data.
const period = (startDay: number, endDay: number) => `[2031-01-${String(startDay).padStart(2, "0")} 08:00+01,2031-01-${String(endDay).padStart(2, "0")} 08:00+01)`;

async function main() {
  const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
  const renter = await as("renter@deloo.test");
  const sound = await as("owner@soundcity.test");
  const grace = await as("media@grace.test");
  const ops = await as("ops@deloo.test");

  // --- Public catalogue --------------------------------------------------------
  {
    const { data } = await anon.from("items").select("id, vendor_id");
    const vendors = new Set((data ?? []).map((r) => r.vendor_id));
    check("signed-out visitor sees approved vendors' gear", vendors.has(SOUND_CITY));
    check("signed-out visitor does not see unapproved vendors' gear", !vendors.has(GRACE));
    const { data: v } = await anon.from("vendors").select("id");
    check("signed-out visitor sees only approved vendors", (v ?? []).every((r) => r.id === SOUND_CITY) && (v ?? []).length >= 1);
  }
  {
    const { data } = await grace.from("items").select("id").eq("id", GRACE_MIC);
    check("unapproved vendor still sees their own gear", (data ?? []).length === 1);
  }

  // --- Profiles: no self-promotion --------------------------------------------
  {
    const { error } = await renter.from("profiles").update({ is_ops: true }).eq("id", RENTER);
    const { data: p } = await ops.from("profiles").select("is_ops").eq("id", RENTER).single();
    check("renter cannot make themselves Ops", !!error && p?.is_ops === false, error?.message);
  }
  {
    const { error } = await renter.from("profiles").update({ trust_level: 3 }).eq("id", RENTER);
    check("renter cannot raise their own trust level", !!error, error?.message);
  }
  {
    const { data } = await renter.from("profiles").select("id");
    check("renter sees only their own profile", (data ?? []).length === 1 && data![0].id === RENTER);
  }
  {
    const { data, error } = await renter.from("profiles").update({ phone: "08030000001" }).eq("id", RENTER).select("id");
    check("renter can edit their own phone", (data ?? []).length === 1 && !error, error?.message);
  }

  // --- Vendors: only members edit; only Ops approves ------------------------------
  {
    const { data } = await renter.from("items").update({ day_rate_kobo: 1 }).eq("id", SPEAKER).select();
    check("renter cannot change a vendor's prices", (data ?? []).length === 0);
  }
  {
    const { data } = await grace.from("items").update({ day_rate_kobo: 1 }).eq("id", SPEAKER).select();
    check("another vendor cannot change Sound City's prices", (data ?? []).length === 0);
  }
  {
    const { error } = await grace.from("items").insert({ vendor_id: SOUND_CITY, category_key: "mic", name: "Hijack", day_rate_kobo: 1, replacement_value_kobo: 100 });
    check("vendor cannot list gear under another vendor", !!error, error?.message);
  }
  {
    const { error } = await grace.from("vendors").update({ approved_at: new Date().toISOString() }).eq("id", GRACE);
    check("vendor cannot approve themselves", !!error, error?.message);
    const { error: rpcErr } = await grace.rpc("approve_vendor", { target: GRACE });
    check("vendor cannot call approve_vendor", !!rpcErr, rpcErr?.message);
  }
  {
    const { error } = await ops.rpc("approve_vendor", { target: GRACE });
    const { data: v } = await anon.from("vendors").select("id").eq("id", GRACE);
    check("Ops can approve a vendor, and its gear goes public", !error && (v ?? []).length === 1, error?.message);
    await ops.rpc("approve_vendor", { target: GRACE, approve: false });
  }
  {
    const { data, error } = await sound.from("items").insert({
      vendor_id: SOUND_CITY, category_key: "led_wall", name: "rls-check LED", day_rate_kobo: 1, replacement_value_kobo: 500000000, technician_required: false,
    }).select();
    check("tier-3 gear without a technician is refused", !!error && !data, error?.message);
  }

  // --- Reservations: the database refuses a double booking -------------------------
  {
    const { data: first, error: e1 } = await sound.from("reservations").insert({ unit_id: SPEAKER_UNIT, period: period(10, 12), note: "rls-check" }).select("id").single();
    check("vendor can block their own unit", !!first && !e1, e1?.message);
    const { error: e2 } = await sound.from("reservations").insert({ unit_id: SPEAKER_UNIT, period: period(11, 13), note: "rls-check overlap" });
    check("an overlapping reservation of the same unit is refused", !!e2 && /reservations_no_overlap|exclusion|conflict/i.test(e2.message), e2?.message);
    const { error: e3 } = await sound.from("reservations").insert({ unit_id: SPEAKER_UNIT, period: period(12, 14), note: "rls-check back-to-back" });
    check("a back-to-back reservation is allowed", !e3, e3?.message);
    const { error: e4 } = await grace.from("reservations").insert({ unit_id: SPEAKER_UNIT, period: period(20, 21), note: "rls-check foreign" });
    check("another vendor cannot block Sound City's unit", !!e4, e4?.message);
    const { error: e5 } = await renter.from("reservations").insert({ unit_id: SPEAKER_UNIT, period: period(22, 23), note: "rls-check renter" });
    check("a renter cannot reserve directly", !!e5, e5?.message);
    const { data: seen } = await renter.from("reservations").select("id").eq("unit_id", SPEAKER_UNIT);
    check("a renter cannot read a vendor's calendar", (seen ?? []).length === 0);
    await sound.from("reservations").delete().eq("unit_id", SPEAKER_UNIT).like("note", "rls-check%");
  }

  // --- Events, unmet demand, waitlist ------------------------------------------------
  {
    const { data: ev, error } = await renter.from("events").insert({ raw_text: "rls-check", answers: { type: "service" } }).select("id").single();
    check("renter can create an event", !!ev && !error, error?.message);
    const { data: peek } = await sound.from("events").select("id").eq("id", ev?.id ?? "");
    check("a vendor cannot read a renter's event", (peek ?? []).length === 0);
    const { error: uErr } = await renter.from("unmet_demand").insert({ event_id: ev?.id, category_key: "led_wall", quantity: 1 });
    check("renter can record unmet demand for their event", !uErr, uErr?.message);
    const { data: ud } = await renter.from("unmet_demand").select("id");
    check("only Ops reads unmet demand", (ud ?? []).length === 0);
    const { data: udOps } = await ops.from("unmet_demand").select("id").eq("event_id", ev?.id ?? "");
    check("Ops sees unmet demand", (udOps ?? []).length === 1);
    if (ev) await renter.from("events").delete().eq("id", ev.id);
  }
  {
    const { error } = await anon.from("waitlist").insert({ vertical: "studio", name: "rls-check (TEST)", contact: "test@deloo.test" });
    check("a signed-out visitor can join a waitlist", !error, error?.message);
    const { data } = await anon.from("waitlist").select("id");
    check("a signed-out visitor cannot read the waitlist", (data ?? []).length === 0);
  }
  {
    const { error } = await renter.from("bookings").insert({ event_id: RENTER, renter_id: RENTER, vendor_id: SOUND_CITY, starts_at: "2031-01-01", ends_at: "2031-01-02" });
    check("bookings cannot be inserted directly", !!error, error?.message);
  }

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll RLS checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
