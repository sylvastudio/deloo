"use server";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/org";
import { buildPalette, HEX } from "@/lib/posters/colour";
import { createClient } from "@/lib/supabase/server";

export type KitInput = {
  primary: string; accent: string; colourSource: "default" | "logo" | "custom";
  tone: string; grain: boolean;
  /** Storage path of the logo in the brand bucket ({org_id}/logos/…), or null for no logo. */
  logo: string | null;
};

export async function saveKit(input: KitInput): Promise<{ error?: string; notice?: string }> {
  const m = await requireMembership();
  if (m.role !== "admin") return { error: "Only HQ admins can change the brand kit." };
  if (!HEX.test(input.primary) || !HEX.test(input.accent)) return { error: "Colours must be hex values like #1B2A4A." };
  if (!["default", "logo", "custom"].includes(input.colourSource)) return { error: "Unknown colour source." };
  const tone = String(input.tone ?? "").trim();
  if (tone.length > 1000) return { error: "Keep the tone under 1,000 characters." };
  if (input.logo !== null && (typeof input.logo !== "string" || !input.logo.startsWith(`${m.org.id}/logos/`))) return { error: "That logo isn't in your organisation's files." };

  const supabase = await createClient();
  const { data: before } = await supabase.from("brand_kits").select("logos").eq("org_id", m.org.id).is("unit_id", null).single<{ logos: string[] }>();
  // RLS (brand_kits_update) has the final say: only admins of this org can write.
  const { error } = await supabase
    .from("brand_kits")
    .update({ colours: buildPalette(input.primary, input.accent), colour_source: input.colourSource, tone, grain: !!input.grain, logos: input.logo ? [input.logo] : [] })
    .eq("org_id", m.org.id)
    .is("unit_id", null);
  if (error) return { error: "Couldn't save the brand kit. Try again." };

  // Tidy up replaced logo files. Failing here only leaves an unused file behind.
  const stale = (before?.logos ?? []).filter((p) => p !== input.logo);
  if (stale.length) await supabase.storage.from("brand").remove(stale);

  revalidatePath("/", "layout");
  return { notice: "Saved. Every new design uses this kit." };
}
