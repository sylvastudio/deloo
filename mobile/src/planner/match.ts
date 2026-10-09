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

/** No spec_schema key for this yet (founder: add `line_array` to the speaker schema); fall back to the name. */
export function isLineArray(item: CatalogueItem): boolean {
  return item.specs.line_array === true || /line array/i.test(item.name);
}

function atLeast(have: unknown, need: number | undefined): boolean {
  return need === undefined || num(have) >= need;
}

/** true → item must be true; false → item must not be true; undefined → anything. */
function flag(have: unknown, need: boolean | undefined): boolean {
  if (need === undefined) return true;
  return need ? have === true : have !== true;
}

/** Does this listing meet every requirement the line sets? "min" fields accept anything bigger. */
export function meetsSpec(item: CatalogueItem, s: SpecNeed): boolean {
  const p = item.specs;
  if (!atLeast(p.watts, s.minWatts)) return false;
  if (!atLeast(p.size_in, s.minSizeIn)) return false;
  if (!atLeast(p.size_in, s.minScreenIn)) return false;
  if (!flag(p.powered, s.powered)) return false;
  if (s.lineArray !== undefined && isLineArray(item) !== s.lineArray) return false;
  if (s.kinds && !s.kinds.includes(String(p.kind))) return false;
  if (!flag(p.wireless, s.wireless)) return false;
  if (!atLeast(p.channels, s.minChannels)) return false;
  if (!flag(p.digital, s.digital)) return false;
  if (!atLeast(p.width_ft, s.minWidthFt)) return false;
  if (!atLeast(p.height_ft, s.minHeightFt)) return false;
  if (s.outdoor && p.outdoor !== true) return false; // indoor lines accept outdoor walls too
  if (!atLeast(p.lumens, s.minLumens)) return false;
  if (s.resolution === '4k' && p.resolution !== '4k') return false;
  if (s.resolution === '1080p' && p.resolution !== '1080p' && p.resolution !== '4k') return false;
  if (!atLeast(p.inputs, s.minInputs)) return false;
  if (s.streams && p.streams !== true) return false;
  if (s.bonded && p.bonded !== true) return false;
  if (!atLeast(p.kva, s.minKva)) return false;
  if (s.silent && p.silent !== true) return false;
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
    technicianRequired: item.technicianRequired || item.riskTier === 3,
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
    case 'speaker':
      // Two smaller speakers do the job of one big one.
      if (!s.lineArray && s.minWatts)
        v.push({ category: 'speaker', spec: { powered: true, lineArray: false, minWatts: s.minWatts / 2 }, factor: 2, trade: '2 smaller speakers for each big one · same coverage, more to set up' });
      break;
    case 'subwoofer':
      if (s.minWatts) v.push({ category: 'subwoofer', spec: { minWatts: s.minWatts / 2 }, factor: 2, trade: '2 smaller subwoofers for each big one · same bass, more to carry' });
      break;
    case 'monitor':
      v.push({ category: 'speaker', spec: { powered: true, lineArray: false }, factor: 1, trade: 'A normal speaker used as a monitor · works, takes more floor space' });
      break;
    case 'mic':
      if (s.wireless) v.push({ category: 'mic', spec: { wireless: false }, factor: 1, trade: 'Wired mic · on a cable, so the speaker stays near the stand' });
      else v.push({ category: 'mic', spec: { wireless: true }, factor: 1, trade: 'Wireless mic instead · more freedom, costs a little more' });
      break;
    case 'mixer':
      if (s.digital) v.push({ category: 'mixer', spec: { minChannels: s.minChannels }, factor: 1, trade: "Analogue mixer · works, but settings can't be saved" });
      break;
    case 'led_wall':
      // A bigger wall already matches (sizes are minimums); the equivalent is one a bit smaller.
      if (s.minWidthFt && s.minHeightFt)
        v.push({ category: 'led_wall', spec: { ...s, minWidthFt: Math.floor(s.minWidthFt * 0.75), minHeightFt: Math.floor(s.minHeightFt * 0.75) }, factor: 1, trade: 'A smaller LED wall · harder to read from the back' });
      break;
    case 'projector':
      if (s.minLumens) v.push({ category: 'projector', spec: { minLumens: Math.round(s.minLumens * 0.7) }, factor: 1, trade: 'A dimmer projector · turn off the lights near the screen' });
      break;
    case 'projection_screen':
      if (s.minHeightFt) v.push({ category: 'projection_screen', spec: { minHeightFt: s.minHeightFt - 1.5 }, factor: 1, trade: 'A smaller screen · harder to read from the back rows' });
      break;
    case 'tv':
      if (s.minScreenIn) v.push({ category: 'tv', spec: { minScreenIn: s.minScreenIn - 20 }, factor: 1, trade: 'A smaller TV · fine up close' });
      break;
    case 'camera':
      if (s.resolution === '4k') v.push({ category: 'camera', spec: { ...s, resolution: '1080p' }, factor: 1, trade: 'HD instead of 4K · fine for streaming' });
      if (s.kinds?.length === 1 && s.kinds[0] === 'ptz') v.push({ category: 'camera', spec: { kinds: ['camcorder', 'dslr', 'cinema'] }, factor: 1, trade: 'A camera with an operator instead of remote control' });
      break;
    case 'switcher':
      if (s.streams) v.push({ category: 'switcher', spec: { minInputs: s.minInputs }, factor: 1, trade: 'A switcher that streams through a laptop · one more thing to set up' });
      break;
    case 'streaming_kit':
      if (s.bonded) v.push({ category: 'streaming_kit', spec: {}, factor: 1, trade: 'A 4G router · may drop if the signal is weak' });
      break;
    case 'light':
      if (s.kinds?.includes('moving_head')) v.push({ category: 'light', spec: { kinds: ['par', 'wash'] }, factor: 1, trade: 'Static colour lights · less movement, cheaper' });
      else v.push({ category: 'light', spec: { kinds: ['moving_head'] }, factor: 1, trade: 'Moving heads used as stage wash · costs more' });
      break;
    case 'generator':
      // Split the load: sound on one generator, screens and lights on the other.
      if (s.minKva && s.minKva > 7.5) v.push({ category: 'generator', spec: { minKva: s.minKva / 2 }, factor: 2, trade: '2 smaller generators · sound on one, screens and lights on the other' });
      break;
    case 'avr':
      if (s.minKva && s.minKva > 5) v.push({ category: 'avr', spec: { minKva: s.minKva / 2 }, factor: 2, trade: '2 smaller stabilisers · one per circuit' });
      break;
  }
  return v;
}

