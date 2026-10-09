/// <reference types="node" />
// Run from the repo root: npx tsx --test mobile/src/planner/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  matchSetup,
  meetsSpec,
  rentalDays,
  sizeSetups,
  type CatalogueItem,
  type CategoryKey,
  type Line,
  type Setup,
  type SpecNeed,
} from '../index';

// ---------------------------------------------------------------------------------------------
// Fixture modelled on supabase/demo_catalogue.sql (naira in the table, kobo in the items).
// ---------------------------------------------------------------------------------------------

const VENDORS: Record<number, { name: string; areas: string[] }> = {
  1: { name: 'Lekki Sound & Stage', areas: ['Lekki', 'Ajah', 'Victoria Island', 'Ikoyi'] },
  2: { name: 'Mainland AV Hire', areas: ['Ikeja', 'Maryland', 'Yaba', 'Surulere', 'Ogba', 'Gbagada'] },
  3: { name: 'Living Waters Church Media', areas: ['Gbagada', 'Maryland', 'Magodo'] },
  4: { name: 'Kunle Visuals', areas: ['Yaba', 'Surulere', 'Ikeja'] },
};

type Row = [v: number, cat: CategoryKey, name: string, specs: Record<string, unknown>, rate: number, deposit: number, replacement: number, tech: boolean, qty: number];

