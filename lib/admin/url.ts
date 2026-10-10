/** Query-string helpers for the admin list pages (filters, saved views, pagination). */

export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 50;

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The 1-based page number from ?page= (bad values mean page 1). */
export function pageOf(sp: SearchParams): number {
  const n = Number(first(sp.page));
  return Number.isInteger(n) && n > 1 && n < 10_000 ? n : 1;
}

/** Supabase .range() bounds for a page. */
export const rangeOf = (page: number, size = PAGE_SIZE): [number, number] => [(page - 1) * size, page * size - 1];

/**
 * `base?k=v…` from the current params with some changed. A null/empty value removes the key; any change
 * other than `page` itself drops the page number.
 */
export function hrefWith(base: string, current: Record<string, string>, change: Record<string, string | null | undefined> = {}): string {
  const next: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(change)) {
    if (v == null || v === "") delete next[k];
    else next[k] = v;
  }
  if (!("page" in change)) delete next.page;
  const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v)).toString();
  return qs ? `${base}?${qs}` : base;
}
