/// <reference types="node" />
// Run from the repo root: npx tsx --test mobile/src/planner/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RULES_VERSION,
  crowdFromBand,
  defaultLevel,
  sizeSetups,
  type Answers,
  type CategoryKey,
  type Line,
  type Setup,
} from '../index';

// Saturday 14 Nov 2026, Lagos time (+01:00).
const MORNING = { startsAt: '2026-11-14T09:00:00+01:00', endsAt: '2026-11-14T12:00:00+01:00' };
const EVENING = { startsAt: '2026-11-14T16:00:00+01:00', endsAt: '2026-11-14T22:00:00+01:00' };
const NIGHT = { startsAt: '2026-11-14T20:00:00+01:00', endsAt: '2026-11-14T23:30:00+01:00' };

function answers(over: Partial<Answers> = {}): Answers {
  return {
    eventType: 'service',
    venue: 'indoor',
    roomSize: 'hall',
    crowd: 150,
    stage: ['speakers'],
    stream: 'none',
    power: 'grid',
    ...MORNING,
    area: 'Ikeja',
    budget: 'options',
    ...over,
  };
}

const levels = (a: Answers) => {
  const [good, better, best] = sizeSetups(a);
  return { good, better, best };
};
const byKey = (s: Setup, key: string): Line | undefined => s.lines.find((l) => l.key === key);
const qty = (s: Setup, key: string): number => byKey(s, key)?.qty ?? 0;
const ofCat = (s: Setup, c: CategoryKey): Line[] => s.lines.filter((l) => l.category === c);
const has = (s: Setup, c: CategoryKey): boolean => ofCat(s, c).length > 0;

function assertAvrCoversLoad(s: Setup) {
  const avr = byKey(s, 'power.avr');
  assert.ok(avr, `${s.level}: every setup must have an AVR`);
  assert.equal(avr.category, 'avr');
  assert.equal(avr.essential, true);
  assert.ok((avr.spec.minKva ?? 0) * avr.qty >= s.loadKva, `${s.level}: AVR ${avr.qty}×${avr.spec.minKva} kVA < load ${s.loadKva}`);
}

// A wide grid of answers used by the "always" rules below.
const EVENT_TYPES = ['service', 'crusade', 'conference', 'wedding', 'concert', 'launch', 'party', 'other'] as const;
const GRID: Answers[] = [];
for (const eventType of EVENT_TYPES)
  for (const venue of ['indoor', 'covered', 'open'] as const)
    for (const crowd of [60, 300, 1200, 5000])
      for (const power of ['grid', 'generator', 'none', 'unsure'] as const)
        GRID.push(answers({ eventType, venue, crowd, power, roomSize: 'unsure', stage: 'unsure', stream: crowd > 1000 ? 'live' : 'record', ...EVENING }));

// ---------------------------------------------------------------------------------------------

test('1. indoor service, 150 people in a hall, morning, grid power', () => {
  const { good, better, best } = levels(answers({ stage: ['speakers', 'band'] }));
  // 150 / 100 per top = 1.5 → 2 (pairs).
  assert.equal(qty(good, 'sound.tops'), 2);
  assert.equal(qty(better, 'sound.tops'), 2);
  assert.equal(qty(best, 'sound.tops'), 2);
  assert.ok(qty(better, 'sound.subs') >= 1, 'band → subwoofer');
  // 2 speaking + 2 singers, +1 spare at Better.
  assert.equal(qty(good, 'sound.mics_wireless'), 4);
  assert.equal(qty(better, 'sound.mics_wireless'), 5);
  assert.equal(qty(better, 'sound.mics_band'), 6);
  // 11 mics + 4 = 15 → 16 channels, digital.
  assert.deepEqual(byKey(better, 'sound.mixer')?.spec, { minChannels: 16, digital: true });
  assert.equal(byKey(better, 'screen.projector')?.spec.minLumens, 5000);
  assert.equal(qty(better, 'screen.projector'), 1, 'under 300 people: one screen');
  assert.ok(!has(better, 'light'), 'daytime indoor service needs no stage lights');
  assert.ok(!has(good, 'generator'), 'grid at Good: no generator');
  assert.equal(byKey(better, 'power.generator')?.essential, false, 'grid at Better: optional backup');
});

