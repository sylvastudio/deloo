/// <reference types="node" />
// Run from the repo root: npx tsx --test mobile/src/planner/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchSetup, meetsSpec, rentalDays, sizeSetup, type Answers, type Line, type Setup, type SpecNeed } from '../index';
import { stock } from './fixture';

const base: Answers = {
  shootType: 'interview', location: 'indoor', timeOfDay: 'day', people: 2, angles: 2, sound: 'clip', movement: false,
  startsAt: '2026-11-14T08:00:00+01:00', endsAt: '2026-11-14T20:00:00+01:00', area: 'Ikeja', budget: 'options',
};
const one = (key: string, category: Line['category'], qty: number, spec: SpecNeed, essential = true): Setup => ({
  level: 'better', rulesVersion: 't', assumptions: [], notes: [],
  lines: [{ key, category, group: 'camera', qty, spec, essential, reasonKey: key, reason: 'because it is needed here' }],
});
const byName = (name: string) => stock().find((i) => i.name === name)!;

test('rentalDays: ceil(hours / 24), at least 1', () => {
  assert.equal(rentalDays('2026-11-14T08:00:00+01:00', '2026-11-14T20:00:00+01:00'), 1);
  assert.equal(rentalDays('2026-11-14T08:00:00+01:00', '2026-11-16T08:00:00+01:00'), 2);
  assert.equal(rentalDays(undefined, undefined), 1);
});

test('meetsSpec: grades are minimums, kinds and flags exact, full-frame lenses fit anything', () => {
  assert.ok(meetsSpec(byName('Sony FX3 cinema camera'), { minGrade: 3 }));
  assert.ok(!meetsSpec(byName('Sony FX30 cinema camera'), { minGrade: 3 }));
  assert.ok(!meetsSpec(byName('Sigma 16mm f/1.4 DC DN'), { kinds: ['prime'], fullFrame: true }));
  assert.ok(meetsSpec(byName('Sony FE 50mm f/1.8'), { kinds: ['prime'] }));
  assert.ok(meetsSpec(byName('RODE PodMic USB'), { kinds: ['podcast'], usb: true }));
  assert.ok(!meetsSpec(byName('RODE PodMic with stand and cable'), { kinds: ['podcast'], usb: true }));
  assert.ok(!meetsSpec(byName('DJI RS 3 Mini gimbal'), { minPayloadKg: 3 }));
});

test('cheapest fitting gear first, combining listings to reach the quantity', () => {
  const m = matchSetup(one('camera.main', 'camera', 2, { minGrade: 2 }), stock(), { days: 1 });
  assert.deepEqual(m.lines[0].offers.map((o) => [o.name, o.units]), [['Sony FX30 cinema camera', 1], ['Sony ZV-E1', 1]]);
  assert.equal(m.lines[0].status, 'available');
});

test('"we don\'t have this" vs "booked on your dates"', () => {
  // Nothing in stock fits: a 5-channel recorder.
  const none = matchSetup(one('audio.mixer', 'mixer', 1, { minChannels: 5 }), stock(), { days: 1 });
  assert.equal(none.lines[0].status, 'unavailable');
  assert.equal(none.lines[0].shortReason, 'not_stocked');
  assert.ok(!none.lines[0].alternatives.some((a) => a.kind === 'nearby_date'), 'other dates won’t help');
  assert.equal(none.unmet[0].reason, 'not_stocked');
  // We stock it, but it's booked.
  const booked = matchSetup(one('audio.mixer', 'mixer', 1, { minChannels: 4 }), stock({ 'RODECaster Pro II': 1 }), { days: 1 });
  assert.equal(booked.lines[0].shortReason, 'booked');
  assert.ok(booked.lines[0].alternatives.some((a) => a.kind === 'nearby_date'));
  assert.equal(booked.unmet[0].reason, 'booked');
});

test('limited: short of the quantity, or the last unit', () => {
  const m = matchSetup(one('camera.main', 'camera', 3, { minGrade: 3 }), stock(), { days: 1 });
  assert.equal(m.lines[0].unitsFound, 3);
  assert.equal(m.lines[0].status, 'limited', 'every full-frame body is now taken');
  const short = matchSetup(one('lens.zoom', 'lens', 2, { kinds: ['zoom'] }), stock(), { days: 1 });
  assert.equal(short.lines[0].unitsFound, 1);
  assert.equal(short.lines[0].status, 'limited');
  assert.equal(short.lines[0].shortReason, 'booked');
});

test('zoom booked → a prime is offered instead, with a price change', () => {
  const m = matchSetup(one('lens.zoom', 'lens', 1, { kinds: ['zoom'], fullFrame: true }), stock({ 'Sony FE 24-70mm f/2.8 GM': 1 }), { days: 1 });
  const eq = m.lines[0].alternatives.find((a) => a.kind === 'equivalent');
  assert.ok(eq, 'equivalent offered');
  assert.equal(eq!.offers[0].name, 'Sony FE 50mm f/1.8');
  assert.equal(eq!.priceDeltaKobo, 10_000_00);
});

test('heavy gimbal booked → the lighter one, with its trade-off', () => {
  const m = matchSetup(one('grip.gimbal', 'gimbal', 1, { minPayloadKg: 3 }), stock({ 'DJI RS 5 gimbal': 1 }), { days: 1 });
  const alt = m.lines[0].alternatives[0];
  assert.equal(alt.offers[0].name, 'DJI RS 3 Mini gimbal');
  assert.match(alt.trade, /lighter/i);
});

test('lines share one pool: a fill light never takes the key light’s unit', () => {
  const s = sizeSetup(base, 'better');
  const m = matchSetup(s, stock(), { days: 1 });
  const key = m.lines.find((l) => l.line.key === 'light.key')!;
  const fill = m.lines.find((l) => l.line.key === 'light.fill')!;
  assert.equal(key.offers[0].name, 'Godox SL100W LED light');
  assert.notEqual(fill.offers[0].itemId, key.offers[0].itemId);
});

test('totals: rate × units × days, deposit once per unit, Protection at the given rate', () => {
  const m = matchSetup(one('camera.main', 'camera', 1, { minGrade: 4 }), stock(), { days: 3, protectionRate: 0.07 });
  assert.equal(m.totals.rentalKobo, 50_000_00 * 3);
  assert.equal(m.totals.depositKobo, 490_000_00);
  assert.equal(m.totals.protectionKobo, Math.round(150_000_00 * 0.07));
  assert.equal(m.totals.totalKobo, m.totals.rentalKobo + m.totals.depositKobo + m.totals.protectionKobo);
  assert.equal(m.totals.technicianNote, null, 'renters run their own cameras');
});

test('end to end: Better 2-camera interview is fully bookable from our stock', () => {
  const m = matchSetup(sizeSetup(base, 'better'), stock(), { area: 'Ikeja', days: 1 });
  assert.notEqual(m.status, 'unavailable');
  assert.deepEqual(m.unmet, []);
});

test('end to end: Best 3-person podcast says what we don’t have enough of', () => {
  const m = matchSetup(sizeSetup({ ...base, shootType: 'podcast', sound: 'desk', people: 3, angles: 3 }, 'best'), stock(), { days: 1 });
  const mics = m.lines.find((l) => l.line.key === 'audio.mics')!;
  assert.equal(mics.unitsFound, 2, 'we own 2 PodMics');
  assert.equal(mics.shortReason, 'booked', 'we stock podcast mics, just not 3');
  assert.ok(m.unmet.some((u) => u.lineKey === 'audio.mics' && u.qty === 1));
});
