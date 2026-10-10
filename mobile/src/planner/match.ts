// Matching: a sized Setup → real catalogue gear, availability, alternatives and totals (PRD §4.3).
//
// The catalogue passed in already carries `freeUnits` for the booking's dates (computed by the
// server from reservations). Matching never invents stock or prices; it only picks from that list.
// Pure TypeScript only: no React Native, Expo or Supabase imports.

import type {
  Alternative,
  Availability,
  CatalogueItem,
  CategoryKey,
  Line,
  LineMatch,
  MatchOptions,
  Offer,
  Setup,
  SetupMatch,
  SpecNeed,
  Unmet,
} from './types';

const HOUR_MS = 3600_000;
const MAX_ALTERNATIVES = 6;

/** Rental length in days: ceil(hours / 24), at least 1. Invalid or missing dates count as 1 day. */
export function rentalDays(startsAt: string | undefined, endsAt: string | undefined): number {
  const s = startsAt ? Date.parse(startsAt) : NaN;
  const e = endsAt ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 1;
  return Math.max(1, Math.ceil((e - s) / HOUR_MS / 24));
}

// ---------------------------------------------------------------------------------------------
// Spec matching
// ---------------------------------------------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

function atLeast(have: unknown, need: number | undefined): boolean {
  return need === undefined || num(have) >= need;
}

/** true → item must be true; false → item must not be true; undefined → anything. */
function flag(have: unknown, need: boolean | undefined): boolean {
  if (need === undefined) return true;
  return need ? have === true : have !== true;
}