test('2. outdoor crusade, 2,000 people, live on YouTube, own generator, into the evening', () => {
  const a = answers({ eventType: 'crusade', venue: 'open', crowd: 2000, stage: ['speakers', 'band', 'choir'], stream: 'live', platform: 'youtube', power: 'generator', ...EVENING });
  const { good, better, best } = levels(a);
  for (const s of [good, better, best]) {
    assert.ok(!has(s, 'projector') && !has(s, 'projection_screen'), `${s.level}: no projector outdoors`);
    const led = byKey(s, 'screen.main');
    assert.equal(led?.category, 'led_wall');
    assert.equal(led?.spec.outdoor, true);
    assert.ok((led?.spec.minWidthFt ?? 0) >= 12 && (led?.spec.minHeightFt ?? 0) >= 8, 'above 1,000 people: at least 12×8 ft');
    assert.equal(byKey(s, 'camera.internet')?.spec.bonded, true, 'outdoor stream → bonded internet');
    assert.ok(!has(s, 'generator'), 'they have a generator: no generator line');
    assert.ok(s.notes.some((n) => /generator should be at least/.test(n)));
    assert.ok(has(s, 'light'), 'runs past dusk → lights');
    assert.ok(has(s, 'subwoofer'));
  }
  // Box tops: 2,000 / 50 = 40 → capped at 16 (Good) / 24 (Better); Best is a line array.
  assert.equal(qty(good, 'sound.tops'), 16);
  assert.equal(qty(better, 'sound.tops'), 24);
  assert.equal(byKey(best, 'sound.tops')?.spec.lineArray, true);
  assert.equal(qty(best, 'sound.tops'), 10);
  assert.ok(qty(best, 'sound.subs') >= qty(better, 'sound.subs'), 'Best never has less bass than Better');
  // Cameras: Good 2, Better 3, Best 3 × 4K + 1 PTZ.
  assert.equal(qty(good, 'camera.live'), 2);
  assert.equal(qty(better, 'camera.live'), 3);
  assert.equal(byKey(best, 'camera.live')?.spec.resolution, '4k');
  assert.equal(qty(best, 'camera.ptz'), 1);
  assert.equal(byKey(best, 'camera.switcher')?.spec.minInputs, 5);
  assert.match(byKey(better, 'sound.tops')!.reason, /2,000 people in an open field/);
  assert.match(byKey(better, 'camera.live')!.reason, /YouTube/);
});

test('3. wedding, 300 people in a hall, no power at the venue', () => {
  const { good, better, best } = levels(answers({ eventType: 'wedding', crowd: 300, stage: ['speakers', 'dj'], power: 'none', ...EVENING }));
  for (const s of [good, better, best]) {
    const gen = byKey(s, 'power.generator');
    assert.ok(gen, `${s.level}: no power → generator`);
    assert.equal(gen.essential, true);
    assert.ok((gen.spec.minKva ?? 0) * gen.qty >= s.loadKva);
    assert.equal(byKey(s, 'sound.subs')?.essential, true, 'DJ → subs essential');
    assert.ok(qty(s, 'sound.monitors') >= 1, 'DJ booth monitor');
  }
  assert.equal(qty(good, 'sound.mics_wireless'), 2, 'wedding: 2 mics for MC and toasts');
  assert.equal(qty(better, 'sound.tops'), 4, '300 / 100 = 3 → 4');
  assert.equal(qty(better, 'screen.projector'), 2, '300+ in a hall: side screens');
  assert.equal(byKey(better, 'screen.projector')?.essential, false, 'screens are a nice-to-have at a wedding');
  assert.equal(byKey(best, 'power.generator')?.spec.silent, true, 'Best: soundproof generator');
});

test('4. conference, 500 people, panel, projector in a hall', () => {
  const { good, better } = levels(answers({ eventType: 'conference', crowd: 500, stage: ['speakers', 'panel'] }));
  assert.equal(qty(good, 'sound.mics_panel'), 4);
  assert.equal(qty(good, 'sound.mics_wireless'), 3, '2 speaking + 1 roving for questions');
  assert.ok((byKey(better, 'screen.projector')?.spec.minLumens ?? 0) >= 5000);
  // Farthest viewer ≈ √(500 × 0.6 m²) ≈ 17.3 m ≈ 57 ft → 57 / 6 ≈ 9 ft image height.
  assert.equal(byKey(better, 'screen.projection_screen')?.spec.minHeightFt, 9);
  assert.equal(qty(better, 'screen.confidence'), 1, 'Better adds a confidence monitor');
  assert.ok(!has(good, 'subwoofer'), 'talks only: no subwoofer');
  assert.equal(qty(better, 'sound.tops'), 6, '500 / 100 = 5 → 6');
});

