"use server";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/org";
import { buildPalette, HEX } from "@/lib/posters/colour";
import { normaliseLogos, type LogoVariant } from "@/lib/posters/logos";
import { createClient } from "@/lib/supabase/server";

export type KitInput = {
  primary: string; accent: string; colourSource: "default" | "logo" | "custom";
  tone: string; grain: boolean;
  /** Every logo version, main first. Files are already in the brand bucket under {org_id}/logos/. */
  logos: LogoVariant[];
};

const MAX_LOGOS = 8;
const one = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100000 ? Math.round(v) : 0);

/** Rebuilds each logo version from known fields only, so nothing unexpected is stored. */
function cleanLogos(orgId: string, raw: unknown): LogoVariant[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LOGOS) return null;
  const out: LogoVariant[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r.path !== "string" || !r.path.startsWith(`${orgId}/logos/`) || r.path.includes("..")) return null;
    const hist = Array.isArray(r.lumHist) && r.lumHist.length === 16 && r.lumHist.every((n) => typeof n === "number" && n >= 0 && n <= 1) ? (r.lumHist as number[]) : null;
    const derived = r.source === "derived";
    out.push({
      id: typeof r.id === "string" ? r.id.slice(0, 64) : crypto.randomUUID(),
      path: r.path,
      sha256: typeof r.sha256 === "string" && /^[0-9a-f]{64}$/.test(r.sha256) ? r.sha256 : null,
      kind: one(r.kind, ["main", "mark"] as const, "main"),
      includesName: r.includesName !== false,
      treatment: one(r.treatment, ["full_colour", "mono_white", "mono_black"] as const, "full_colour"),
      madeFor: one(r.madeFor, ["auto", "light", "dark"] as const, "auto"),
      source: derived ? "derived" : "upload",
      derivedFrom: typeof r.derivedFrom === "string" ? r.derivedFrom.slice(0, 64) : null,
      derivation: r.derivation ? one(r.derivation, ["trim", "white_box_removed", "silhouette_white", "silhouette_black"] as const, "trim") : null,
      format: one(r.format, ["svg", "png", "jpg", "webp"] as const, "png"),
      w: num(r.w), h: num(r.h), alpha: r.alpha === true,
      opaqueBg: typeof r.opaqueBg === "string" && HEX.test(r.opaqueBg) ? r.opaqueBg : null,
      lumHist: hist,
      colours: Array.isArray(r.colours) ? (r.colours as unknown[]).filter((c): c is string => typeof c === "string" && HEX.test(c)).slice(0, 4) : [],
      // Saving the kit is the admin's approval of every version in it, including ones Deloo made on request.
      approvedAt: typeof r.approvedAt === "string" ? r.approvedAt.slice(0, 40) : new Date().toISOString(),
    });
  }
  return out;
}

export async function saveKit(input: KitInput): Promise<{ error?: string; notice?: string }> {
  const m = await requireMembership();
  if (m.role !== "admin") return { error: "Only HQ admins can change the brand kit." };
  if (!HEX.test(input.primary) || !HEX.test(input.accent)) return { error: "Colours must be hex values like #1B2A4A." };
  if (!["default", "logo", "custom"].includes(input.colourSource)) return { error: "Unknown colour source." };
  const tone = String(input.tone ?? "").trim();
  if (tone.length > 1000) return { error: "Keep the tone under 1,000 characters." };
  const logos = cleanLogos(m.org.id, input.logos);
  if (!logos) return { error: `Keep up to ${MAX_LOGOS} logo versions, all uploaded to your organisation's files.` };

  const supabase = await createClient();
  const { data: before } = await supabase.from("brand_kits").select("logos").eq("org_id", m.org.id).is("unit_id", null).single<{ logos: unknown }>();
  // RLS (brand_kits_update) has the final say: only admins of this org can write.
  const { error } = await supabase
    .from("brand_kits")
    .update({ colours: buildPalette(input.primary, input.accent), colour_source: input.colourSource, tone, grain: !!input.grain, logos })
    .eq("org_id", m.org.id)
    .is("unit_id", null);
  if (error) return { error: "Couldn't save the brand kit. Try again." };

  // Tidy up replaced logo files. Failing here only leaves an unused file behind.
  const keep = new Set(logos.map((l) => l.path));
  const stale = normaliseLogos(before?.logos).map((l) => l.path).filter((p) => !keep.has(p));
  if (stale.length) await supabase.storage.from("brand").remove(stale);

  revalidatePath("/", "layout");
  return { notice: "Saved. Every new design uses this kit." };
}
