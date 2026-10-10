/// <reference types="node" />
// Run from the repo root: npx tsx --test mobile/src/planner/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kitGaps, lensFits, oftenBookedWith, payloadNeeded, type Gear } from '../complements';
import { stock } from './fixture';

const shelf = (busy: Record<string, number> = {}): Gear[] => stock(busy);
const byName = (name: string, s = shelf()) => s.find((i) => i.name === name)!;
const names = (ids: string[], s = shelf()) => ids.map((id) => s.find((i) => i.id === id)!.name);
const line = (name: string, qty = 1) => ({ itemId: byName(name).id, qty });

test('lensFits: full-frame lenses fit every body, the APS-C Sigma only APS-C bodies', () => {
  assert.ok(lensFits(byName('Sony FE 50mm f/1.8'), byName('Sony FX3 cinema camera')));
  assert.ok(lensFits(byName('Sony FE 50mm f/1.8'), byName('Sony ZV-E10')));
  assert.ok(lensFits(byName('Sigma 16mm f/1.4 DC DN'), byName('Sony FX30 cinema camera')));
  assert.ok(!lensFits(byName('Sigma 16mm f/1.4 DC DN'), byName('Sony ZV-E1')));
});

test('a full-frame body suggests full-frame lenses, zoom first, then a gimbal that carries it and a clip-on mic', () => {
  const c = oftenBookedWith(byName('Sony FX3 cinema camera'), shelf());
  assert.deepEqual(names(c.pairs.map((p) => p.itemId)), [
    'Sony FE 24-70mm f/2.8 GM', 'Sony FE 50mm f/1.8', 'Sony FE 85mm f/1.8', 'DJI RS 5 gimbal', 'RODE Wireless GO II',
  ]);
  assert.ok(c.notes.some((n) => /memory cards/.test(n)));
});

test('an APS-C body suggests the Sigma 16mm first, then full-frame lenses, and the light gimbal', () => {
  const c = oftenBookedWith(byName('Sony ZV-E10'), shelf());
  const got = names(c.pairs.map((p) => p.itemId));
  assert.equal(got[0], 'Sigma 16mm f/1.4 DC DN');
  assert.equal(got[1], 'Sony FE 50mm f/1.8');
  assert.ok(got.includes('DJI RS 3 Mini gimbal'));
  assert.ok(!got.includes('DJI RS 5 gimbal'));
});

test('suggestions skip gear that is booked on the days', () => {
  const s = shelf({ 'Sony FE 24-70mm f/2.8 GM': 1 });
  const got = names(oftenBookedWith(byName('Sony FX3 cinema camera', s), s).pairs.map((p) => p.itemId), s);
  assert.ok(!got.includes('Sony FE 24-70mm f/2.8 GM'));
  assert.equal(got[0], 'Sony FE 50mm f/1.8');
});

test('PodMic (XLR) goes with the RODECaster; COB light with the C-stand; paper with its stand', () => {
  assert.deepEqual(names(oftenBookedWith(byName('RODE PodMic with stand and cable'), shelf()).pairs.map((p) => p.itemId)),
    ['RODECaster Pro II', 'Audio-Technica studio headphones']);
  assert.deepEqual(names(oftenBookedWith(byName('Amaran COB 200x S'), shelf()).pairs.map((p) => p.itemId)), ['C-stand kit (10.75 ft)']);
  assert.deepEqual(names(oftenBookedWith(byName('Paper backdrop'), shelf()).pairs.map((p) => p.itemId)), ['Backdrop support kit (12.9 ft wide)']);
  assert.ok(oftenBookedWith(byName('Amaran F22c 2×2 ft LED mat'), shelf()).notes.some((n) => /V-mount/.test(n)));
});

test('a lens suggests bodies it fits; the light gimbal only bodies it can carry', () => {
  assert.deepEqual(names(oftenBookedWith(byName('Sigma 16mm f/1.4 DC DN'), shelf()).pairs.map((p) => p.itemId)), ['Sony ZV-E10', 'Sony FX30 cinema camera']);
  assert.deepEqual(names(oftenBookedWith(byName('DJI RS 3 Mini gimbal'), shelf()).pairs.map((p) => p.itemId)), ['Sony ZV-E10', 'Sony ZV-E1']);
});