test('5. concert, 1,200 people in the open, evening', () => {
  const { good, better, best } = levels(answers({ eventType: 'concert', venue: 'open', crowd: 1200, stage: ['band'], ...NIGHT }));
  assert.equal(qty(good, 'light.moving'), 4);
  assert.equal(qty(better, 'light.moving'), 6);
  assert.equal(qty(best, 'light.moving'), 8);
  assert.equal(byKey(better, 'light.moving')?.essential, true);
  assert.equal(qty(better, 'sound.tops'), 24, '1,200 / 50 = 24');
  assert.equal(byKey(best, 'sound.tops')?.spec.lineArray, false, 'under 1,500: still box speakers at Best');
  assert.equal(byKey(best, 'sound.tops')?.spec.minSizeIn, 15, 'Best open-air: 15" boxes');
  assert.equal(byKey(better, 'screen.main')?.category, 'led_wall', 'night outdoor still gets LED, never a projector');
  assert.equal(qty(better, 'sound.subs'), 8, 'subs capped at 8 for box rigs');
});

test('6. youth party, 80 people, DJ, small room', () => {
  const { good, better } = levels(answers({ eventType: 'party', crowd: 80, roomSize: 'small', stage: ['dj'], ...EVENING }));
  assert.equal(qty(good, 'sound.tops'), 2);
  assert.ok(!good.lines.some((l) => l.group === 'screen'), 'small party: no screens');
  assert.equal(byKey(good, 'sound.subs')?.essential, true);
  assert.equal(qty(good, 'light.moving'), 2);
  assert.equal(qty(good, 'light.wash'), 4);
  assert.equal(byKey(good, 'sound.tops')?.spec.minWatts, 500, 'small room: 10" boxes are fine');
  assert.equal(byKey(better, 'sound.mixer')?.spec.minChannels, 12);
});

test('7. everything "Not sure" → safe defaults, each one explained', () => {
  const u: Answers = {
    eventType: 'unsure', venue: 'unsure', roomSize: 'unsure', crowd: 'unsure', stage: 'unsure', stream: 'unsure',
    power: 'unsure', startsAt: 'unsure', endsAt: 'unsure', area: 'unsure', budget: 'unsure', technicianWanted: 'unsure',
  };
  const { good, better, best } = levels(u);
  for (const s of [good, better, best]) {
    assert.ok(s.assumptions.includes('We assumed no generator, so we added one.'));
    assert.ok(s.assumptions.some((x) => /300 people/.test(x)));
    assert.ok(s.assumptions.some((x) => /outdoors/.test(x)));
    assert.ok(s.assumptions.some((x) => /livestream/.test(x)));
    assert.ok(s.assumptions.length >= 7);
    assert.equal(byKey(s, 'power.generator')?.essential, true);
    assert.ok(!has(s, 'projector'), 'unknown venue is treated as open air: LED, not projector');
    assert.ok(has(s, 'light'), 'unknown time: lights in case it runs late');
    assert.ok(!has(s, 'camera'));
    assertAvrCoversLoad(s);
  }
  assert.equal(qty(better, 'sound.tops'), 6, '300 people open air: 300 / 50 = 6');
  assert.equal(defaultLevel(u.budget), 'better');
});

test('8. daylight outdoors never gets a projector (any event, size, level)', () => {
  for (const a of GRID.filter((g) => g.venue !== 'indoor')) {
    for (const s of sizeSetups({ ...a, ...MORNING })) {
      assert.ok(!has(s, 'projector') && !has(s, 'projection_screen'), `${a.eventType} ${a.venue} ${a.crowd} ${s.level}`);
      for (const l of ofCat(s, 'led_wall')) assert.equal(l.spec.outdoor, true);
    }
  }
});

test('9. every setup has an AVR sized to the load', () => {
  for (const a of GRID) for (const s of sizeSetups(a)) assertAvrCoversLoad(s);
});

test('10. generators come in standard sizes and cover the load; Best goes one size up', () => {
  for (const a of GRID.filter((g) => g.power === 'none')) {
    const [good, , best] = sizeSetups(a);
    for (const s of [good, best]) {
      const g = byKey(s, 'power.generator')!;
      assert.ok([7.5, 20, 40, 60].includes(g.spec.minKva!), `size ${g.spec.minKva}`);
      assert.ok(g.spec.minKva! * g.qty >= s.loadKva);
    }
    const gk = byKey(good, 'power.generator')!.spec.minKva!;
    const bk = byKey(best, 'power.generator')!.spec.minKva!;
    assert.ok(bk > gk || bk === 60, 'Best has headroom');
  }
});

