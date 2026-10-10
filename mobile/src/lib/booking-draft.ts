import { useCallback, useSyncExternalStore } from 'react';

import { addDays, lagosToday, rentalWindow, windowDays } from '@/ui/date-range';
import { displayName } from './catalog';
import { needLabel } from './line-text';
import type { Draft } from './plan';
import type { Result } from './plan-result';
import { supabase } from './supabase';

/**
 * What the renter is about to book: one basket, one date range (PRD R-14: one booking per bag).
 * Filled from an item page or from "Book this setup", read by Review. Saved on the phone, so closing
 * the app (or "Someone just booked this") never loses it. Prices are never stored here: Review asks
 * the server (quote_booking) every time.
 */
export type DraftLine = { itemId: string; name: string; qty: number };
/** A plan line we couldn't supply, kept on the booking ("Not included: teleprompter"). */
export type NotIncluded = { label: string; qty: number; reason: 'not_stocked' | 'booked' };
export type BookingDraft = {
  lines: DraftLine[];
  /** Whole Lagos days, YYYY-MM-DD. Missing when the plan had no dates yet. */
  first?: string;
  last?: string;
  eventId?: string;
  notIncluded?: NotIncluded[];
  /** The plan's area answer (e.g. "Lekki"), to pre-select the delivery zone. */
  area?: string;
  /** Where it came from, so "Change" can go back there. */
  from: { kind: 'item'; itemId: string } | { kind: 'plan' };
};

/** Delivery details remembered between bookings (the renter's last address and area). */
export type Checkout = { delivery: 'pickup' | 'delivery'; zoneId?: string; address: string; phone: string; method?: 'card' | 'bank_transfer' | 'ussd' | 'usdt' };

const KEY = 'deloo.booking.draft';
const CHECKOUT_KEY = 'deloo.booking.checkout';

function read<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function write(key: string, value: unknown) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full: memory only */ }
}

// A tiny store so every screen sees the same draft (Review and the item page can both change it).
let current: BookingDraft | null = read<BookingDraft>(KEY);
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function getBookingDraft() { return current; }
export function setBookingDraft(d: BookingDraft | null) {
  current = d;
  write(KEY, d);
  listeners.forEach((fn) => fn());
}
export function useBookingDraft() {
  const draft = useSyncExternalStore(subscribe, () => current);
  const update = useCallback((patch: Partial<BookingDraft>) => { if (current) setBookingDraft({ ...current, ...patch }); }, []);
  return { draft, update };
}

export const getCheckout = () => read<Checkout>(CHECKOUT_KEY);
export const saveCheckout = (c: Checkout) => write(CHECKOUT_KEY, c);

/** Stable text for "is this the same basket?" (to reuse a hold made for it). */
export function draftKey(d: Pick<BookingDraft, 'lines' | 'first' | 'last'>) {
  const lines = [...d.lines].sort((a, b) => a.itemId.localeCompare(b.itemId)).map((l) => `${l.itemId}x${l.qty}`).join(',');
  return `${lines}|${d.first ?? ''}|${d.last ?? ''}`;
}

/**
 * The plan's chosen gear as one basket: the same item chosen on two lines is merged, the dates come
 * from the plan window, and lines we couldn't fill (fully or partly) become "not included".
 */
export function draftFromPlan(result: Result, plan: Draft): BookingDraft {
  const by = new Map<string, DraftLine>();
  const notIncluded: NotIncluded[] = [];
  for (const l of result.lines) {
    if (l.removed) continue;
    for (const o of l.chosen) {
      const line = by.get(o.itemId) ?? { itemId: o.itemId, name: displayName(o.name), qty: 0 };
      line.qty += o.units;
      by.set(o.itemId, line);
    }
    const short = l.line.qty - l.chosen.reduce((n, o) => n + o.units, 0);
    if (short > 0) notIncluded.push({ label: needLabel({ ...l.line, qty: short }), qty: short, reason: l.shortReason ?? 'booked' });
  }
  const a = plan.answers;
  const { first, last } = windowDays(
    typeof a.startsAt === 'string' && a.startsAt !== 'unsure' ? a.startsAt : undefined,
    typeof a.endsAt === 'string' && a.endsAt !== 'unsure' ? a.endsAt : undefined,
  );
  const area = typeof a.area === 'string' && a.area !== 'unsure' ? a.area : undefined;
  return { lines: [...by.values()], first, last, eventId: plan.eventId, notIncluded, area, from: { kind: 'plan' } };
}