const ROWS: Row[] = [
  [1, 'speaker', '15" powered speaker', { watts: 1300, size_in: 15, powered: true }, 25000, 50000, 950000, false, 8],
  [1, 'speaker', '12" powered speaker', { watts: 1300, size_in: 12, powered: true }, 18000, 40000, 800000, false, 6],
  [1, 'speaker', 'Line array box', { watts: 2200, size_in: 10, powered: true }, 60000, 200000, 4500000, true, 8],
  [1, 'subwoofer', '18" powered subwoofer', { watts: 2500, size_in: 18 }, 35000, 80000, 1800000, false, 6],
  [1, 'monitor', 'Stage monitor', { watts: 1100 }, 15000, 30000, 700000, false, 6],
  [1, 'mic', 'Wireless handheld mic', { kind: 'handheld', wireless: true }, 10000, 25000, 450000, false, 12],
  [1, 'mixer', '32-channel digital mixer', { channels: 32, digital: true }, 70000, 0, 4800000, true, 2],
  [1, 'mixer', '16-channel mixer', { channels: 16, digital: false }, 20000, 50000, 650000, false, 3],
  [1, 'led_wall', 'Outdoor LED wall 16×9 ft', { width_ft: 16, height_ft: 9, pitch_mm: 3.9, outdoor: true }, 450000, 0, 22000000, true, 1],
  [1, 'led_wall', 'Indoor LED wall 12×7 ft', { width_ft: 12, height_ft: 7, pitch_mm: 2.6, outdoor: false }, 280000, 0, 14000000, true, 1],
  [1, 'light', 'Moving head light', { kind: 'moving_head', watts: 150 }, 15000, 40000, 750000, false, 8],
  [1, 'light', 'LED par light', { kind: 'par', watts: 40 }, 3000, 5000, 90000, false, 24],
  [1, 'generator', '40 kVA soundproof generator', { kva: 40, silent: true }, 150000, 0, 14000000, true, 1],
  [1, 'avr', '20 kVA stabiliser', { kva: 20 }, 15000, 30000, 450000, false, 3],
  [2, 'speaker', '15" powered speaker', { watts: 1000, size_in: 15, powered: true }, 20000, 40000, 750000, false, 10],
  [2, 'speaker', '10" powered speaker', { watts: 700, size_in: 10, powered: true }, 12000, 25000, 450000, false, 6],
  [2, 'subwoofer', '18" powered subwoofer', { watts: 1020, size_in: 18 }, 28000, 60000, 1300000, false, 4],
  [2, 'monitor', 'Stage monitor', { watts: 550 }, 10000, 20000, 300000, false, 4],
  [2, 'mic', 'Wireless handheld mic', { kind: 'handheld', wireless: true }, 9000, 20000, 400000, false, 10],
  [2, 'mic', 'Wired vocal mic', { kind: 'handheld', wireless: false }, 3000, 8000, 150000, false, 10],
  [2, 'mic', 'Conference gooseneck mic', { kind: 'handheld', wireless: false }, 5000, 10000, 250000, false, 8],
  [2, 'mixer', '16-channel digital mixer', { channels: 16, digital: true }, 35000, 80000, 1200000, false, 2],
  [2, 'mixer', '12-channel mixer', { channels: 12, digital: false }, 15000, 30000, 450000, false, 3],
  [2, 'led_wall', 'Outdoor LED wall 12×8 ft', { width_ft: 12, height_ft: 8, pitch_mm: 4.8, outdoor: true }, 350000, 0, 16000000, true, 1],
  [2, 'projector', 'Projector 5,000 lumens', { lumens: 5000 }, 35000, 80000, 2200000, false, 4],
  [2, 'projector', 'Projector 3,500 lumens', { lumens: 3500 }, 20000, 50000, 700000, false, 4],
  [2, 'projector', 'Projector 10,000 lumens', { lumens: 10000 }, 90000, 0, 9000000, true, 1],
  [2, 'projection_screen', 'Projection screen 10×7.5 ft', { width_ft: 10, height_ft: 7.5 }, 12000, 20000, 350000, false, 4],
  [2, 'projection_screen', 'Tripod screen 8×6 ft', { width_ft: 8, height_ft: 6 }, 6000, 10000, 120000, false, 6],
  [2, 'tv', '75" TV on stand', { size_in: 75 }, 35000, 80000, 1600000, false, 4],
  [2, 'tv', '55" TV on stand', { size_in: 55 }, 20000, 50000, 600000, false, 6],
  [2, 'light', 'LED wash light', { kind: 'wash', watts: 90 }, 5000, 10000, 180000, false, 16],
  [2, 'generator', '20 kVA soundproof generator', { kva: 20, silent: true }, 80000, 0, 9500000, true, 2],
  [2, 'generator', '7.5 kVA generator', { kva: 7.5, silent: false }, 30000, 60000, 1200000, false, 3],
  [2, 'avr', '10 kVA stabiliser', { kva: 10 }, 10000, 20000, 280000, false, 6],
  [3, 'speaker', '12" powered speaker', { watts: 2000, size_in: 12, powered: true }, 18000, 40000, 1100000, false, 4],
  [3, 'subwoofer', '18" powered subwoofer', { watts: 3600, size_in: 18 }, 25000, 60000, 1700000, false, 2],
  [3, 'mic', 'Wireless handheld mic', { kind: 'handheld', wireless: true }, 7000, 15000, 300000, false, 8],
  [3, 'mixer', '24-channel digital mixer', { channels: 24, digital: true }, 50000, 0, 5500000, true, 1],
  [3, 'projector', 'Projector 6,000 lumens', { lumens: 6000 }, 40000, 90000, 2800000, false, 2],
  [3, 'projection_screen', 'Projection screen 12×9 ft', { width_ft: 12, height_ft: 9 }, 15000, 25000, 500000, false, 2],
  [3, 'camera', 'PTZ camera', { kind: 'ptz', resolution: '4k' }, 30000, 80000, 2000000, false, 3],
  [3, 'switcher', 'Livestream switcher', { inputs: 8, streams: true }, 30000, 80000, 1500000, false, 1],
  [3, 'light', 'LED par light', { kind: 'par', watts: 60 }, 4000, 8000, 150000, false, 12],
  [3, 'avr', '10 kVA stabiliser', { kva: 10 }, 8000, 15000, 280000, false, 2],
  [4, 'camera', 'Pro camcorder 4K', { kind: 'camcorder', resolution: '4k' }, 60000, 0, 5500000, true, 2],
  [4, 'camera', 'Camcorder HD', { kind: 'camcorder', resolution: '1080p' }, 30000, 70000, 1800000, false, 2],
  [4, 'camera', 'Mirrorless camera kit', { kind: 'dslr', resolution: '4k' }, 35000, 100000, 2600000, false, 2],
  [4, 'switcher', 'Livestream switcher', { inputs: 4, streams: true }, 20000, 50000, 700000, false, 2],
  [4, 'streaming_kit', 'Bonded internet kit', { bonded: true }, 50000, 150000, 2400000, false, 1],
  [4, 'streaming_kit', '4G router kit', { bonded: false }, 10000, 20000, 120000, false, 3],
];

const tier = (replacementNaira: number): 1 | 2 | 3 => (replacementNaira < 500000 ? 1 : replacementNaira < 3000000 ? 2 : 3);