test('11. load = sum of draws × 1.25 ÷ 0.8', () => {
  const s = sizeSetups(answers())[1];
  const watts = s.lines.reduce((t, l) => t + l.drawWatts * l.qty, 0);
  assert.equal(s.loadKva, Math.ceil(((watts * 1.25) / 1000 / 0.8) * 10) / 10);
});

test('12. grid power: Good has none, Better and Best add an optional backup "in case light goes"', () => {
  const { good, better, best } = levels(answers({ power: 'grid' }));
  assert.ok(!has(good, 'generator'));
  for (const s of [better, best]) {
    assert.equal(byKey(s, 'power.generator')?.essential, false);
    assert.match(byKey(s, 'power.generator')!.reason, /light goes/);
  }
});

test('13. speaker ratio: indoor 1/100, covered 1/70, open 1/50 at Better', () => {
  assert.equal(qty(sizeSetups(answers({ venue: 'indoor', roomSize: 'auditorium', crowd: 1000 }))[1], 'sound.tops'), 10);
  assert.equal(qty(sizeSetups(answers({ venue: 'covered', crowd: 700 }))[1], 'sound.tops'), 10);
  assert.equal(qty(sizeSetups(answers({ venue: 'open', crowd: 500 }))[1], 'sound.tops'), 10);
  // Good ≤ Better ≤ Best for box rigs.
  for (const crowd of [90, 250, 700, 1400]) {
    const { good, better, best } = levels(answers({ venue: 'covered', crowd }));
    assert.ok(qty(good, 'sound.tops') <= qty(better, 'sound.tops') && qty(better, 'sound.tops') <= qty(best, 'sound.tops'), `${crowd}`);
  }
});

test('14. line array only outdoors from 1,500 people, only at Best', () => {
  const lineArray = (a: Answers) => sizeSetups(a).map((s) => byKey(s, 'sound.tops')!.spec.lineArray === true);
  assert.deepEqual(lineArray(answers({ venue: 'open', crowd: 1500 })), [false, false, true]);
  assert.deepEqual(lineArray(answers({ venue: 'covered', crowd: 3000 })), [false, false, true]);
  assert.deepEqual(lineArray(answers({ venue: 'open', crowd: 1499 })), [false, false, false]);
  assert.deepEqual(lineArray(answers({ venue: 'indoor', roomSize: 'auditorium', crowd: 3000 })), [false, false, false]);
});

test('15. recording only → one camera, no switcher or internet', () => {
  const { good, best } = levels(answers({ stream: 'record' }));
  assert.equal(qty(good, 'camera.record'), 1);
  assert.equal(byKey(good, 'camera.record')?.spec.resolution, '1080p');
  assert.equal(byKey(best, 'camera.record')?.spec.resolution, '4k');
  assert.ok(!has(good, 'switcher') && !has(good, 'streaming_kit'));
});

test('16. indoor livestream: 4G kit at Good/Better, bonded at Best', () => {
  const { good, better, best } = levels(answers({ stream: 'live', platform: 'facebook' }));
  assert.equal(byKey(good, 'camera.internet')?.spec.bonded, undefined);
  assert.equal(byKey(better, 'camera.internet')?.spec.bonded, undefined);
  assert.equal(byKey(best, 'camera.internet')?.spec.bonded, true);
  assert.equal(byKey(good, 'camera.switcher')?.spec.minInputs, 3);
  assert.equal(byKey(good, 'camera.switcher')?.spec.streams, true);
});

test('17. small room → TV, not projector; auditorium → 10,000 lm, LED wall at Best', () => {
  const small = levels(answers({ roomSize: 'small', crowd: 60 }));
  assert.equal(byKey(small.good, 'screen.main')?.category, 'tv');
  assert.equal(byKey(small.good, 'screen.main')?.spec.minScreenIn, 55);
  assert.equal(byKey(small.better, 'screen.main')?.spec.minScreenIn, 75);
  assert.ok(!has(small.best, 'projector'));
  const aud = levels(answers({ roomSize: 'auditorium', crowd: 1500 }));
  assert.equal(byKey(aud.good, 'screen.projector')?.spec.minLumens, 10000);
  assert.equal(byKey(aud.best, 'screen.main')?.category, 'led_wall');
  assert.notEqual(byKey(aud.best, 'screen.main')?.spec.outdoor, true, 'indoor LED is fine indoors');
});

test('18. monitors and mics follow who is on stage', () => {
  const s = sizeSetups(answers({ stage: ['speakers', 'band', 'choir'] }))[1];
  assert.equal(qty(s, 'sound.monitors'), 1 + 4 + 2);
  assert.equal(qty(s, 'sound.mics_choir'), 4);
  assert.match(byKey(s, 'sound.monitors')!.reason, /4 for the band/);
  const talk = sizeSetups(answers({ stage: ['speakers'] }))[0];
  assert.ok(!has(talk, 'monitor'), 'Good: a lone speaker needs no monitor');
});

