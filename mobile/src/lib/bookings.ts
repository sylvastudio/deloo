import { windowDays } from '@/ui/date-range';
import { apiGet, api } from './api';
import type { DraftLine, NotIncluded } from './booking-draft';
import { supabase } from './supabase';

/**
 * Real bookings (docs/booking-contract.md): quote → hold → Paystack → tracker. Money is kobo and
 * always comes from the server (quote_booking, or the booking row snapshotted at hold time).
 */

// ---------------------------------------------------------------------------
// Errors and offline
// ---------------------------------------------------------------------------

/** A failed request because the phone has no connection (vs. the server saying no). */
export function isOffline(e: unknown): boolean {
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  return /network request failed|failed to fetch|network|timed? ?out|aborted|no connection/i.test(m);
}
export const OFFLINE = 'You’re offline. Connect and try again.';
/** A plain message for anything that went wrong talking to the server. */
export function plain(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (isOffline(e)) return OFFLINE;
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  // Server functions raise short, renter-facing sentences; anything technical gets the fallback.
  return m && m.length < 140 && !/[{}_]|violat|relation|column|function|permission denied|jwt/i.test(m) ? m : fallback;
}

// ---------------------------------------------------------------------------
// Settings and delivery zones (cached for offline)
// ---------------------------------------------------------------------------
export type Zone = { id: string; name: string; areas: string[]; price_kobo: number };
export type Settings = { pickup_address: string; support_whatsapp: string; hold_minutes: number; protection_rate: number; zones: Zone[] };

const SETTINGS_KEY = 'deloo.settings';
let settingsMem: Settings | null = null;

export function cachedSettings(): Settings | null {
  if (settingsMem) return settingsMem;
  try { const raw = localStorage.getItem(SETTINGS_KEY); return raw ? (settingsMem = JSON.parse(raw) as Settings) : null; } catch { return null; }
}

export async function loadSettings(): Promise<Settings> {
  const [s, z] = await Promise.all([
    supabase.from('app_settings').select('pickup_address, support_whatsapp, hold_minutes, protection_rate').eq('id', 1).maybeSingle(),
    supabase.from('delivery_zones').select('id, name, areas, price_kobo').eq('active', true).order('sort'),
  ]);
  if (s.error || z.error) {
    const cached = cachedSettings();
    if (cached) return cached;
    throw s.error ?? z.error;
  }
  const out: Settings = {
    pickup_address: s.data?.pickup_address ?? '', support_whatsapp: s.data?.support_whatsapp ?? '',
    hold_minutes: s.data?.hold_minutes ?? 30, protection_rate: Number(s.data?.protection_rate ?? 0.07), zones: (z.data ?? []) as Zone[],
  };
  settingsMem = out;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(out)); } catch { /* ignore */ }
  return out;
}

// ---------------------------------------------------------------------------
// Availability, quote, hold
// ---------------------------------------------------------------------------
export type CalendarDay = { day: string; free: number; total: number };

