/// <reference types="node" />
// Run from the repo root: npx tsx --test mobile/src/planner/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultLevel, RULES_VERSION, sizeSetup, sizeSetups, type Answers, type Level, type Setup } from '../index';

const base: Answers = {
  shootType: 'interview', location: 'indoor', timeOfDay: 'day', people: 2, angles: 2, sound: 'clip', movement: false,
  startsAt: '2026-11-14T08:00:00+01:00', endsAt: '2026-11-14T20:00:00+01:00', area: 'Ikeja', budget: 'options',
};
const at = (patch: Partial<Answers>, level: Level = 'better') => sizeSetup({ ...base, ...patch }, level);
const find = (s: Setup, key: string) => s.lines.find((l) => l.key === key);
const keys = (s: Setup) => s.lines.map((l) => l.key);

test('1. two-camera interview indoors: cameras, primes, key + fill, one wireless kit, headphones', () => {
  const s = at({});
  assert.equal(find(s, 'camera.main')?.qty, 2);
  assert.equal(find(s, 'lens.prime')?.qty, 2);
  assert.ok(find(s, 'light.key') && find(s, 'light.fill'));
  assert.equal(find(s, 'audio.wireless')?.qty, 1, '2 people share one 2-mic kit');
  assert.ok(find(s, 'audio.headphones'));
  assert.equal(find(s, 'grip.gimbal'), undefined);
});

test('2. camera grade rises with the level; Best films and music videos get a cinema body', () => {
  assert.equal(at({}, 'good').lines[0].spec.minGrade, 1);
  assert.equal(at({}, 'better').lines[0].spec.minGrade, 2);
  assert.equal(at({}, 'best').lines[0].spec.minGrade, 3);
  assert.equal(at({ shootType: 'short_film' }, 'best').lines[0].spec.minGrade, 4);
  assert.equal(at({ shootType: 'music_video' }, 'best').lines[0].spec.minGrade, 4);
});

test('3. full-frame bodies get full-frame lenses only', () => {
  assert.equal(find(at({}, 'best'), 'lens.prime')?.spec.fullFrame, true);
  assert.equal(find(at({}, 'good'), 'lens.prime')?.spec.fullFrame, undefined);
});

test('4. one lens per camera; events and content put a zoom on the main camera from Better', () => {
  const ev = at({ shootType: 'event', angles: 2 });
  assert.equal(find(ev, 'lens.zoom')?.qty, 1);
  assert.equal(find(ev, 'lens.prime')?.qty, 1);
  assert.equal(find(at({ shootType: 'event', angles: 2 }, 'good'), 'lens.zoom'), undefined);
  for (const lv of ['good', 'better', 'best'] as Level[]) {
    const s = at({ shootType: 'content', angles: 3 }, lv);
    const lenses = s.lines.filter((l) => l.category === 'lens').reduce((n, l) => n + l.qty, 0);
    assert.equal(lenses, find(s, 'camera.main')?.qty);
  }
});

test('5. podcast: one desk mic per person and the mixer; solo Good is a USB mic alone', () => {
  const s = at({ shootType: 'podcast', sound: 'desk', people: 3 });
  assert.equal(find(s, 'audio.mics')?.qty, 3);
  assert.equal(find(s, 'audio.mixer')?.spec.minChannels, 3);
  assert.equal(find(s, 'audio.mixer')?.essential, true);
  const solo = at({ shootType: 'podcast', sound: 'desk', people: 1 }, 'good');
  assert.deepEqual(find(solo, 'audio.mics')?.spec, { kinds: ['podcast'], usb: true });
  assert.equal(find(solo, 'audio.mixer'), undefined);
});

test('6. more than 4 podcast guests: mixer capped at 4 channels with a note', () => {
  const s = at({ shootType: 'podcast', sound: 'desk', people: 6 });
  assert.equal(find(s, 'audio.mixer')?.spec.minChannels, 4);
  assert.ok(s.notes.some((n) => /4 mics/.test(n)));
});

test('7. clip-on kits carry 2 mics: 3 people → 2 kits', () => {
  assert.equal(find(at({ people: 3 }), 'audio.wireless')?.qty, 2);
});

