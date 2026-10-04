"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCategory } from "@/lib/catalog";
import { requireMembership } from "@/lib/org";
import { isStyle, SIZES } from "@/lib/posters/render";
import { createClient } from "@/lib/supabase/server";

/** Keeps only the type's own fields, as trimmed strings within sensible lengths. */
function cleanFields(categoryKey: string, raw: unknown): Record<string, string> | null {
  const category = getCategory(categoryKey);
  if (!category || !raw || typeof raw !== "object") return null;
  const out: Record<string, string> = {};
  for (const f of category.schema.fields) {
    const v = (raw as Record<string, unknown>)[f.key];
    if (typeof v === "string" && v.trim()) out[f.key] = v.trim().slice(0, f.long ? 600 : 160);
  }
  return out;
}

function missingRequired(categoryKey: string, fields: Record<string, string>): string | null {
  const miss = getCategory(categoryKey)!.schema.fields.find((f) => f.required && !fields[f.key]);
  return miss ? `Add “${miss.label}”. Deloo needs it for this design.` : null;
}

export async function createBrief(input: { category: string; rawText: string; fields: Record<string, string> }): Promise<{ error: string } | void> {
  const m = await requireMembership();
  const fields = cleanFields(input.category, input.fields);
  if (!fields) return { error: "Choose what you're making first." };
  const missing = missingRequired(input.category, fields);
  if (missing) return { error: missing };
  const supabase = await createClient();
  // RLS (briefs_insert): volunteers can only create briefs for their own unit, as themselves.
  const { data, error } = await supabase
    .from("briefs")
    .insert({ org_id: m.org.id, unit_id: m.unit?.id ?? null, category_key: input.category, raw_text: String(input.rawText ?? "").trim().slice(0, 2000), fields, status: "generated" })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save your design. Try again." };
  revalidatePath("/");
  redirect(`/designs/${data.id}`);
}

export async function updateBrief(input: { id: string; category: string; fields: Record<string, string> }): Promise<{ error?: string; notice?: string }> {
  await requireMembership();
  const fields = cleanFields(input.category, input.fields);
  if (!fields) return { error: "Unknown design type." };
  const missing = missingRequired(input.category, fields);
  if (missing) return { error: missing };
  const supabase = await createClient();
  const { data, error } = await supabase.from("briefs").update({ fields }).eq("id", input.id).select("id");
  if (error || !data?.length) return { error: "Couldn't save. Only the person who made this design (or HQ) can change it." };
  revalidatePath("/");
  return { notice: "Saved." };
}

/** Records a downloaded PNG that the browser already uploaded to exports/{org}/{brief}/…. */
export async function recordAsset(input: {
  briefId: string; style: string; size: string; path: string; copy: Record<string, string>;
  /** Which approved logo version the PNG used, and that file's SHA-256 (PRD Phase 3 logo fidelity). */
  logoVariantId: string | null; logoSha256: string | null;
}): Promise<{ error?: string; version?: number }> {
  const m = await requireMembership();
  const size = SIZES.find((s) => s.key === input.size);
  if (!size || !isStyle(input.style)) return { error: "Unknown style or size." };
  if (!input.path.startsWith(`${m.org.id}/${input.briefId}/`)) return { error: "That file isn't in this design's folder." };
  const supabase = await createClient();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: last } = await supabase.from("assets").select("version").eq("brief_id", input.briefId).eq("template_key", input.style).eq("size", size.asset)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (last?.version ?? 0) + 1;
    // RLS (assets_write) allows the brief's author and HQ admins.
    const row = { brief_id: input.briefId, org_id: m.org.id, template_key: input.style, size: size.asset, copy: input.copy, file_path: input.path, version };
    const logo = { logo_variant_id: input.logoVariantId?.slice(0, 64) ?? null, logo_sha256: input.logoSha256 && /^[0-9a-f]{64}$/.test(input.logoSha256) ? input.logoSha256 : null };
    let { error } = await supabase.from("assets").insert({ ...row, ...logo });
    // Before migration 0004 has run, the logo columns don't exist yet: record the asset without them.
    if (error?.code === "42703" || error?.code === "PGRST204") ({ error } = await supabase.from("assets").insert(row));
    if (!error) return { version };
    if (error.code !== "23505") return { error: "Downloaded, but couldn't add it to the design's history." };
  }
  return { error: "Downloaded, but couldn't add it to the design's history." };
}