/** Does this listing meet every requirement the line sets? "min" fields accept anything better. */
export function meetsSpec(item: CatalogueItem, s: SpecNeed): boolean {
  const p = item.specs;
  if (s.kinds && !s.kinds.includes(String(p.kind))) return false;
  if (!atLeast(p.grade, s.minGrade)) return false;
  if (s.fullFrame && p.full_frame !== true) return false; // full-frame lenses also fit smaller bodies
  if (s.rgb && p.rgb !== true) return false;
  if (s.battery && p.battery !== true) return false;
  if (!atLeast(p.watts, s.minWatts)) return false;
  if (!flag(p.wireless, s.wireless)) return false;
  if (!atLeast(p.persons, s.minPersons)) return false;
  if (!flag(p.usb, s.usb)) return false;
  if (!atLeast(p.channels, s.minChannels)) return false;
  if (s.records && p.records !== true) return false;
  if (!atLeast(p.payload_kg, s.minPayloadKg)) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Pool of free units, shared by all lines of one setup so two lines never count the same unit
// ---------------------------------------------------------------------------------------------

interface Ctx {
  catalogue: CatalogueItem[];
  remaining: Map<string, number>;
  area: string | null;
  days: number;
}

function servesArea(item: CatalogueItem, area: string | null): boolean {
  if (!area) return true; // no area given: no preference
  const a = area.trim().toLowerCase();
  return item.vendorAreas.some((v) => v.trim().toLowerCase() === a);
}

/** Matching listings, best first: approved vendors, then serving the area, then cheapest. */
function candidates(ctx: Ctx, category: CategoryKey, spec: SpecNeed, exclude?: Set<string>): CatalogueItem[] {
  return ctx.catalogue
    .filter((i) => i.category === category && meetsSpec(i, spec) && !exclude?.has(i.id))
    .sort(
      (x, y) =>
        Number(y.vendorApproved) - Number(x.vendorApproved) ||
        Number(servesArea(y, ctx.area)) - Number(servesArea(x, ctx.area)) ||
        x.dayRateKobo - y.dayRateKobo ||
        y.freeUnits - x.freeUnits ||
        (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
    );
}

function offerFor(ctx: Ctx, item: CatalogueItem, units: number): Offer {
  return {
    itemId: item.id,
    vendorId: item.vendorId,
    vendorName: item.vendorName,
    name: item.name,
    category: item.category,
    units,
    dayRateKobo: item.dayRateKobo,
    rentalKobo: item.dayRateKobo * units * ctx.days,
    depositKobo: item.depositKobo * units,
    servesArea: servesArea(item, ctx.area),
    technicianRequired: item.technicianRequired,
    riskTier: item.riskTier,
  };
}

/** Take up to `qty` units from the ranked list, combining listings (and vendors) if needed. */
function allocate(ctx: Ctx, ranked: CatalogueItem[], qty: number, commit: boolean): { offers: Offer[]; units: number } {
  const offers: Offer[] = [];
  let units = 0;
  for (const item of ranked) {
    if (units >= qty) break;
    const free = ctx.remaining.get(item.id) ?? 0;
    if (free <= 0) continue;
    const take = Math.min(free, qty - units);
    offers.push(offerFor(ctx, item, take));
    units += take;
    if (commit) ctx.remaining.set(item.id, free - take);
  }
  return { offers, units };
}

const sumRental = (offers: Offer[]) => offers.reduce((s, o) => s + o.rentalKobo, 0);
const sumDeposit = (offers: Offer[]) => offers.reduce((s, o) => s + o.depositKobo, 0);

// ---------------------------------------------------------------------------------------------
// Alternatives, in PRD §4.3 order
// ---------------------------------------------------------------------------------------------

interface Variant {
  category: CategoryKey;
  spec: SpecNeed;
  /** Units needed per unit of the original line. */
  factor: number;
  trade: string;
}

/** 2. Equivalent items: a slightly different item that does the same job. */
function equivalents(line: Line): Variant[] {
  const s = line.spec;
  const v: Variant[] = [];
  switch (line.category) {
    case 'camera':
      if (s.minGrade && s.minGrade > 1)
        v.push({ category: 'camera', spec: { ...s, minGrade: s.minGrade - 1 }, factor: 1, trade: 'A step-down camera · a little less low light and colour' });
      break;
    case 'lens':
      if (s.kinds?.includes('zoom')) v.push({ category: 'lens', spec: { kinds: ['prime'], fullFrame: s.fullFrame }, factor: 1, trade: 'A prime instead · walk closer instead of zooming' });
      else {
        if (s.minGrade) v.push({ category: 'lens', spec: { kinds: ['prime'], fullFrame: s.fullFrame }, factor: 1, trade: 'A simpler prime · a little less background blur' });
        v.push({ category: 'lens', spec: { kinds: ['zoom'], fullFrame: s.fullFrame }, factor: 1, trade: 'The 24–70 zoom instead · one lens for every framing' });
      }
      break;
    case 'light':
      if (s.rgb) v.push({ category: 'light', spec: { rgb: true }, factor: 1, trade: 'Another colour light' });
      else if (s.battery) v.push({ category: 'light', spec: { battery: true }, factor: 1, trade: 'Another battery light · a different size or softness' });
      else v.push({ category: 'light', spec: {}, factor: 1, trade: 'Another light · may be smaller, so place it closer' });
      break;
    case 'mic':
      if (s.kinds?.includes('podcast') && s.usb) v.push({ category: 'mic', spec: { kinds: ['podcast'] }, factor: 1, trade: 'The XLR PodMic · needs the podcast mixer or an audio interface' });
      else if (s.kinds?.includes('podcast')) v.push({ category: 'mic', spec: { kinds: ['lavalier'], wireless: true }, factor: 0.5, trade: 'Clip-on wireless mics instead · less "studio" look, just as clear' });
      else if (s.kinds?.includes('lavalier')) v.push({ category: 'mic', spec: { kinds: ['podcast'] }, factor: 2, trade: 'Desk mics instead · great when people stay seated' });
      break;
    case 'gimbal':
      if (s.minPayloadKg && s.minPayloadKg > 2) v.push({ category: 'gimbal', spec: { minPayloadKg: 2 }, factor: 1, trade: 'A lighter gimbal · fine with a small lens, not a heavy zoom' });
      break;
    case 'grip':
      if (s.kinds?.includes('c_stand')) v.push({ category: 'grip', spec: {}, factor: 1, trade: 'Another stand' });
      break;
  }
  return v;
}

const NO_WIDE_SWAP = new Set<CategoryKey>(['grip', 'mic', 'backdrop']);

/**
 * What changes if the renter takes `item` instead: against the item they have now (`base`), or the
 * plan's need when nothing is free. Plain, concrete words, at most two.
 */
function differences(item: CatalogueItem, base: CatalogueItem | undefined, need: SpecNeed): string[] {
  const p = item.specs, b = base?.specs ?? {};
  const out: string[] = [];
  const ff = (v: unknown) => v === true;
  switch (item.category) {
    case 'camera':
      if (ff(p.full_frame) && (base ? !ff(b.full_frame) : !need.fullFrame)) out.push('Full frame · better in low light');
      else if (!ff(p.full_frame) && (base ? ff(b.full_frame) : need.fullFrame)) out.push('Smaller sensor · a little less low light and background blur');
      if (p.kind === 'cinema' && b.kind !== 'cinema') out.push('Cinema body · records for hours without overheating');
      else if (p.kind !== 'cinema' && b.kind === 'cinema') out.push('Lighter body · shorter recording limits');
      break;
    case 'lens':
      if (p.kind === 'zoom' && b.kind !== 'zoom') out.push(`${p.focal_mm}mm zoom · one lens for every framing`);
      else if (p.kind === 'prime') out.push(`${p.focal_mm}mm prime · ${num(p.focal_mm) >= 70 ? 'tight portraits, soft background' : num(p.focal_mm) <= 24 ? 'wide, fits small rooms' : 'natural view, walk closer to frame'}`);
      if (!ff(p.full_frame) && (need.fullFrame || ff(b.full_frame))) out.push('only fits the FX30 and ZV-E10');
      break;
    case 'light': {
      const w = num(p.watts), bw = num(b.watts);
      if (Number.isFinite(w) && Number.isFinite(bw) && w > bw * 1.5) out.push(`Brighter (${w} W)`);
      else if (Number.isFinite(w) && Number.isFinite(bw) && w < bw / 1.5) out.push(`Smaller (${w} W) · place it closer`);
      if (p.rgb === true && b.rgb !== true) out.push('any colour');
      if (p.battery === true && b.battery !== true) out.push('runs on battery, no socket needed');
      else if (p.battery !== true && (b.battery === true || need.battery)) out.push('needs a power socket');
      break;
    }
    case 'gimbal': {
      const kg = num(p.payload_kg);
      if (Number.isFinite(kg)) out.push(kg > num(b.payload_kg) ? `Carries up to ${kg} kg · any lens` : `Carries up to ${kg} kg · small lenses only`);
      break;
    }
  }
  if (!out.length) out.push(meetsSpec(item, need) ? 'Does the same job' : 'A different take on what we planned');
  return out.slice(0, 2);
}

/** 3. A different approach (several categories together). None for the shoot catalogue yet. */
function approaches(_line: Line): { parts: Variant[]; trade: string }[] {
  return [];
}

function alternativesFor(ctx: Ctx, line: Line, chosen: Offer[], strict: CatalogueItem[], found: number, stocked: boolean): Alternative[] {
  const current = sumRental(chosen);
  const alts: Alternative[] = [];
  const need = line.qty;

  // 1. The same spec from a vendor not already used for this line.
  const usedVendors = new Set(chosen.map((o) => o.vendorId));
  const otherVendors: string[] = [];
  for (const i of strict) if (!usedVendors.has(i.vendorId) && !otherVendors.includes(i.vendorId)) otherVendors.push(i.vendorId);
  for (const vid of otherVendors) {
    const { offers, units } = allocate(ctx, strict.filter((i) => i.vendorId === vid), need, false);
    if (units === 0) continue;
    const o = offers[0];
    const parts = [`Same from ${o.vendorName}`];
    if (!o.servesArea && ctx.area) parts.push(`doesn't usually serve ${ctx.area}`);
    if (units < need) parts.push(`only ${units} free`);
    alts.push({ kind: 'other_vendor', trade: parts.join(' · '), offers, units, complete: units >= need, priceDeltaKobo: sumRental(offers) - current });
  }

  // 2. Equivalent items (excluding listings that already meet the strict spec: those are option 1).
  const strictIds = new Set(strict.map((i) => i.id));
  for (const v of equivalents(line)) {
    const want = Math.ceil(need * v.factor);
    const { offers, units } = allocate(ctx, candidates(ctx, v.category, v.spec, strictIds), want, false);
    if (units === 0) continue;
    alts.push({ kind: 'equivalent', trade: v.trade + (units < want ? ` · only ${units} free` : ''), offers, units, complete: units >= want, priceDeltaKobo: sumRental(offers) - current });
  }

  // 2b. Anything else we stock in this category, one option per item (cheapest first), so Swap always
  // shows real choices, including a cheaper one. Skips what's already chosen or offered above, and
  // categories where "anything else" is nonsense (a backdrop kit is not a C-stand, a desk mic not a lav).
  if (!NO_WIDE_SWAP.has(line.category)) {
    const offered = new Set([...chosen, ...alts.flatMap((a) => a.offers)].map((o) => o.itemId));
    const base = ctx.catalogue.find((i) => i.id === chosen[0]?.itemId);
    for (const item of candidates(ctx, line.category, {}, offered)) {
      const { offers, units } = allocate(ctx, [item], need, false);
      if (units === 0) continue;
      const parts = differences(item, base, line.spec);
      if (units < need) parts.push(`only ${units} free`);
      alts.push({ kind: 'equivalent', trade: parts.join(' · '), offers, units, complete: units >= need, priceDeltaKobo: sumRental(offers) - current, fits: meetsSpec(item, line.spec) });
    }
  }

  // 3. A different approach (several categories together).
  for (const a of approaches(line)) {
    const offers: Offer[] = [];
    let complete = true;
    let units = 0;
    for (const p of a.parts) {
      const want = Math.max(1, Math.ceil(need * p.factor));
      const r = allocate(ctx, candidates(ctx, p.category, p.spec), want, false);
      offers.push(...r.offers);
      units += r.units;
      if (r.units < want) complete = false;
    }
    if (offers.length === 0) continue;
    alts.push({ kind: 'different_approach', trade: a.trade, offers, units, complete, priceDeltaKobo: sumRental(offers) - current });
  }

  // Complete options first; keep PRD order within each (stable sort).
  alts.sort((x, y) => Number(y.complete) - Number(x.complete));
  const out = alts.slice(0, MAX_ALTERNATIVES);

  // 4. Nearby date: we only know this date's stock, so flag it for the app to re-check. Only when we
  // stock it at all; other dates won't help with something we don't have.
  if (found < need && stocked) {
    out.push({ kind: 'nearby_date', trade: 'Try other dates · it may be free a day earlier or later', offers: [], units: 0, complete: false, priceDeltaKobo: null });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

const CATEGORY_WORD: Record<CategoryKey, string> = {
  camera: 'camera',
  lens: 'lens',
  gimbal: 'gimbal',
  light: 'lights',
  mic: 'mics',
  mixer: 'mixer',
  headphones: 'headphones',
  grip: 'stands',
  backdrop: 'backdrop',
};

function words(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function matchSetup(setup: Setup, catalogue: CatalogueItem[], opts: MatchOptions): SetupMatch {
  const days = Math.max(1, Math.ceil(opts.days || 1));
  const rate = opts.protectionRate ?? 0.07;
  const area = opts.area && opts.area !== 'unsure' && opts.area.trim() ? opts.area.trim() : null;
  const ctx: Ctx = {
    catalogue,
    remaining: new Map(catalogue.map((i) => [i.id, Math.max(0, i.freeUnits)])),
    area,
    days,
  };

  // Pass 1: allocate every line from the shared pool, in setup order.
  const firstPass = setup.lines.map((line) => {
    const strict = candidates(ctx, line.category, line.spec);
    const { offers, units } = allocate(ctx, strict, line.qty, true);
    return { line, strict, offers, units };
  });

  // Pass 2: status and alternatives against what is left after the whole setup is allocated.
  const lines: LineMatch[] = firstPass.map(({ line, strict, offers, units }) => {
    const spare = strict.reduce((s, i) => s + (ctx.remaining.get(i.id) ?? 0), 0);
    // Limited: short of the quantity, or so tight that one more booking would break it.
    const status: Availability = units === 0 ? 'unavailable' : units < line.qty || spare <= 1 ? 'limited' : 'available';
    // Stocked: some listing fits at all, whatever the dates. Otherwise it's "we don't have this yet".
    const stocked = strict.some((i) => i.totalUnits > 0);
    return {
      line,
      offers,
      unitsFound: units,
      status,
      shortReason: units < line.qty ? (stocked ? 'booked' : 'not_stocked') : undefined,
      alternatives: alternativesFor(ctx, line, offers, strict, units, stocked),
      technicianRequired: offers.some((o) => o.technicianRequired),
      rentalKobo: sumRental(offers),
      depositKobo: sumDeposit(offers),
    };
  });

  const unmet: Unmet[] = lines
    .filter((m) => m.unitsFound < m.line.qty)
    .map((m) => ({
      lineKey: m.line.key,
      category: m.line.category,
      spec: m.line.spec,
      qty: m.line.qty - m.unitsFound,
      area: area ?? '',
      reason: m.shortReason ?? 'booked',
      hasAlternatives: m.alternatives.some((a) => a.kind !== 'nearby_date'),
    }));

  const rentalKobo = lines.reduce((s, m) => s + m.rentalKobo, 0);
  const depositKobo = lines.reduce((s, m) => s + m.depositKobo, 0);
  const protectionKobo = Math.round(rentalKobo * rate);

  // Technician: on and locked for listings marked technician-required.
  const forced: string[] = [];
  for (const m of lines) {
    const w = CATEGORY_WORD[m.line.category];
    if (m.technicianRequired && !forced.includes(w)) forced.push(w);
  }
  const technicianNote = forced.length ? `Includes a technician, required for the ${words(forced)}.` : null;

  const status: Availability = lines.some((m) => m.line.essential && m.status === 'unavailable')
    ? 'unavailable'
    : lines.some((m) => m.status !== 'available')
      ? 'limited'
      : 'available';

  return {
    level: setup.level,
    days,
    lines,
    totals: { rentalKobo, depositKobo, protectionKobo, totalKobo: rentalKobo + depositKobo + protectionKobo, technicianNote },
    unmet,
    status,
  };
}