test('8. no sound (music video, photos) → no mics or headphones', () => {
  for (const s of [at({ shootType: 'music_video', sound: 'none' }), at({ shootType: 'photo', sound: 'none' })]) {
    assert.ok(!s.lines.some((l) => l.group === 'audio'), keys(s).join());
  }
});

test('9. outdoors in daylight: no light at Good, a battery fill at Better/Best', () => {
  assert.ok(!at({ location: 'outdoor' }, 'good').lines.some((l) => l.group === 'light'));
  const fill = find(at({ location: 'outdoor' }, 'better'), 'light.fill');
  assert.equal(fill?.spec.battery, true);
  assert.equal(fill?.essential, false);
});

test('10. outdoors at night: battery key light and a battery note', () => {
  const s = at({ location: 'outdoor', timeOfDay: 'night' });
  assert.equal(find(s, 'light.key')?.spec.battery, true);
  assert.ok(s.notes.some((n) => /V-mount/.test(n)));
});

test('11. lights grow with the level: key → + fill → + colour accent', () => {
  assert.deepEqual(at({}, 'good').lines.filter((l) => l.group === 'light').map((l) => l.key), ['light.key']);
  assert.deepEqual(at({}, 'better').lines.filter((l) => l.group === 'light').map((l) => l.key), ['light.key', 'light.fill']);
  assert.deepEqual(at({}, 'best').lines.filter((l) => l.group === 'light').map((l) => l.key), ['light.key', 'light.fill', 'light.accent']);
  assert.equal(find(at({ shootType: 'music_video', sound: 'none' }, 'best'), 'light.accent')?.qty, 2);
});

test('12. moving shots → a gimbal, heavy-duty with full-frame bodies', () => {
  assert.equal(find(at({ movement: true }, 'good'), 'grip.gimbal')?.spec.minPayloadKg, 2);
  assert.equal(find(at({ movement: true }, 'best'), 'grip.gimbal')?.spec.minPayloadKg, 3);
});

test('13. photo shoots get a paper backdrop and stand from Better', () => {
  assert.equal(find(at({ shootType: 'photo', sound: 'none' }, 'good'), 'grip.backdrop'), undefined);
  const s = at({ shootType: 'photo', sound: 'none' });
  assert.ok(find(s, 'grip.backdrop') && find(s, 'grip.backdrop_stand'));
});

test('14. angles capped at 4', () => {
  assert.equal(find(at({ angles: 9 }), 'camera.main')?.qty, 4);
});

test('15. everything "Not sure" → defaults per shoot type, each explained', () => {
  const s = sizeSetup({
    shootType: 'podcast', location: 'unsure', timeOfDay: 'unsure', people: 'unsure', angles: 'unsure', sound: 'unsure',
    movement: 'unsure', startsAt: 'unsure', endsAt: 'unsure', area: 'unsure', budget: 'unsure',
  }, 'better');
  assert.equal(find(s, 'audio.mics')?.qty, 2);
  assert.equal(find(s, 'camera.main')?.qty, 2);
  assert.ok(find(s, 'light.key'), 'unsure location → indoors → lights');
  assert.ok(s.assumptions.length >= 5, s.assumptions.join(' | '));
  const other = sizeSetup({ ...base, shootType: 'unsure' }, 'better');
  assert.ok(other.assumptions.some((a) => /general video shoot/.test(a)));
});

test('16. deterministic, versioned, well-formed lines', () => {
  assert.deepEqual(sizeSetups(base), sizeSetups(base));
  assert.match(RULES_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  for (const type of ['podcast', 'interview', 'content', 'music_video', 'short_film', 'photo', 'event', 'other'] as const) {
    for (const s of sizeSetups({ ...base, shootType: type, movement: true })) {
      assert.equal(new Set(keys(s)).size, s.lines.length, `${type} unique keys`);
      for (const l of s.lines) {
        assert.ok(l.qty >= 1 && Number.isInteger(l.qty), `${type} ${l.key} qty`);
        assert.ok(l.reason.split(' ').length >= 4, `${type} ${l.key} reason`);
      }
    }
  }
});

test('17. budget → opening level', () => {
  assert.equal(defaultLevel('low'), 'good');
  assert.equal(defaultLevel('high'), 'best');
  assert.equal(defaultLevel('options'), 'better');
  assert.equal(defaultLevel('unsure'), 'better');
});