/** The demo catalogue with every unit free; `free` overrides free units by item id. */
function catalogue(free: Record<string, number> = {}, approved: Record<number, boolean> = {}): CatalogueItem[] {
  return ROWS.map(([v, cat, name, specs, rate, deposit, replacement, tech, qty]) => {
    const id = `${v}:${name}`;
    return {
      id,
      vendorId: `v${v}`,
      vendorName: VENDORS[v].name,
      vendorAreas: VENDORS[v].areas,
      vendorApproved: approved[v] ?? true,
      category: cat,
      name,
      specs,
      dayRateKobo: rate * 100,
      depositKobo: deposit * 100,
      technicianRequired: tech || replacement >= 3000000,
      riskTier: tier(replacement),
      freeUnits: free[id] ?? qty,
      totalUnits: qty,
    };
  });
}

function mkLine(key: string, category: CategoryKey, qty: number, spec: SpecNeed, essential = true): Line {
  return { key, category, qty, spec, essential, group: 'sound', reasonKey: key, reason: `test line ${key}`, drawWatts: 0 };
}

function mkSetup(lines: Line[], technicianWanted = false): Setup {
  return { level: 'better', rulesVersion: 'test', lines, assumptions: [], notes: [], loadKva: 0, technicianWanted };
}

const BIG_TOPS: SpecNeed = { powered: true, lineArray: false, minWatts: 1000 };

// ---------------------------------------------------------------------------------------------

test('rentalDays: ceil(hours / 24), at least 1', () => {
  assert.equal(rentalDays('2026-11-14T09:00:00+01:00', '2026-11-14T12:00:00+01:00'), 1);
  assert.equal(rentalDays('2026-11-14T09:00:00+01:00', '2026-11-15T09:00:00+01:00'), 1);
  assert.equal(rentalDays('2026-11-14T09:00:00+01:00', '2026-11-15T10:00:00+01:00'), 2);
  assert.equal(rentalDays('2026-11-14T07:00:00+01:00', '2026-11-16T22:00:00+01:00'), 3);
  assert.equal(rentalDays('2026-11-14T09:00:00+01:00', '2026-11-14T09:00:00+01:00'), 1);
  assert.equal(rentalDays('not a date', undefined), 1);
});

test('meetsSpec: minimums accept bigger gear, flags are exact, line arrays are not boxes', () => {
  const cat = catalogue();
  const get = (id: string) => cat.find((i) => i.id === id)!;
  assert.ok(meetsSpec(get('1:Outdoor LED wall 16×9 ft'), { outdoor: true, minWidthFt: 12, minHeightFt: 8 }));
  assert.ok(!meetsSpec(get('1:Indoor LED wall 12×7 ft'), { outdoor: true }));
  assert.ok(meetsSpec(get('1:Outdoor LED wall 16×9 ft'), { minWidthFt: 12 }), 'an outdoor wall works indoors');
  assert.ok(!meetsSpec(get('1:Line array box'), BIG_TOPS));
  assert.ok(meetsSpec(get('1:Line array box'), { lineArray: true }));
  assert.ok(!meetsSpec(get('2:Wired vocal mic'), { wireless: true }));
  assert.ok(meetsSpec(get('2:Wired vocal mic'), { wireless: false }));
  assert.ok(meetsSpec(get('4:Pro camcorder 4K'), { resolution: '1080p' }), '4K satisfies an HD need');
  assert.ok(!meetsSpec(get('4:Camcorder HD'), { resolution: '4k' }));
  assert.ok(!meetsSpec(get('2:7.5 kVA generator'), { minKva: 20 }));
  assert.ok(!meetsSpec(get('2:16-channel digital mixer'), { minChannels: 24 }));
});

test('combines units across vendors to reach the quantity, area first then cheapest', () => {
  const m = matchSetup(mkSetup([mkLine('tops', 'speaker', 12, BIG_TOPS)]), catalogue(), { area: 'Ikeja', days: 1 });
  const l = m.lines[0];
  assert.equal(l.unitsFound, 12);
  // Mainland serves Ikeja: all 10 of its 15" first; the 2 left from the cheapest elsewhere (₦18k, more free units).
  assert.deepEqual(l.offers.map((o) => [o.itemId, o.units]), [['2:15" powered speaker', 10], ['1:12" powered speaker', 2]]);
  assert.equal(l.offers[0].servesArea, true);
  assert.equal(l.offers[1].servesArea, false);
  assert.equal(l.status, 'available', '18 spare boxes left');
});

