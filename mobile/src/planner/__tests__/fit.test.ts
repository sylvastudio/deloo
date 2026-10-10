/// <reference types="node" />
// Run from the repo root: npx tsx --test mobile/src/planner/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitBudget, LEVELS, matchSetup, pinnedItems, rentalOf, sizeSetup, type Answers, type Level, type SetupMatch } from '../index';
import { stock } from './fixture';

const base: Answers = {
  shootType: 'interview', location: 'indoor', timeOfDay: 'day', people: 2, angles: 2, sound: 'clip', movement: true,
  startsAt: '2026-11-14T08:00:00+01:00', endsAt: '2026-11-15T00:00:00+01:00', area: 'Ikeja', budget: 'options',
};
const all = (a: Answers = base, busy: Record<string, number> = {}) =>
  Object.fromEntries(LEVELS.map((l) => [l, matchSetup(sizeSetup(a, l), stock(busy), { days: 1 })])) as Record<Level, SetupMatch>;

test('pinnedItems: whole model names, not prefixes', () => {
  const names = (pins: string[]) => pinnedItems(pins, stock()).map((i) => i.name);
  assert.deepEqual(names(['fx3']), ['Sony FX3 cinema camera']);
  assert.deepEqual(names(['zv-e1']), ['Sony ZV-E1']);
  assert.deepEqual(names(['24-70']), ['Sony FE 24-70mm f/2.8 GM']);
  assert.deepEqual(names(['rodecaster']), ['RODECaster Pro II']);
  assert.deepEqual(names(['85mm']), ['Sony FE 85mm f/1.8']);
});

test('a named camera fills the camera line first', () => {
  const m = matchSetup(sizeSetup({ ...base, angles: 1 }, 'good'), stock(), { days: 1, pinned: ['fx3'] });
  assert.equal(m.lines.find((l) => l.line.key === 'camera.main')?.offers[0].name, 'Sony FX3 cinema camera');
});

test('fitBudget: already within budget changes nothing', () => {
  const m = all();
  const r = fitBudget(m, { level: 'better', swaps: {}, removed: [] }, 10_000_000_00);
  assert.equal(r.fits, true);
  assert.deepEqual(r.changes, []);
  assert.equal(r.level, 'better');
});

test('fitBudget: drops extras before essentials and lands under the budget', () => {
  const m = all();
  const full = rentalOf(m.better, { swaps: {}, removed: [] });
  const r = fitBudget(m, { level: 'better', swaps: {}, removed: [] }, full - 1);
  assert.equal(r.fits, true);
  assert.ok(r.rentalKobo <= full - 1);
  for (const key of r.removed) assert.equal(m[r.level].lines.find((l) => l.line.key === key)?.line.essential, false, `${key} is an extra`);
  assert.ok(r.changes.length >= 1);
  assert.equal(rentalOf(m[r.level], r), r.rentalKobo, 'reported rental matches the choices');
});

test('fitBudget: steps down a level when extras and swaps are not enough, and says so', () => {
  const m = all();
  const good = rentalOf(m.good, { swaps: {}, removed: [] });
  const r = fitBudget(m, { level: 'best', swaps: {}, removed: [] }, good);
  assert.equal(r.fits, true);
  assert.notEqual(r.level, 'best');
  assert.match(r.changes[0], /^Stepped down to (Better|Good)/);
  assert.equal(rentalOf(m[r.level], r), r.rentalKobo);
});

test('fitBudget: an impossible budget returns the leanest attempt, not a fit', () => {
  const r = fitBudget(all(), { level: 'better', swaps: {}, removed: [] }, 100);
  assert.equal(r.fits, false);
  assert.equal(r.level, 'good');
  assert.ok(r.rentalKobo > 100);
});

test('nearby_date carries the listings that would fill the line', () => {
  const m = matchSetup(sizeSetup({ ...base, angles: 1 }, 'best'), stock({ 'Sony ZV-E1': 2, 'Sony FX3 cinema camera': 1 }), { days: 1 });
  const cam = m.lines.find((l) => l.line.key === 'camera.main')!;
  const near = cam.alternatives.find((a) => a.kind === 'nearby_date');
  assert.ok(near?.wants?.length, 'wants listed');
  assert.equal(near!.wants!.reduce((n, w) => n + w.units, 0), cam.line.qty);
});
