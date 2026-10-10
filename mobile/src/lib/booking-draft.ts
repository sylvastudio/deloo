import { useCallback, useSyncExternalStore } from 'react';

import { windowDays } from '@/ui/date-range';
import { displayName } from './catalog';
import { needLabel } from './line-text';
import type { Draft } from './plan';
import type { Result } from './plan-result';

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
export type Checkout = { delivery: 'pickup' | 'delivery'; zoneId?: string; address: string; phone: string };

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
