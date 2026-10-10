/// <reference types="node" />
// Run from the repo root: npx tsx --test mobile/src/planner/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readShoot } from '../../lib/intake';

// Wednesday 14 Oct 2026, 10:00 in Lagos. Every date below is relative to this.
const NOW = new Date('2026-10-14T09:00:00Z');
const read = (s: string, now = NOW) => readShoot(s, now);
const days = (first: string, last: string) => ({ startsAt: `${first}T08:00:00+01:00`, endsAt: `${addOne(last)}T00:00:00+01:00` });
const addOne = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
const window = (a: ReturnType<typeof readShoot>) => ({ startsAt: a.startsAt, endsAt: a.endsAt });

test('interview for a brand, indoors in Ikeja, 2 days: a length without a start day', () => {
  const a = read('Interview for a brand, indoors in Ikeja, 2 days');
  assert.equal(a.shootType, 'interview');
  assert.equal(a.location, 'indoor');
  assert.equal(a.area, 'Ikeja');
  assert.equal(a.days, 2);
  assert.equal(a.startsAt, undefined, 'no start day said, so the calendar asks');
});

test('podcast in lekki this weekend: Saturday and Sunday, desk mics', () => {
  const a = read('podcast in lekki this weekend');
  assert.equal(a.shootType, 'podcast');
  assert.equal(a.area, 'Lekki');
  assert.equal(a.sound, 'desk');
  assert.deepEqual(window(a), days('2026-10-17', '2026-10-18'));
});

test('next weekend is the one after; on a Saturday "this weekend" is just Sunday', () => {
  assert.deepEqual(window(read('shoot next weekend')), days('2026-10-24', '2026-10-25'));
  assert.deepEqual(window(read('shoot this weekend', new Date('2026-10-17T09:00:00Z'))), days('2026-10-18', '2026-10-18'));
});

test('music video Fri to Sun in VI, under 100k', () => {
  const a = read('music video Fri to Sun in VI, under 100k');
  assert.equal(a.shootType, 'music_video');
  assert.equal(a.area, 'Victoria Island');
  assert.equal(a.budgetKobo, 100_000 * 100);
  assert.deepEqual(window(a), days('2026-10-16', '2026-10-18'));
});

test('wedding next sat, need delivery to Ajah', () => {
  const a = read('wedding next sat, need delivery to Ajah');
  assert.equal(a.shootType, 'event');
  assert.equal(a.delivery, 'delivery');
  assert.equal(a.area, 'Ajah');
  assert.deepEqual(window(a), days('2026-10-24', '2026-10-24'), 'next week’s Saturday');
});

test('shoot on the 18th: a bare ordinal is this month, or next month once it has passed', () => {
  assert.deepEqual(window(read('shoot on the 18th')), days('2026-10-18', '2026-10-18'));
  assert.deepEqual(window(read('shoot on the 3rd')), days('2026-11-03', '2026-11-03'));
});

test('YouTube vlog in Yaba tmrw', () => {
  const a = read('YouTube vlog in Yaba tmrw');
  assert.equal(a.shootType, 'content');
  assert.equal(a.area, 'Yaba');
  assert.deepEqual(window(a), days('2026-10-15', '2026-10-15'));
});

test('skit for IG, 3 actors, outdoor, evening', () => {
  const a = read('skit for IG, 3 actors, outdoor, evening');
  assert.equal(a.shootType, 'short_film');
  assert.equal(a.people, 3);
  assert.equal(a.location, 'outdoor');
  assert.equal(a.timeOfDay, 'night');
  assert.equal(a.startsAt, undefined);
});

test('date ranges with months: "14–16 Nov", "14 to 16 November", "Nov 14-16", "30 Nov to 2 Dec"', () => {
  assert.deepEqual(window(read('need it 14–16 Nov')), days('2026-11-14', '2026-11-16'));
  assert.deepEqual(window(read('14 to 16 November')), days('2026-11-14', '2026-11-16'));
  assert.deepEqual(window(read('Nov 14-16')), days('2026-11-14', '2026-11-16'));
  assert.deepEqual(window(read('30 Nov to 2 Dec')), days('2026-11-30', '2026-12-02'));
  assert.deepEqual(window(read('from the 20th to the 22nd')), days('2026-10-20', '2026-10-22'));
});

test('a past day of the year means next year; single days', () => {
  assert.deepEqual(window(read('on 3 March')), days('2027-03-03', '2027-03-03'));
  assert.deepEqual(window(read('on Saturday')), days('2026-10-17', '2026-10-17'));
  assert.deepEqual(window(read('this friday')), days('2026-10-16', '2026-10-16'));
  assert.deepEqual(window(read('next monday')), days('2026-10-19', '2026-10-19'));
  assert.deepEqual(window(read('tomorrow')), days('2026-10-15', '2026-10-15'));
});

test('durations with a start day set the end: "for a week", "3 days"', () => {
  assert.deepEqual(window(read('from tomorrow for a week')), days('2026-10-15', '2026-10-21'));
  assert.deepEqual(window(read('Saturday, 3 days')), days('2026-10-17', '2026-10-19'));
  assert.equal(read('a 3-day shoot').days, 3);
});

test('abbreviations need context: "in the sun" is not Sunday', () => {
  assert.equal(read('outdoor shoot in the sun').startsAt, undefined);
  assert.deepEqual(window(read('podcast on sat')), days('2026-10-17', '2026-10-17'));
});

test('people synonyms and places', () => {
  assert.equal(read('photo shoot with 2 models').people, 2);
  assert.equal(read('panel with 4 panelists').people, 4);
  assert.equal(read('pre-wedding shoot for a couple').people, 2);
  assert.equal(read('a couple of days').people, undefined);
  assert.equal(read('vlog at my place').location, 'indoor');
  assert.equal(read('shoot at home').location, 'indoor');
  assert.equal(read('in my studio').location, 'indoor');
});

test('naira budgets', () => {
  assert.equal(read('₦150,000').budgetKobo, 150_000 * 100);
  assert.equal(read('budget 150k max').budgetKobo, 150_000 * 100);
  assert.equal(read('N80k').budgetKobo, 80_000 * 100);
  assert.equal(read('1.5m naira').budgetKobo, 1_500_000 * 100);
  assert.equal(read('shoot in 4k').budgetKobo, undefined, '4k is a resolution');
  assert.equal(read('2 cameras').budgetKobo, undefined);
});

test('delivery and pickup', () => {
  const a = read('podcast in Ikeja, drop off in Lekki');
  assert.equal(a.delivery, 'delivery');
  assert.equal(a.area, 'Lekki', 'the delivery area wins');
  assert.equal(read('I will pick up in Yaba').delivery, 'pickup');
});

test('named gear becomes pinned names; date ranges are not lenses', () => {
  assert.deepEqual(read('FX3 with the 24-70 and a RODECaster').pinnedNames, ['fx3', 'rodecaster', '24-70']);
  assert.deepEqual(read('two ZV-E1 and 85mm').pinnedNames, ['zv-e1', '85mm']);
  assert.equal(read('14-16 nov').pinnedNames, undefined);
});