/** 3. A different approach. Projector + screen only replaces an LED wall indoors (daylight kills it outside). */
function approaches(line: Line): { parts: Variant[]; trade: string }[] {
  const s = line.spec;
  if (line.category === 'led_wall' && !s.outdoor) {
    return [{
      trade: 'Projector and screen instead · cheaper, but dim the lights near the screen',
      parts: [
        { category: 'projector', spec: { minLumens: 10000 }, factor: 1, trade: '' },
        { category: 'projection_screen', spec: { minHeightFt: s.minHeightFt ?? 7 }, factor: 1, trade: '' },
      ],
    }];
  }
  if (line.category === 'projector') {
    return [{ trade: 'An LED wall instead · bright with the lights on, costs more', parts: [{ category: 'led_wall', spec: { minWidthFt: 10, minHeightFt: 6 }, factor: 1 / line.qty, trade: '' }] }];
  }
  if (line.category === 'tv' && line.key === 'screen.main') {
    return [{
      trade: 'Projector and screen instead · bigger picture, needs the lights down',
      parts: [
        { category: 'projector', spec: { minLumens: 3500 }, factor: 1, trade: '' },
        { category: 'projection_screen', spec: { minHeightFt: 6 }, factor: 1, trade: '' },
      ],
    }];
  }
  if (line.category === 'speaker' && s.lineArray) {
    return [{ trade: 'Box speakers instead of a line array · fine near the front, weaker at the back', parts: [{ category: 'speaker', spec: { powered: true, lineArray: false, minWatts: 1000 }, factor: 1.5, trade: '' }] }];
  }
  return [];
}

function alternativesFor(ctx: Ctx, line: Line, chosen: Offer[], strict: CatalogueItem[], found: number): Alternative[] {
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

  // 4. Nearby date: we only know this date's stock, so flag it for the app to re-check.
  if (found < need) {
    out.push({ kind: 'nearby_date', trade: 'Try a day either side · more owners may be free then', offers: [], units: 0, complete: false, priceDeltaKobo: null });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

const CATEGORY_WORD: Record<CategoryKey, string> = {
  speaker: 'speakers',
  subwoofer: 'subwoofers',
  monitor: 'monitors',
  mic: 'mics',
  mixer: 'mixer',
  led_wall: 'LED wall',
  projector: 'projector',
  projection_screen: 'screen',
  tv: 'TV',
  camera: 'camera',
  switcher: 'switcher',
  streaming_kit: 'streaming kit',
  light: 'lights',
  generator: 'generator',
  avr: 'stabiliser',
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
    return {
      line,
      offers,
      unitsFound: units,
      status,
      alternatives: alternativesFor(ctx, line, offers, strict, units),
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
      hasAlternatives: m.alternatives.some((a) => a.kind !== 'nearby_date'),
    }));

  const rentalKobo = lines.reduce((s, m) => s + m.rentalKobo, 0);
  const depositKobo = lines.reduce((s, m) => s + m.depositKobo, 0);
  const protectionKobo = Math.round(rentalKobo * rate);

  // Technician: on and locked for tier-3 / technician-required gear (inventory decision 4).
  const forced: string[] = [];
  for (const m of lines) {
    const w = CATEGORY_WORD[m.line.category];
    if (m.technicianRequired && !forced.includes(w)) forced.push(w);
  }
  let technicianNote: string | null = null;
  if (forced.length) technicianNote = `Includes a technician, required for the ${words(forced)}.`;
  if (setup.technicianWanted)
    technicianNote = forced.length
      ? `${technicianNote} You asked for a technician for the rest too; turn it on for each owner when you book.`
      : 'You asked for a technician; turn it on for each owner when you book.';

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
