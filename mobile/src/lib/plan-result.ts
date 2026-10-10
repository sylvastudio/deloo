import { useEffect, useMemo, useState } from 'react';

import { matchSetup, rentalDays, sizeSetups, swapId, swapTarget } from '@/planner';
import type { Alternative, Answers, CatalogueItem, CategoryKey, Level, LineMatch, Offer, SetupMatch } from '@/planner/types';
import { addDays, lagosToday } from '@/ui/date-range';
import { shootWindow } from './intake';
import type { Draft } from './plan';
import { supabase } from './supabase';

export { swapId, swapTarget };

type ItemRow = {
  id: string; vendor_id: string; category_key: string; name: string; specs: Record<string, unknown>; day_rate_kobo: number;
  deposit_kobo: number; technician_required: boolean; risk_tier: number; photos: string[] | null; vendors: { name: string; areas: string[]; approved_at: string | null } | null;
};

const cache = new Map<string, { at: number; items: CatalogueItem[] }>();

/**
 * Public catalogue with free units for the event window (0008 free_units). Without dates every unit
 * counts as free and `datesKnown` is false, so R6 can say availability is unchecked.
 */
export async function loadCatalogue(startsAt?: string, endsAt?: string): Promise<CatalogueItem[]> {
  const key = `${startsAt ?? ''}|${endsAt ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.items;
  const [{ data: items, error }, free] = await Promise.all([
    supabase.from('items').select('id, vendor_id, category_key, name, specs, day_rate_kobo, deposit_kobo, technician_required, risk_tier, photos, vendors(name, areas, approved_at)').eq('active', true),
    startsAt && endsAt ? supabase.rpc('free_units', { p_from: startsAt, p_to: endsAt }) : Promise.resolve({ data: null, error: null }),
  ]);
  if (error) throw new Error('Couldn’t load gear. Check your connection.');
  const counts = new Map<string, { free: number; total: number }>(((free.data as { item_id: string; free: number; total: number }[] | null) ?? []).map((r) => [r.item_id, r]));
  const out = ((items ?? []) as unknown as ItemRow[]).map((i): CatalogueItem => {
    const n = counts.get(i.id);
    return {
      id: i.id, vendorId: i.vendor_id, vendorName: i.vendors?.name ?? '', vendorAreas: i.vendors?.areas ?? [], vendorApproved: !!i.vendors?.approved_at,
      category: i.category_key as CategoryKey, name: i.name, specs: i.specs ?? {}, dayRateKobo: i.day_rate_kobo, depositKobo: i.deposit_kobo,
      technicianRequired: i.technician_required, riskTier: (i.risk_tier as 1 | 2 | 3) ?? 1,
      // With dates: the server's count. Without: assume free (R6 labels it unchecked).
      freeUnits: startsAt && endsAt ? (n?.free ?? 0) : 99, totalUnits: n?.total ?? 1,
      ...(i.photos?.[0] ? { photo: i.photos[0] } : {}),
    };
  });
  cache.set(key, { at: Date.now(), items: out });
  return out;
}

const asString = (v: unknown) => (typeof v === 'string' && v !== 'unsure' ? v : undefined);
/** Fill required gaps with "unsure" so the rules apply their safe defaults (and say so). */
export function completeAnswers(a: Partial<Answers>): Answers {
  return {
    shootType: a.shootType ?? 'unsure', location: a.location ?? 'unsure', timeOfDay: a.timeOfDay ?? 'unsure',
    people: a.people ?? 'unsure', angles: a.angles ?? 'unsure', sound: a.sound ?? 'unsure', movement: a.movement ?? 'unsure',
    startsAt: a.startsAt ?? 'unsure', endsAt: a.endsAt ?? 'unsure', area: a.area ?? 'unsure', budget: a.budget ?? 'options',
    budgetKobo: a.budgetKobo, delivery: a.delivery, days: a.days, pinnedNames: a.pinnedNames,
  };
}

/** A line after the renter's swap or removal. */
export type ChosenLine = LineMatch & { chosen: Offer[]; swappedTo?: Alternative; removed: boolean };
export type Result = { match: SetupMatch; lines: ChosenLine[]; rentalKobo: number; depositKobo: number; protectionKobo: number; totalKobo: number };

export const PROTECTION_RATE = 0.07;


/** Applies swaps (line key → alternative's item id) and removals, and recomputes the totals. */
export function applyChoices(match: SetupMatch, draft: Pick<Draft, 'swaps' | 'removed'>): Result {
  const lines: ChosenLine[] = match.lines.map((l) => {
    const removed = draft.removed.includes(l.line.key);
    const alt = swapTarget(l.alternatives, draft.swaps[l.line.key]);
    return { ...l, removed, swappedTo: alt, chosen: removed ? [] : alt ? alt.offers : l.offers };
  });
  const rentalKobo = lines.reduce((s, l) => s + l.chosen.reduce((t, o) => t + o.rentalKobo, 0), 0);
  const depositKobo = lines.reduce((s, l) => s + l.chosen.reduce((t, o) => t + o.depositKobo, 0), 0);
  const protectionKobo = Math.round(rentalKobo * PROTECTION_RATE);
  return { match, lines, rentalKobo, depositKobo, protectionKobo, totalKobo: rentalKobo + depositKobo + protectionKobo };
}

/** Sizes all three levels and matches them to live availability. */
export function usePlanResult(draft: Draft) {
  const answers = useMemo(() => completeAnswers(draft.answers), [draft.answers]);
  const startsAt = asString(answers.startsAt), endsAt = asString(answers.endsAt);
  const [catalogue, setCatalogue] = useState<CatalogueItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setError('');
    loadCatalogue(startsAt, endsAt).then((c) => { if (live) setCatalogue(c); }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [startsAt, endsAt]);

  const setups = useMemo(() => sizeSetups(answers), [answers]);
  const matches = useMemo(() => {
    if (!catalogue) return null;
    const days = rentalDays(startsAt, endsAt);
    return Object.fromEntries(setups.map((s) => [s.level, matchSetup(s, catalogue, { area: answers.area, days, protectionRate: PROTECTION_RATE, pinned: answers.pinnedNames })])) as Record<Level, SetupMatch>;
  }, [catalogue, setups, answers.area, answers.pinnedNames, startsAt, endsAt]);

  return { answers, setups, matches, datesKnown: !!(startsAt && endsAt), error, retry: () => { cache.clear(); setCatalogue(null); loadCatalogue(startsAt, endsAt).then(setCatalogue).catch((e: Error) => setError(e.message)); } };
}

/**
 * Saves the event and its three recommendations once, and records what we couldn't supply (unmet demand)
 * so Ops knows what to source. Returns the event id.
 */
export async function saveEvent(draft: Draft, matches: Record<Level, SetupMatch>, rulesVersion: string, eventId?: string): Promise<string | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return eventId;
  const a = draft.answers;
  if (eventId) return eventId;
  const { data: ev } = await supabase.from('events').insert({
    raw_text: draft.rawText, answers: a, area: asString(a.area) ?? '',
    starts_at: asString(a.startsAt) ?? null, ends_at: asString(a.endsAt) ?? null,
  }).select('id').single();
  if (!ev) return undefined;
  await supabase.from('recommendations').insert((Object.values(matches)).map((m) => ({
    event_id: ev.id, level: m.level, rules_version: rulesVersion,
    lines: m.lines.map((l) => ({ key: l.line.key, category: l.line.category, qty: l.line.qty, status: l.status, short: l.shortReason ?? null, offers: l.offers.map((o) => ({ item: o.itemId, units: o.units })) })),
  })));
  const better = matches.better ?? Object.values(matches)[0];
  const period = asString(a.startsAt) && asString(a.endsAt) ? `[${a.startsAt},${a.endsAt})` : null;
  if (better.unmet.length) {
    await supabase.from('unmet_demand').insert(better.unmet.map((u) => ({
      event_id: ev.id, category_key: u.category, spec: { ...u.spec, reason: u.reason }, quantity: u.qty, period, area: u.area,
    })));
  }
  return ev.id;
}

// ---------------------------------------------------------------------------------------------
// "Free if you shift a day" (0016 nearest_free_windows)
// ---------------------------------------------------------------------------------------------

export type Want = { itemId: string; units: number };
export type FreeWindow = { first: string; last: string };

/**
 * What a plan needs to be whole: lines that got everything keep their chosen gear; short lines
 * want what would fill them (the nearby_date alternative's listings). Removed lines are skipped.
 */
export function wantedItems(lines: (LineMatch & { chosen: Offer[]; removed: boolean })[]): Want[] {
  const by = new Map<string, number>();
  for (const l of lines) {
    if (l.removed) continue;
    const have = l.chosen.reduce((n, o) => n + o.units, 0);
    const wants: Want[] = have >= l.line.qty ? l.chosen.map((o) => ({ itemId: o.itemId, units: o.units }))
      : (l.alternatives.find((a) => a.kind === 'nearby_date')?.wants ?? l.chosen.map((o) => ({ itemId: o.itemId, units: o.units })));
    for (const w of wants) by.set(w.itemId, (by.get(w.itemId) ?? 0) + w.units);
  }
  return [...by].map(([itemId, units]) => ({ itemId, units }));
}

const freeCache = new Map<string, { at: number; window: FreeWindow | null }>();

/**
 * The nearest window of the same length (within 3 days either side, never before tomorrow) where all
 * of `wants` is free, other than the current one. null while loading, when none, or offline.
 */
export function useNearestFree(wants: Want[] | null, first: string | undefined, days: number): FreeWindow | null {
  const key = wants && first ? `${first}|${days}|${wants.map((w) => `${w.itemId}x${w.units}`).sort().join(',')}` : '';
  const [found, setFound] = useState<{ key: string; window: FreeWindow | null } | null>(null);
  useEffect(() => {
    if (!key || !wants?.length || !first) return;
    const hit = freeCache.get(key);
    if (hit && Date.now() - hit.at < 60_000) { setFound({ key, window: hit.window }); return; }
    let live = true;
    supabase.rpc('nearest_free_windows', { p_items: wants.map((w) => w.itemId), p_qty: wants.map((w) => w.units), p_days: days, p_around: first, p_radius: 3 })
      .then(({ data, error }) => {
        if (error) return; // older database without 0016, or offline: no banner
        const row = ((data as { first: string; last: string; missing: number }[] | null) ?? []).find((r) => r.missing === 0 && r.first !== first && r.first > lagosToday());
        const window = row ? { first: row.first, last: row.last } : null;
        freeCache.set(key, { at: Date.now(), window });
        if (live) setFound({ key, window });
      });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return found?.key === key ? found.window : null;
}

const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
/** "Sun 19 – Tue 21 Oct", or "Sun 19 Oct" for one day. */
export function windowLabel(w: FreeWindow): string {
  const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
  const end = `${SHORT_DAY.format(d(w.last))} ${MONTH.format(d(w.last))}`;
  if (w.first === w.last) return end;
  const sameMonth = w.first.slice(0, 7) === w.last.slice(0, 7);
  return `${SHORT_DAY.format(d(w.first))}${sameMonth ? '' : ` ${MONTH.format(d(w.first))}`} – ${end}`;
}

/** The plan's dates moved to `w` (same convention as the free-text reader). */
export const windowAnswers = (w: FreeWindow) => shootWindow(w.first, w.last);

// ---------------------------------------------------------------------------------------------
// AI fallback reader (app/api/plan/read, behind AI_READ=on on the server)
// ---------------------------------------------------------------------------------------------

const API = (process.env.EXPO_PUBLIC_API_URL ?? 'https://deloo.space').replace(/\/$/, '');
const SLANG = /\b(abeg|wahala|dey|una|oga|sha|wetin|biko|na im|e go|pls|plz|u|ur|gonna|wanna|asap|tmrw|wknd|owambe|abi|sef|jare|nau)\b/i;

/** Ask the server's reader when the phone's rules left required answers empty, or the words are long or slangy. */
export function wantsAiRead(text: string, missingRequired: number): boolean {
  return missingRequired > 0 || text.length > 140 || SLANG.test(text);
}

/**
 * The server reader's answers for `text`, as planner answers, or null (off, offline, slow: 7 s, signed out).
 * Never throws. The caller merges only answers that are still empty.
 */
export async function aiRead(text: string): Promise<Partial<Answers> | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const clean = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?\d[\d\s-]{8,}\d/g, '[phone]');
    const res = await fetch(`${API}/api/plan/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: clean, today: lagosToday(), tz: 'Africa/Lagos' }), signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const { answers: r } = (await res.json()) as { answers?: Record<string, unknown> };
    if (!r || typeof r !== 'object') return null;
    const out: Partial<Answers> = {};
    for (const k of ['shootType', 'location', 'timeOfDay', 'sound', 'area', 'budget', 'delivery'] as const) {
      if (typeof r[k] === 'string') (out as Record<string, unknown>)[k] = r[k];
    }
    for (const k of ['people', 'angles', 'days', 'budgetKobo'] as const) if (typeof r[k] === 'number') out[k] = r[k] as number;
    if (typeof r.movement === 'boolean') out.movement = r.movement;
    if (Array.isArray(r.pinnedNames)) out.pinnedNames = r.pinnedNames.filter((n): n is string => typeof n === 'string');
    if (typeof r.first === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.first)) {
      const first = r.first < addDays(lagosToday(), 1) ? addDays(lagosToday(), 1) : r.first;
      const last = typeof r.last === 'string' && r.last >= first ? r.last : first;
      Object.assign(out, shootWindow(first, last));
    }
    return out;
  } catch {
    return null;
  }
}
