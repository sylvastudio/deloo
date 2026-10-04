import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Palette } from "@/lib/posters/colour";
import { isStyle, type StyleKey } from "@/lib/posters/render";

export type ColourSource = "default" | "logo" | "custom";
export type Kit = { colours: Palette; colourSource: ColourSource; tone: string; grain: boolean; logos: string[]; logoUrl: string | null };

/** The org's master brand kit, with a short-lived signed link to its logo (the brand bucket is private). */
export async function getKit(orgId: string): Promise<Kit | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brand_kits")
    .select("colours, colour_source, tone, grain, logos")
    .eq("org_id", orgId)
    .is("unit_id", null)
    .maybeSingle<{ colours: Palette; colour_source: ColourSource; tone: string; grain: boolean; logos: string[] }>();
  if (!data) return null;
  let logoUrl: string | null = null;
  if (data.logos[0]) {
    const { data: signed } = await supabase.storage.from("brand").createSignedUrl(data.logos[0], 60 * 60);
    logoUrl = signed?.signedUrl ?? null;
  }
  return { colours: data.colours, colourSource: data.colour_source, tone: data.tone, grain: data.grain, logos: data.logos, logoUrl };
}

/** Styles the org picked during onboarding, in their order. */
export async function getOrgStyles(orgId: string): Promise<StyleKey[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("org_templates").select("template_key, position").eq("org_id", orgId).order("position");
  return (data ?? []).map((r) => r.template_key).filter(isStyle);
}

/** Poster types the org makes, in catalogue order. */
export async function getOrgCategories(orgId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("org_categories").select("category_key, categories(sort)").eq("org_id", orgId);
  const sortOf = (r: { categories: unknown }) => {
    const c = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    return (c as { sort?: number } | null)?.sort ?? 0;
  };
  return (data ?? []).sort((a, b) => sortOf(a) - sortOf(b)).map((r) => r.category_key);
}