// ---------------------------------------------------------------------------------------------
// The bag: the same draft, filled one item at a time from the Gear tab. One date range for the bag.
// ---------------------------------------------------------------------------------------------

/** Units in the bag ("3 items"). */
export const bagCount = (d: BookingDraft | null) => (d?.lines ?? []).reduce((n, l) => n + l.qty, 0);

/** The bag's days, when it has gear and days that can still be booked (from tomorrow). */
export function bagDays(d: BookingDraft | null): { first: string; last: string } | undefined {
  if (!d?.lines.length || !d.first || !d.last) return undefined;
  return d.first >= addDays(lagosToday(), 1) ? { first: d.first, last: d.last } : undefined;
}

/** Days to start from when the renter hasn't picked any: the bag's, else the plan's (if still bookable). */
export function prefillDays(d: BookingDraft | null, plan?: Draft['answers']): { first?: string; last?: string } {
  const bag = bagDays(d);
  if (bag) return bag;
  const s = plan?.startsAt, e = plan?.endsAt;
  const w = windowDays(typeof s === 'string' && s !== 'unsure' ? s : undefined, typeof e === 'string' && e !== 'unsure' ? e : undefined);
  return w.first && w.last && w.first >= addDays(lagosToday(), 1) ? w : {};
}

/** Adding gear on these days would change the bag's days (the renter is asked first). */
export function daysClash(d: BookingDraft | null, first: string, last: string) {
  const days = bagDays(d);
  return !!days && (days.first !== first || days.last !== last);
}

/**
 * Puts lines in the bag on these days, which become the bag's days. An item already there takes the
 * new quantity. An empty bag starts from this item.
 */
export function addToBag(add: DraftLine[], first: string, last: string, fromItemId: string) {
  const d = getBookingDraft();
  if (!d?.lines.length) { setBookingDraft({ lines: add, first, last, from: { kind: 'item', itemId: fromItemId } }); return; }
  const lines = [...d.lines];
  for (const l of add) {
    const at = lines.findIndex((x) => x.itemId === l.itemId);
    if (at >= 0) lines[at] = { ...lines[at], qty: l.qty }; else lines.push(l);
  }
  setBookingDraft({ ...d, lines, first, last });
}

/** Gear shown around the bag (suggestions, the Gear tab). `free` is counted only when days are given. */
export type ShelfItem = {
  id: string; name: string; brand: string; model: string; category_key: string; specs: Record<string, unknown>;
  day_rate_kobo: number; photos: string[]; units: number; free?: number;
};

const shelfCache = new Map<string, { at: number; items: ShelfItem[] }>();

/** The live catalogue (one small query) plus free units on the days (0008 free_units). Cached a minute. */
export async function loadShelf(first?: string, last?: string): Promise<ShelfItem[]> {
  const key = `${first ?? ''}|${last ?? ''}`;
  const hit = shelfCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.items;
  const w = first && last ? rentalWindow(first, last) : undefined;
  const [{ data, error }, free] = await Promise.all([
    supabase.from('items').select('id, name, brand, model, category_key, specs, day_rate_kobo, photos, units(count)').eq('active', true),
    w ? supabase.rpc('free_units', { p_from: w.startsAt, p_to: w.endsAt }) : Promise.resolve({ data: null, error: null }),
  ]);
  if (error) throw error;
  if (free.error) throw free.error;
  const counts = new Map(((free.data as { item_id: string; free: number }[] | null) ?? []).map((r) => [r.item_id, r.free]));
  const items = ((data ?? []) as unknown as (Omit<ShelfItem, 'units' | 'free'> & { units: { count: number }[] })[]).map((i): ShelfItem => ({
    ...i, name: displayName(i.name), specs: i.specs ?? {}, units: i.units[0]?.count ?? 0, free: w ? counts.get(i.id) ?? 0 : undefined,
  }));
  shelfCache.set(key, { at: Date.now(), items });
  return items;
}

/** A shelf item as the planner's complements see it. */
export const asGear = (i: ShelfItem) => ({ id: i.id, category: i.category_key, name: i.name, specs: i.specs, dayRateKobo: i.day_rate_kobo, freeUnits: i.free });
