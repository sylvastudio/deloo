import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Public catalogue facts for the landing page, read with the anon key (RLS exposes active items from
 * approved vendors, categories, delivery zones and app settings). No cookies, so the page stays static;
 * every request is cached for an hour, and any failure falls back to nulls/empties so the page still renders.
 */

export const LANDING_REVALIDATE = 3600;

export type LandingItem = {
  id: string;
  name: string;
  categoryKey: string;
  dayRateKobo: number;
  depositKobo: number;
  photoUrl: string | null;
};
export type LandingCategory = { key: string; label: string; count: number };
export type LandingZone = { name: string; areas: string[]; priceKobo: number };
export type LandingData = {
  ok: boolean;
  itemCount: number;
  minDayRateKobo: number | null;
  featured: LandingItem[];
  categories: LandingCategory[];
  zones: LandingZone[];
  protectionRate: number | null;
  pickupArea: string;
  supportWhatsapp: string;
};

const EMPTY: LandingData = {
  ok: false, itemCount: 0, minDayRateKobo: null, featured: [], categories: [], zones: [],
  protectionRate: null, pickupArea: "", supportWhatsapp: "",
};

type ItemRow = { id: string; name: string; category_key: string; day_rate_kobo: number; deposit_kobo: number; photos: string[] | null };
type CategoryRow = { key: string; label: string; sort: number };
type ZoneRow = { name: string; areas: string[] | null; price_kobo: number };
type SettingsRow = { protection_rate: number | string | null; pickup_address: string | null; support_whatsapp: string | null };

/** 400px-wide, cropped card photo via Supabase image transforms (public `items` bucket). */
export function itemPhotoUrl(path: string | undefined | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !path) return null;
  const clean = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/render/image/public/items/${clean}?width=400&height=300&resize=cover&quality=60`;
}

/** The area part of the pickup address (last part before "Lagos"/"Nigeria"), never the street. */
function areaOnly(address: string) {
  const parts = address.split(",").map((s) => s.trim()).filter((p) => p && !/^(lagos( state)?|nigeria)$/i.test(p));
  if (parts.length > 1) return parts[parts.length - 1];
  return parts[0] && !/\d/.test(parts[0]) ? parts[0] : ""; // a lone "Yaba" is an area; "12 Herbert Macaulay Way" isn't
}

/** Top day rates, one per category first, then the next most expensive, up to `n`. */
function pickFeatured(items: ItemRow[], n: number) {
  const sorted = [...items].sort((a, b) => b.day_rate_kobo - a.day_rate_kobo);
  const seen = new Set<string>();
  const first: ItemRow[] = [];
  const rest: ItemRow[] = [];
  for (const it of sorted) {
    if (!seen.has(it.category_key)) { seen.add(it.category_key); first.push(it); } else rest.push(it);
  }
  return [...first.slice(0, n), ...rest].slice(0, n).sort((a, b) => b.day_rate_kobo - a.day_rate_kobo);
}

export async function getLandingData(): Promise<LandingData> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return EMPTY;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(5000), next: { revalidate: LANDING_REVALIDATE } }),
    },
  });

  try {
    const [items, cats, zones, settings] = await Promise.all([
      supabase.from("items").select("id,name,category_key,day_rate_kobo,deposit_kobo,photos").eq("active", true),
      supabase.from("categories").select("key,label,sort").order("sort"),
      supabase.from("delivery_zones").select("name,areas,price_kobo").eq("active", true).order("sort"),
      supabase.from("app_settings").select("protection_rate,pickup_address,support_whatsapp").eq("id", 1).maybeSingle(),
    ]);
    if (items.error) throw items.error;

    const itemRows = (items.data ?? []) as ItemRow[];
    const counts = new Map<string, number>();
    for (const it of itemRows) counts.set(it.category_key, (counts.get(it.category_key) ?? 0) + 1);
    const categories = ((cats.data ?? []) as CategoryRow[])
      .filter((c) => counts.has(c.key))
      .map((c) => ({ key: c.key, label: c.label, count: counts.get(c.key)! }));

    const s = (settings.data ?? null) as SettingsRow | null;
    const rate = s?.protection_rate == null ? null : Number(s.protection_rate);

    return {
      ok: itemRows.length > 0,
      itemCount: itemRows.length,
      minDayRateKobo: itemRows.length ? Math.min(...itemRows.map((i) => Number(i.day_rate_kobo))) : null,
      featured: pickFeatured(itemRows, 6).map((i) => ({
        id: i.id, name: i.name, categoryKey: i.category_key,
        dayRateKobo: Number(i.day_rate_kobo), depositKobo: Number(i.deposit_kobo),
        photoUrl: itemPhotoUrl(i.photos?.[0]),
      })),
      categories,
      zones: ((zones.data ?? []) as ZoneRow[]).map((z) => ({ name: z.name, areas: z.areas ?? [], priceKobo: Number(z.price_kobo) })),
      protectionRate: Number.isFinite(rate) ? rate : null,
      pickupArea: areaOnly(s?.pickup_address ?? ""),
      supportWhatsapp: (s?.support_whatsapp ?? "").trim(),
    };
  } catch (err) {
    console.error("[landing] Supabase unreachable, rendering fallbacks:", (err as { message?: string })?.message ?? err);
    return EMPTY;
  }
}
