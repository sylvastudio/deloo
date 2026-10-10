import { useEffect, useMemo, useState } from 'react';

import { matchSetup, rentalDays, sizeSetups } from '@/planner';
import type { Alternative, Answers, CatalogueItem, CategoryKey, Level, LineMatch, Offer, SetupMatch } from '@/planner/types';
import type { Draft } from './plan';
import { supabase } from './supabase';

type ItemRow = {
  id: string; vendor_id: string; category_key: string; name: string; specs: Record<string, unknown>; day_rate_kobo: number;
  deposit_kobo: number; technician_required: boolean; risk_tier: number; vendors: { name: string; areas: string[]; approved_at: string | null } | null;
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
    supabase.from('items').select('id, vendor_id, category_key, name, specs, day_rate_kobo, deposit_kobo, technician_required, risk_tier, vendors(name, areas, approved_at)').eq('active', true),
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
  };
}

/** A line after the renter's swap or removal. */
export type ChosenLine = LineMatch & { chosen: Offer[]; swappedTo?: Alternative; removed: boolean };
export type Result = { match: SetupMatch; lines: ChosenLine[]; rentalKobo: number; depositKobo: number; protectionKobo: number; totalKobo: number };

export const PROTECTION_RATE = 0.07;

/** The alternative a saved swap points at: by its item id (survives date changes), or an old saved index. */
export function swapTarget(alternatives: Alternative[], saved: string | undefined): Alternative | undefined {
  if (saved === undefined) return undefined;
  if (/^\d+$/.test(saved)) return alternatives[Number(saved)];
  return alternatives.find((a) => a.offers[0]?.itemId === saved);
}
/** What a swap is saved as: the alternative's first item. */
export const swapId = (alt: Alternative) => alt.offers[0]?.itemId ?? '';

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
    return Object.fromEntries(setups.map((s) => [s.level, matchSetup(s, catalogue, { area: answers.area, days, protectionRate: PROTECTION_RATE })])) as Record<Level, SetupMatch>;
  }, [catalogue, setups, answers.area, startsAt, endsAt]);

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