test('payloadNeeded: cinema bodies or the zoom need 3 kg, mirrorless with primes 2 kg', () => {
  assert.equal(payloadNeeded(byName('Sony FX3 cinema camera')), 3);
  assert.equal(payloadNeeded(byName('Sony ZV-E1')), 2);
  assert.equal(payloadNeeded(byName('Sony ZV-E1'), [byName('Sony FE 24-70mm f/2.8 GM')]), 3);
});

test('kitGaps: a body with no lens', () => {
  const [gap, ...rest] = kitGaps([line('Sony FX3 cinema camera')], shelf());
  assert.equal(rest.length, 0);
  assert.equal(gap.key, 'lens');
  assert.equal(gap.title, 'Your camera needs a lens');
  assert.equal(names([gap.options[0].itemId])[0], 'Sony FE 24-70mm f/2.8 GM');
});

test('kitGaps: a full-frame body with only the APS-C Sigma still needs a full-frame lens', () => {
  const gaps = kitGaps([line('Sony ZV-E1'), line('Sigma 16mm f/1.4 DC DN')], shelf());
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].body, /made for APS-C/);
  assert.ok(names(gaps[0].options.map((o) => o.itemId)).every((n) => n.startsWith('Sony FE')));
});

test('kitGaps: two bodies and one lens, and lenses shared sensibly', () => {
  const gaps = kitGaps([line('Sony ZV-E1', 2), line('Sony FE 50mm f/1.8')], shelf());
  assert.equal(gaps[0].title, 'Your cameras need one more lens');
  // An APS-C body can use a spare full-frame lens: no gap.
  assert.equal(kitGaps([line('Sony ZV-E10'), line('Sony FE 50mm f/1.8')], shelf()).length, 0);
  assert.equal(kitGaps([line('Sony ZV-E1'), line('Sony ZV-E10'), line('Sony FE 50mm f/1.8'), line('Sigma 16mm f/1.4 DC DN')], shelf()).length, 0);
});

test('kitGaps: PodMic without a mixer, COB without a stand, paper without its stand', () => {
  const gaps = kitGaps([line('RODE PodMic with stand and cable'), line('Amaran COB 200x S'), line('Paper backdrop')], shelf());
  assert.deepEqual(gaps.map((g) => g.key), ['mixer', 'stand', 'backdrop_stand']);
  assert.deepEqual(names(gaps.map((g) => g.options[0].itemId)), ['RODECaster Pro II', 'C-stand kit (10.75 ft)', 'Backdrop support kit (12.9 ft wide)']);
  // The USB PodMic works on its own; the tube light needs no stand.
  assert.equal(kitGaps([line('RODE PodMic USB'), line('Nanlite PavoTube 6C')], shelf()).length, 0);
});

test('kitGaps: the light gimbal with a cinema body offers the RS 5 as a swap', () => {
  const gaps = kitGaps([line('Sony FX3 cinema camera'), line('Sony FE 50mm f/1.8'), line('DJI RS 3 Mini gimbal')], shelf());
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].key, 'gimbal');
  assert.equal(gaps[0].replaces, byName('DJI RS 3 Mini gimbal').id);
  assert.deepEqual(names(gaps[0].options.map((o) => o.itemId)), ['DJI RS 5 gimbal']);
  // Mirrorless with a prime: fine. With the zoom: too heavy.
  assert.equal(kitGaps([line('Sony ZV-E1'), line('Sony FE 50mm f/1.8'), line('DJI RS 3 Mini gimbal')], shelf()).length, 0);
  assert.match(kitGaps([line('Sony ZV-E1'), line('Sony FE 24-70mm f/2.8 GM'), line('DJI RS 3 Mini gimbal')], shelf())[0].body, /with the zoom/);
});

test('kitGaps: options leave out gear already in the bag or booked on the days', () => {
  const s = shelf({ 'Sony FE 24-70mm f/2.8 GM': 1 });
  const gaps = kitGaps([{ itemId: byName('Sony FX3 cinema camera', s).id, qty: 1 }], s);
  assert.ok(!names(gaps[0].options.map((o) => o.itemId), s).includes('Sony FE 24-70mm f/2.8 GM'));
});
