/**
 * Money and Lagos time for the admin portal. Lagos is UTC+1 all year (no daylight saving), and a rental
 * is whole calendar days: starts_at = first day 00:00 Lagos, ends_at = the day after the last, 00:00 Lagos.
 * Safe to import from client components.
 */
export { naira } from "@/lib/format";

const TZ = "Africa/Lagos";
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** "YYYY-MM-DD" of an instant, in Lagos. */
export function lagosDay(at: Date | string = new Date()): string {
  const t = typeof at === "string" ? new Date(at) : at;
  return new Date(t.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a Lagos calendar day starts (ISO, UTC). */
export function dayStart(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - LAGOS_OFFSET_MS).toISOString();
}

/** Add whole days to "YYYY-MM-DD". */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days between two "YYYY-MM-DD" (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** First and last rental day of a booking (Lagos). */
export function rentalDays(startsAt: string, endsAt: string): { first: string; last: string } {
  return { first: lagosDay(startsAt), last: addDays(lagosDay(endsAt), -1) };
}

const D_SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const D_WEEK = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const DT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const T = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });

/** "12 Oct" for a "YYYY-MM-DD" day. */
export const fmtDay = (day: string) => D_SHORT.format(new Date(`${day}T00:00:00Z`));
/** "Mon 12 Oct" for a "YYYY-MM-DD" day. */
export const fmtWeekday = (day: string) => D_WEEK.format(new Date(`${day}T00:00:00Z`));
/** "12 Oct, 14:05" (Lagos) for an instant. */
export const fmtDateTime = (at: string | null | undefined) => (at ? DT.format(new Date(at)) : "—");
export const fmtTime = (at: string | null | undefined) => (at ? T.format(new Date(at)) : "—");

/** "12–14 Oct" / "30 Oct – 2 Nov" / "12 Oct" for a booking's rental days. */
export function fmtRental(startsAt: string, endsAt: string): string {
  const { first, last } = rentalDays(startsAt, endsAt);
  if (first === last) return fmtDay(first);
  if (first.slice(0, 7) === last.slice(0, 7)) return `${Number(first.slice(8))}–${fmtDay(last)}`;
  return `${fmtDay(first)} – ${fmtDay(last)}`;
}

/** Naira input ("15,000" or "15000.50") → kobo; null when empty or not a number. */
export function koboFromNaira(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/[₦,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Kobo → plain naira string for an input's default value. */
export const nairaInput = (kobo: number | null | undefined) => (kobo == null ? "" : String(kobo / 100));

/** Parse a Postgres tstzrange literal: ["2026-10-11 23:00:00+00","2026-10-14 11:00:00+00"). */
export function parseRange(r: string | null | undefined): { from: string; to: string } | null {
  if (!r) return null;
  const m = r.match(/^[[(]"?([^",]*)"?,"?([^")\]]*)"?[)\]]$/);
  if (!m || !m[1] || !m[2]) return null;
  const iso = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
  try {
    return { from: iso(m[1]), to: iso(m[2]) };
  } catch {
    return null;
  }
}

/** Current time in ms. Server Components render once per request, so reading the clock is fine there. */
export const nowMs = () => Date.now();