export async function itemCalendar(itemId: string, from: string, to: string): Promise<CalendarDay[]> {
  const { data, error } = await supabase.rpc('item_calendar', { p_item: itemId, p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as CalendarDay[];
}

export type QuoteLine = { item_id: string; name: string; qty: number; days: number; free: number; day_rate_kobo: number; rental_kobo: number; deposit_kobo: number; ok: boolean };
export type QuoteProblem = 'starts_too_soon' | 'not_free' | 'item_unavailable' | 'choose_zone';
export type Quote = {
  days: number; lines: QuoteLine[]; rental_kobo: number; protection_rate: number; protection_kobo: number;
  delivery_kobo: number; deposit_kobo: number; total_kobo: number; ok: boolean; problems: QuoteProblem[];
};
export type Delivery = 'pickup' | 'delivery';

const rpcLines = (lines: DraftLine[]) => lines.map((l) => ({ item_id: l.itemId, qty: l.qty }));

export async function quoteBooking(lines: DraftLine[], first: string, last: string, delivery: Delivery, zoneId?: string): Promise<Quote> {
  const { data, error } = await supabase.rpc('quote_booking', {
    p_lines: rpcLines(lines), p_first: first, p_last: last, p_delivery: delivery, p_zone: delivery === 'delivery' ? zoneId ?? null : null,
  });
  if (error) throw error;
  return data as Quote;
}

export type Hold = { booking_id: string; ref: string; total_kobo: number; hold_expires_at: string };
/** create_hold failed because a unit went to someone else between quote and hold. */
export class GearTaken extends Error {
  constructor(public lines: QuoteLine[]) { super('gear_taken'); }
}

export async function createHold(input: {
  lines: DraftLine[]; first: string; last: string; delivery: Delivery; zoneId?: string; address: string; phone: string;
  eventId?: string; notIncluded?: NotIncluded[];
}): Promise<Hold> {
  const { data, error } = await supabase.rpc('create_hold', {
    p_lines: rpcLines(input.lines), p_first: input.first, p_last: input.last, p_delivery: input.delivery,
    p_zone: input.delivery === 'delivery' ? input.zoneId ?? null : null, p_address: input.address, p_phone: input.phone,
    p_event: input.eventId ?? null, p_not_included: input.notIncluded ?? [],
  });
  if (error) {
    if (error.message === 'gear_taken') {
      let lines: QuoteLine[] = [];
      try { lines = error.details ? (JSON.parse(error.details) as QuoteLine[]) : []; } catch { /* details are optional */ }
      throw new GearTaken(lines);
    }
    throw error;
  }
  return data as Hold;
}

// ---------------------------------------------------------------------------
// The hold being paid for (survives the app closing during checkout)
// ---------------------------------------------------------------------------
export type ActiveHold = Hold & { draftKey: string; reference?: string };
const ACTIVE_KEY = 'deloo.booking.active';

export function getActiveHold(): ActiveHold | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    const h = raw ? (JSON.parse(raw) as ActiveHold) : null;
    // Keep it a little past expiry: a late payment can still confirm (contract: confirm_payment).
    return h && Date.parse(h.hold_expires_at) > Date.now() - 60 * 60_000 ? h : null;
  } catch { return null; }
}
export function setActiveHold(h: ActiveHold | null) {
  try { h ? localStorage.setItem(ACTIVE_KEY, JSON.stringify(h)) : localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Paystack (server: deloo.space/api/paystack/*)
// ---------------------------------------------------------------------------
export const PAY_RETURN = 'deloo://pay';

export function startPayment(bookingId: string) {
  return api<{ authorization_url: string; reference: string }>('/api/paystack/init', { booking_id: bookingId });
}
export type Verify = { paid: boolean; booking_status?: BookingStatus; needs_refund: boolean; paystack_status?: string; error?: string };
export function verifyPayment(reference: string) {
  return apiGet<Verify>(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
}
/** Paystack statuses that mean money may still be on its way (bank transfer, USSD). */
export const IN_FLIGHT = ['pending', 'ongoing', 'processing', 'queued'];

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------
export type BookingStatus =
  | 'hold' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'collected' | 'inspected' | 'closed'
  | 'expired' | 'cancelled' | 'disputed' | 'returned' | 'out';

export type BookingItem = {
  id: string; item_id: string; unit_id: string | null; item_name: string; day_rate_kobo: number; days: number; rental_kobo: number; deposit_kobo: number;
  kind: 'rental' | 'extension';
  items: { photos: string[]; category_key: string; in_the_box: string[] } | null;
  units: { serial: string; tag: string } | null;
};
export type Payment = { id: string; reference: string; amount_kobo: number; status: string; channel: string; purpose: string; paid_at: string | null; created_at: string };
export type Refund = { id: string; purpose: string; amount_kobo: number; status: string; reason: string; processed_at: string | null; created_at: string };
export type HandoverMedia = { id: string; shot: string; media_type: 'photo' | 'video'; storage_path: string; unit_id: string | null; captured_at: string | null };
export type Handover = {
  id: string; kind: 'dispatch' | 'delivery' | 'collection' | 'inspection'; party: 'staff' | 'renter'; problem_note: string;
  result: 'ok' | 'issue' | null; confirmed_at: string | null; created_at: string; handover_media: HandoverMedia[];
};
export type Booking = {
  id: string; ref: string | null; status: BookingStatus; starts_at: string; ends_at: string; hold_expires_at: string | null;
  delivery: 'pickup' | 'delivery' | 'delivery_setup'; address: string; contact_phone: string; delivery_slot: string; collection_slot: string;
  rider_name: string; rider_phone: string; days: number; rental_kobo: number; protection_kobo: number; delivery_kobo: number;
  deposit_kobo: number; total_kobo: number; protection_rate: number; not_included: NotIncluded[] | null; needs_refund: boolean;
  confirmed_at: string | null; cancelled_at: string | null; created_at: string; updated_at: string;
  booking_items: BookingItem[];
};
export type BookingDetail = Booking & { payments: Payment[]; refunds: Refund[]; handovers: Handover[] };

const BOOKING_COLS = `id, ref, status, starts_at, ends_at, hold_expires_at, delivery, address, contact_phone, delivery_slot, collection_slot,
  rider_name, rider_phone, days, rental_kobo, protection_kobo, delivery_kobo, deposit_kobo, total_kobo, protection_rate, not_included,
  needs_refund, confirmed_at, cancelled_at, created_at, updated_at,
  booking_items(id, item_id, unit_id, item_name, day_rate_kobo, days, rental_kobo, deposit_kobo, kind, items(photos, category_key, in_the_box), units(serial, tag))`;

const LIST_KEY = 'deloo.bookings.cache';

/** The renter's own bookings, newest first. Falls back to the last saved list when offline. */
export async function listBookings(): Promise<{ list: Booking[]; savedAt?: string; offline: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user.id;
  const { data, error } = await supabase.from('bookings').select(BOOKING_COLS)
    .eq('renter_id', uid ?? '').order('created_at', { ascending: false }).limit(100);
  if (error) {
    try {
      const raw = localStorage.getItem(LIST_KEY);
      if (raw && isOffline(error)) { const c = JSON.parse(raw) as { at: string; list: Booking[] }; return { list: c.list, savedAt: c.at, offline: true }; }
    } catch { /* fall through */ }
    throw error;
  }
  const list = (data ?? []) as unknown as Booking[];
  try { localStorage.setItem(LIST_KEY, JSON.stringify({ at: new Date().toISOString(), list })); } catch { /* ignore */ }
  return { list, offline: false };
}

/** One booking with its payments, refunds and handover evidence (RLS: own rows). */
export async function getBooking(id: string): Promise<BookingDetail | null> {
  const { data, error } = await supabase.from('bookings').select(`${BOOKING_COLS},
    payments(id, reference, amount_kobo, status, channel, purpose, paid_at, created_at),
    refunds(id, purpose, amount_kobo, status, reason, processed_at, created_at),
    handovers(id, kind, party, problem_note, result, confirmed_at, created_at, handover_media(id, shot, media_type, storage_path, unit_id, captured_at))`)
    .eq('id', id).maybeSingle();
  if (error) {
    // Offline: the list cache has everything but payments and evidence.
    const cached = isOffline(error) ? cachedBooking(id) : null;
    if (cached) return { ...cached, payments: [], refunds: [], handovers: [] };
    throw error;
  }
  return (data as unknown as BookingDetail) ?? null;
}

function cachedBooking(id: string): Booking | null {
  try { const raw = localStorage.getItem(LIST_KEY); return raw ? (JSON.parse(raw) as { list: Booking[] }).list.find((b) => b.id === id) ?? null : null; } catch { return null; }
}

/** Just the status (payment polling). */
export async function bookingStatus(id: string) {
  const { data, error } = await supabase.from('bookings').select('status, needs_refund, hold_expires_at').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as { status: BookingStatus; needs_refund: boolean; hold_expires_at: string | null } | null;
}

export async function quoteCancellation(id: string) {
  const { data, error } = await supabase.rpc('quote_cancellation', { p_booking: id });
  if (error) throw error;
  return data as { can_cancel: boolean; refund_kobo: number; hours_to_start: number };
}
export async function requestCancellation(id: string, reason: string) {
  const { data, error } = await supabase.rpc('request_cancellation', { p_booking: id, p_reason: reason });
  if (error) throw error;
  return data as { status: 'cancelled'; refund_kobo: number };
}

/** First and last rental day (Lagos) of a booking. */
export function bookingDays(b: Pick<Booking, 'starts_at' | 'ends_at'>) {
  const { first, last } = windowDays(b.starts_at, b.ends_at);
  return { first: first ?? b.starts_at.slice(0, 10), last: last ?? first ?? b.starts_at.slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Tracker stages (contract: booking_stage; PRD §6.1). Display stages are worked out from time.
// ---------------------------------------------------------------------------
export type Stage = BookingStatus | 'in_use' | 'return_due';

/** Same rule as the server's booking_stage: "Return due" from 6pm on the last day. */
export function stageOf(b: Pick<Booking, 'status' | 'starts_at' | 'ends_at'>, now = Date.now()): Stage {
  if (b.status === 'delivered' && now >= Date.parse(b.ends_at) - 6 * 3.6e6) return 'return_due';
  if (b.status === 'delivered' && now >= Date.parse(b.starts_at)) return 'in_use';
  return b.status;
}

export const STAGE_LABEL: Record<Stage, string> = {
  hold: 'Awaiting payment', confirmed: 'Confirmed', preparing: 'Being prepared', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', in_use: 'In use', return_due: 'Return due', collected: 'Collected', inspected: 'Checked',
  closed: 'Deposit refunded', expired: 'Hold ended', cancelled: 'Cancelled', disputed: 'Being reviewed', returned: 'Returned', out: 'Out',
};

/** The happy path, in order, for the tracker. */
export const TIMELINE: Stage[] = ['confirmed', 'preparing', 'out_for_delivery', 'delivered', 'in_use', 'return_due', 'collected', 'inspected', 'closed'];

export function stageTone(s: Stage): 'available' | 'limited' | 'unavailable' | 'neutral' {
  if (s === 'hold' || s === 'return_due' || s === 'disputed') return 'limited';
  if (s === 'expired' || s === 'cancelled') return 'unavailable';
  if (s === 'closed' || s === 'inspected') return 'neutral';
  return 'available';
}

/** Still going (Active tab), vs. finished (Past tab). A hold counts only while it can still be paid. */
export function isActive(b: Pick<Booking, 'status' | 'hold_expires_at' | 'needs_refund'>) {
  if (b.status === 'hold') return !!b.hold_expires_at && Date.parse(b.hold_expires_at) > Date.now();
  if (b.needs_refund) return true;
  return !['expired', 'cancelled', 'closed', 'returned'].includes(b.status);
}

/** Paid and not given back (success screen, tracker). */
export const PAID: BookingStatus[] = ['confirmed', 'preparing', 'out_for_delivery', 'delivered', 'collected', 'inspected', 'closed', 'disputed'];