test('area preference: a vendor serving the area beats a cheaper one that does not', () => {
  const line = mkLine('mics', 'mic', 4, { kinds: ['handheld'], wireless: true });
  const lekki = matchSetup(mkSetup([line]), catalogue(), { area: 'Lekki', days: 1 });
  assert.equal(lekki.lines[0].offers[0].vendorName, 'Lekki Sound & Stage', '₦10k in Lekki beats ₦7k in Gbagada');
  const anywhere = matchSetup(mkSetup([line]), catalogue(), { days: 1 });
  assert.equal(anywhere.lines[0].offers[0].vendorName, 'Living Waters Church Media', 'no area: cheapest wins');
  const lower = matchSetup(mkSetup([line]), catalogue(), { area: 'lekki ', days: 1 });
  assert.equal(lower.lines[0].offers[0].vendorName, 'Lekki Sound & Stage', 'area match ignores case and spaces');
});

test('unapproved vendors are used only after approved ones', () => {
  const line = mkLine('mics', 'mic', 4, { kinds: ['handheld'], wireless: true });
  const m = matchSetup(mkSetup([line]), catalogue({}, { 3: false }), { days: 1 });
  assert.equal(m.lines[0].offers[0].vendorName, 'Mainland AV Hire', 'church is cheapest but not approved');
});

test('limited: short of the quantity, or ≤ 1 spare left', () => {
  // 15" boxes ≥ 1,300 W: only Lekki's 8.
  const spec: SpecNeed = { powered: true, lineArray: false, minWatts: 1300, minSizeIn: 15 };
  const tight = matchSetup(mkSetup([mkLine('tops', 'speaker', 7, spec)]), catalogue(), { days: 1 });
  assert.equal(tight.lines[0].status, 'limited', '7 of 8: one spare');
  assert.equal(tight.unmet.length, 0);
  const roomy = matchSetup(mkSetup([mkLine('tops', 'speaker', 6, spec)]), catalogue(), { days: 1 });
  assert.equal(roomy.lines[0].status, 'available');
  const short = matchSetup(mkSetup([mkLine('tops', 'speaker', 10, spec)]), catalogue(), { area: 'Lekki', days: 1 });
  assert.equal(short.lines[0].status, 'limited');
  assert.equal(short.lines[0].unitsFound, 8);
  assert.deepEqual(short.unmet, [{ lineKey: 'tops', category: 'speaker', spec, qty: 2, area: 'Lekki', hasAlternatives: true }]);
});

test('unavailable → alternatives in PRD order: other vendor, equivalent, different approach, nearby date', () => {
  // Need one big 15" ≥1,300 W box from Lekki only… and Lekki's are all booked.
  const spec: SpecNeed = { powered: true, lineArray: false, minWatts: 1300, minSizeIn: 15 };
  const m = matchSetup(mkSetup([mkLine('tops', 'speaker', 2, spec)]), catalogue({ '1:15" powered speaker': 0 }), { area: 'Ikeja', days: 1 });
  const l = m.lines[0];
  assert.equal(l.status, 'unavailable');
  const eq = l.alternatives.find((a) => a.kind === 'equivalent');
  assert.ok(eq, 'two smaller speakers for one big one');
  assert.equal(eq.units, 4);
  assert.ok(eq.complete);
  assert.match(eq.trade, /2 smaller speakers/);
  assert.equal(eq.priceDeltaKobo, eq.offers.reduce((s, o) => s + o.rentalKobo, 0), 'nothing chosen, so the delta is the full price');
  assert.equal(l.alternatives.at(-1)?.kind, 'nearby_date');
  assert.equal(l.alternatives.at(-1)?.priceDeltaKobo, null);
  assert.equal(m.unmet[0].qty, 2);
  assert.equal(m.unmet[0].hasAlternatives, true);
  assert.equal(m.status, 'unavailable', 'an essential line is out');
});