test('19. mixer channels ≥ mics + 4, rounded to 12/16/24/32, digital from 16', () => {
  for (const a of [answers({ stage: ['speakers'] }), answers({ stage: ['speakers', 'band'] }), answers({ stage: ['speakers', 'band', 'choir', 'panel', 'dj'] })]) {
    for (const s of sizeSetups(a)) {
      const mics = ofCat(s, 'mic').reduce((t, l) => t + l.qty, 0);
      const m = byKey(s, 'sound.mixer')!;
      assert.ok([12, 16, 24, 32].includes(m.spec.minChannels!));
      assert.ok(m.spec.minChannels! >= Math.min(32, mics + 4));
      if (m.spec.minChannels! >= 16) assert.equal(m.spec.digital, true);
    }
  }
  const big = sizeSetups(answers({ stage: ['speakers', 'band', 'choir', 'panel', 'dj'] }))[2];
  assert.equal(byKey(big, 'sound.mixer')?.spec.minChannels, 32);
});

test('20. stage lights only for evening events (concerts and parties always)', () => {
  assert.ok(!has(sizeSetups(answers(MORNING))[1], 'light'));
  const eve = sizeSetups(answers(EVENING))[1];
  assert.equal(byKey(eve, 'light.wash')?.essential, false);
  assert.deepEqual(byKey(eve, 'light.wash')?.spec.kinds, ['par', 'wash']);
  assert.ok(has(sizeSetups(answers({ eventType: 'concert', ...MORNING }))[1], 'light'));
});

test('21. outdoor LED size: 10×6 under 1,000 people, 12×8 from 1,000, 16×9 at Best', () => {
  const small = sizeSetups(answers({ venue: 'covered', crowd: 600 }));
  assert.deepEqual([small[0].lines.find((l) => l.category === 'led_wall')!.spec.minWidthFt, small[0].lines.find((l) => l.category === 'led_wall')!.spec.minHeightFt], [10, 6]);
  const big = sizeSetups(answers({ venue: 'covered', crowd: 1000 }));
  assert.equal(byKey(big[0], 'screen.main')?.spec.minWidthFt, 12);
  assert.equal(byKey(big[2], 'screen.main')?.spec.minWidthFt, 16);
});

test('22. deterministic and versioned', () => {
  const a = answers({ eventType: 'crusade', venue: 'open', crowd: 2000, stream: 'live', ...EVENING });
  assert.deepEqual(sizeSetups(a), sizeSetups(a));
  assert.equal(RULES_VERSION, '2026-10-09.1');
  for (const s of sizeSetups(a)) assert.equal(s.rulesVersion, RULES_VERSION);
  assert.deepEqual(sizeSetups(a).map((s) => s.level), ['good', 'better', 'best']);
});

test('23. every line is well formed: unique keys, qty ≥ 1, a reason with words', () => {
  for (const a of GRID) {
    for (const s of sizeSetups(a)) {
      const keys = s.lines.map((l) => l.key);
      assert.equal(new Set(keys).size, keys.length, `duplicate keys in ${s.level}`);
      for (const l of s.lines) {
        assert.ok(Number.isInteger(l.qty) && l.qty >= 1, `${l.key} qty ${l.qty}`);
        assert.ok(l.reason.length > 20 && !/undefined|NaN/.test(l.reason), `${l.key}: ${l.reason}`);
      }
    }
  }
});

test('24. crowd bands, budget → opening level, technician pass-through', () => {
  assert.equal(crowdFromBand('lt100'), 80);
  assert.equal(crowdFromBand('1000-3000'), 2000);
  assert.equal(defaultLevel('low'), 'good');
  assert.equal(defaultLevel('mid'), 'better');
  assert.equal(defaultLevel('high'), 'best');
  assert.equal(defaultLevel('options'), 'better');
  assert.equal(sizeSetups(answers({ technicianWanted: true }))[0].technicianWanted, true);
  assert.equal(sizeSetups(answers())[0].technicianWanted, false);
});

test('25. indoor with no room size: guessed from the crowd and said so', () => {
  const s = sizeSetups(answers({ roomSize: undefined, crowd: 900 }))[0];
  assert.equal(byKey(s, 'screen.projector')?.spec.minLumens, 10000, '900 people → auditorium');
  assert.ok(s.assumptions.some((x) => /auditorium/.test(x)));
});