test('other vendor comes first and carries a price delta and area trade-off', () => {
  // 12 wireless mics wanted; Mainland (Ikeja, ₦9k) has 10, so the rest come from the next vendor.
  const line = mkLine('mics', 'mic', 3, { kinds: ['handheld'], wireless: true });
  const m = matchSetup(mkSetup([line]), catalogue(), { area: 'Ikeja', days: 2 });
  const l = m.lines[0];
  assert.equal(l.offers[0].vendorName, 'Mainland AV Hire');
  const others = l.alternatives.filter((a) => a.kind === 'other_vendor');
  assert.equal(others.length, 2);
  assert.equal(l.alternatives[0].kind, 'other_vendor');
  const church = others.find((a) => a.offers[0].vendorName === 'Living Waters Church Media')!;
  // (₦7k − ₦9k) × 3 mics × 2 days = −₦12,000.
  assert.equal(church.priceDeltaKobo, -1200000);
  assert.match(church.trade, /doesn't usually serve Ikeja/);
});

test('outdoor LED wall out → no projector offered; indoor LED wall out → projector + screen', () => {
  const blocked = catalogue({ '1:Outdoor LED wall 16×9 ft': 0, '2:Outdoor LED wall 12×8 ft': 0 });
  const out = matchSetup(mkSetup([mkLine('screen.main', 'led_wall', 1, { outdoor: true, minWidthFt: 12, minHeightFt: 8 })]), blocked, { days: 1 });
  const ol = out.lines[0];
  assert.equal(ol.status, 'unavailable');
  assert.ok(!ol.alternatives.some((a) => a.offers.some((o) => o.category === 'projector')), 'daylight outdoors: never a projector');
  assert.deepEqual(ol.alternatives.map((a) => a.kind), ['nearby_date']);
  assert.equal(out.unmet[0].hasAlternatives, false);
  assert.equal(out.unmet[0].category, 'led_wall');

  const indoor = matchSetup(mkSetup([mkLine('screen.main', 'led_wall', 1, { minWidthFt: 12, minHeightFt: 7 })]), catalogue({ '1:Indoor LED wall 12×7 ft': 0, '1:Outdoor LED wall 16×9 ft': 0, '2:Outdoor LED wall 12×8 ft': 0 }), { days: 1 });
  const da = indoor.lines[0].alternatives.find((a) => a.kind === 'different_approach');
  assert.ok(da);
  assert.deepEqual(da.offers.map((o) => o.category).sort(), ['projection_screen', 'projector']);
  assert.ok(da.complete);
  assert.ok(da.priceDeltaKobo! > 0, 'compared with nothing chosen');
});

test('a bigger LED wall is a normal match; a smaller one is the equivalent', () => {
  const need: SpecNeed = { outdoor: true, minWidthFt: 16, minHeightFt: 9 };
  const ok = matchSetup(mkSetup([mkLine('led', 'led_wall', 1, { outdoor: true, minWidthFt: 12, minHeightFt: 8 })]), catalogue({ '2:Outdoor LED wall 12×8 ft': 0 }), { days: 1 });
  assert.equal(ok.lines[0].offers[0].itemId, '1:Outdoor LED wall 16×9 ft', 'larger wall fills a smaller need');
  const smaller = matchSetup(mkSetup([mkLine('led', 'led_wall', 1, need)]), catalogue({ '1:Outdoor LED wall 16×9 ft': 0 }), { days: 1 });
  const eq = smaller.lines[0].alternatives.find((a) => a.kind === 'equivalent');
  assert.equal(eq?.offers[0].itemId, '2:Outdoor LED wall 12×8 ft');
  assert.match(eq!.trade, /smaller LED wall/);
});

test('lines share one pool of units: two TV lines never count the same TV', () => {
  const setup = mkSetup([mkLine('a', 'tv', 4, { minScreenIn: 75 }), mkLine('b', 'tv', 3, { minScreenIn: 75 })]);
  const m = matchSetup(setup, catalogue(), { days: 1 });
  assert.equal(m.lines[0].unitsFound, 4);
  assert.equal(m.lines[1].unitsFound, 0);
  assert.equal(m.lines[1].status, 'unavailable');
  // The equivalent smaller TV is still free.
  assert.equal(m.lines[1].alternatives.find((a) => a.kind === 'equivalent')?.offers[0].itemId, '2:55" TV on stand');
});

test('totals: rental × units × days, deposit once per unit, Protection at the given rate', () => {
  const setup = mkSetup([mkLine('tops', 'speaker', 2, BIG_TOPS), mkLine('avr', 'avr', 1, { minKva: 10 })]);
  const days = rentalDays('2026-11-14T09:00:00+01:00', '2026-11-16T09:00:00+01:00');
  assert.equal(days, 2);
  const m = matchSetup(setup, catalogue(), { area: 'Ikeja', days });
  // 2 × Mainland 15" (₦20k/day, ₦40k deposit) + 1 × Mainland 10 kVA AVR (₦10k/day, ₦20k deposit).
  assert.equal(m.totals.rentalKobo, (2 * 20000 + 10000) * 2 * 100);
  assert.equal(m.totals.depositKobo, (2 * 40000 + 20000) * 100);
  assert.equal(m.totals.protectionKobo, Math.round(m.totals.rentalKobo * 0.07));
  assert.equal(m.totals.totalKobo, m.totals.rentalKobo + m.totals.depositKobo + m.totals.protectionKobo);
  assert.equal(m.days, 2);
  const ten = matchSetup(setup, catalogue(), { area: 'Ikeja', days, protectionRate: 0.1 });
  assert.equal(ten.totals.protectionKobo, Math.round(ten.totals.rentalKobo * 0.1));
  assert.equal(m.totals.technicianNote, null);
});

test('technician: forced for tier-3 / technician-required gear, and noted when asked for', () => {
  const setup = mkSetup([mkLine('led', 'led_wall', 1, { outdoor: true }), mkLine('mics', 'mic', 2, { wireless: true })]);
  const m = matchSetup(setup, catalogue(), { days: 1 });
  assert.equal(m.lines[0].technicianRequired, true);
  assert.equal(m.lines[0].offers[0].riskTier, 3);
  assert.equal(m.lines[1].technicianRequired, false);
  assert.equal(m.totals.technicianNote, 'Includes a technician, required for the LED wall.');
  const asked = matchSetup(mkSetup([mkLine('mics', 'mic', 2, { wireless: true })], true), catalogue(), { days: 1 });
  assert.match(asked.totals.technicianNote!, /You asked for a technician/);
});

test('end to end: Better for a 2,000-person crusade on the demo Saturday (outdoor walls taken)', () => {
  const setups = sizeSetups({
    eventType: 'crusade', venue: 'open', crowd: 2000, stage: ['speakers', 'band'], stream: 'live', platform: 'youtube',
    power: 'none', startsAt: '2026-11-14T15:00:00+01:00', endsAt: '2026-11-14T21:00:00+01:00', area: 'Ikeja', budget: 'options',
  });
  const cat = catalogue({ '1:Outdoor LED wall 16×9 ft': 0, '2:Outdoor LED wall 12×8 ft': 0, '2:15" powered speaker': 2 });
  const m = matchSetup(setups[1], cat, { area: 'Ikeja', days: 1 });
  const by = (k: string) => m.lines.find((l) => l.line.key === k)!;
  assert.equal(by('screen.main').status, 'unavailable');
  assert.ok(m.unmet.some((u) => u.category === 'led_wall'));
  // 24 tops wanted; only 2 + 8 + 6 + 4 = 20 big powered boxes free.
  assert.equal(by('sound.tops').unitsFound, 20);
  assert.equal(by('sound.tops').status, 'limited');
  assert.ok(m.unmet.some((u) => u.lineKey === 'sound.tops' && u.qty === 4));
  assert.equal(by('power.avr').status !== 'unavailable', true);
  assert.equal(m.status, 'unavailable');
  assert.ok(m.totals.rentalKobo > 0 && m.totals.protectionKobo > 0);
  assert.match(m.totals.technicianNote ?? '', /technician/);
});

test('end to end: Good for an indoor service of 150 in Ikeja is fully bookable', () => {
  const [good] = sizeSetups({
    eventType: 'service', venue: 'indoor', roomSize: 'hall', crowd: 150, stage: ['speakers'], stream: 'record', power: 'grid',
    startsAt: '2026-11-14T09:00:00+01:00', endsAt: '2026-11-14T12:00:00+01:00', area: 'Ikeja', budget: 'low',
  });
  const m = matchSetup(good, catalogue(), { area: 'Ikeja', days: 1 });
  for (const l of m.lines) assert.notEqual(l.status, 'unavailable', `${l.line.key} should be bookable`);
  assert.deepEqual(m.unmet, []);
  assert.ok(m.lines.some((l) => l.line.category === 'avr' && l.unitsFound === 1));
});
