// "Often booked with": what goes with a piece of Deloo's own gear, and what a bag is missing to work.
// Pure and deterministic (no React Native or Supabase), like the rest of the planner. Spec keys are
// the ones in supabase/inventory_deloo.sql and categories.spec_schema (0009): camera/lens `full_frame`,
// lens `kind` zoom|prime, gimbal `payload_kg`, light `kind` cob|mat|panel|tube, mic `kind` and `usb`,
// grip `kind` c_stand|light_stand|mic_stand|backdrop_stand.

/** The little we need to know about an item. `freeUnits` is set when it was counted for some days. */
export type Gear = { id: string; category: string; name: string; specs: Record<string, unknown>; dayRateKobo?: number; freeUnits?: number };
/** A suggested item and why, in a few plain words. */
export type Pairing = { itemId: string; reason: string };
export type Complements = { pairs: Pairing[]; notes: string[] };
/** Something the bag needs to work, with the items that fix it (best first). */
export type Gap = { key: 'lens' | 'mixer' | 'stand' | 'backdrop_stand' | 'gimbal'; title: string; body: string; options: Pairing[]; replaces?: string };
export type KitLine = { itemId: string; qty: number };

const NOTE_CARDS = 'Bring your own memory cards (fast SD, V60 or better). We don’t stock them yet.';
const NOTE_VMOUNT = 'Runs on V-mount batteries, which we don’t stock yet. Bring your own, or use it on mains power.';

const kind = (g: Gear) => String(g.specs.kind ?? '');
const fullFrame = (g: Gear) => g.specs.full_frame === true;
const payload = (g: Gear) => (typeof g.specs.payload_kg === 'number' ? g.specs.payload_kg : 0);
const rate = (g: Gear) => g.dayRateKobo ?? 0;
const free = (g: Gear) => g.freeUnits === undefined || g.freeUnits > 0;
const byRate = (a: Gear, b: Gear) => rate(a) - rate(b) || a.id.localeCompare(b.id);

const isBody = (g: Gear) => g.category === 'camera';
const isLens = (g: Gear) => g.category === 'lens';
const isGimbal = (g: Gear) => g.category === 'gimbal';
const isXlrMic = (g: Gear) => g.category === 'mic' && kind(g) === 'podcast' && g.specs.usb !== true;
const isPodMic = (g: Gear) => g.category === 'mic' && kind(g) === 'podcast';
const isClipMic = (g: Gear) => g.category === 'mic' && g.specs.wireless === true;
/** Big lights that stand on their own stand (the small panel and tube sit anywhere). */
const needsStand = (g: Gear) => g.category === 'light' && (kind(g) === 'cob' || kind(g) === 'mat');
const isLightStand = (g: Gear) => g.category === 'grip' && (kind(g) === 'c_stand' || kind(g) === 'light_stand');
const isBackdropStand = (g: Gear) => g.category === 'grip' && kind(g) === 'backdrop_stand';
const isBackdrop = (g: Gear) => g.category === 'backdrop';

/** A full-frame lens fits every Sony E body; an APS-C lens only the APS-C ones. */
export const lensFits = (lens: Gear, body: Gear) => fullFrame(lens) || !fullFrame(body);

/**
 * Lenses for a body, best first. Full frame: full-frame lenses, the zoom first (wide to close-up in one).
 * APS-C: lenses made for APS-C first (the Sigma 16mm), then the full-frame ones, cheapest first.
 */
function lensesFor(body: Gear, shelf: Gear[]): Gear[] {
  const fits = shelf.filter((g) => isLens(g) && lensFits(g, body));
  return fits.sort((a, b) => fullFrame(body)
    ? Number(kind(b) === 'zoom') - Number(kind(a) === 'zoom') || byRate(a, b)
    : Number(fullFrame(a)) - Number(fullFrame(b)) || byRate(a, b));
}

function lensReason(lens: Gear, body: Gear): string {
  if (!fullFrame(lens)) return 'Wide prime made for APS-C bodies';
  if (kind(lens) === 'zoom') return 'Wide to close-up in one lens';
  return fullFrame(body) ? 'Full-frame lens for this body' : 'Fits this body (a little tighter on APS-C)';
}

/**
 * What a gimbal must carry, in kg. Our notes: the RS 3 Mini (2 kg) is for mirrorless bodies with
 * primes; cinema bodies, or any body with the 24-70 zoom, need the RS 5 (3 kg).
 */
export function payloadNeeded(body: Gear, lenses: Gear[] = []): number {
  return kind(body) === 'cinema' || lenses.some((l) => kind(l) === 'zoom') ? 3 : 2;
}

/** Items that go with `item`, best first, plus notes for what we don't stock. Never the item itself. */
export function oftenBookedWith(item: Gear, shelf: Gear[], limit = 6): Complements {
  const others = shelf.filter((g) => g.id !== item.id && free(g));
  const pairs: Pairing[] = [];
  const notes: string[] = [];
  const add = (gs: Gear[], reason: (g: Gear) => string, max = 99) => {
    for (const g of gs.slice(0, max)) if (!pairs.some((p) => p.itemId === g.id)) pairs.push({ itemId: g.id, reason: reason(g) });
  };
  const headphones = others.filter((g) => g.category === 'headphones').sort(byRate);
  const mixers = others.filter((g) => g.category === 'mixer').sort(byRate);

  if (isBody(item)) {
    add(lensesFor(item, others), (l) => lensReason(l, item), 3);
    const need = payloadNeeded(item);
    add(others.filter((g) => isGimbal(g) && payload(g) >= need).sort((a, b) => payload(a) - payload(b) || byRate(a, b)), () => 'Steady moving shots with this body', 1);
    add(others.filter(isClipMic).sort(byRate), () => 'Clip-on mics for interviews and content', 1);
    notes.push(NOTE_CARDS);
  } else if (isLens(item)) {
    // Bodies it fits; for a full-frame lens, the full-frame bodies first.
    add(others.filter((g) => isBody(g) && lensFits(item, g)).sort((a, b) => Number(fullFrame(b)) - Number(fullFrame(a)) || byRate(a, b)),
      (b) => (fullFrame(b) ? 'Full-frame body this lens fits' : 'APS-C body this lens fits'), 3);
  } else if (isGimbal(item)) {
    add(others.filter((g) => isBody(g) && payloadNeeded(g) <= payload(item)).sort(byRate), () => 'Light enough for this gimbal', 3);
    if (payload(item) < 3) notes.push('Carries mirrorless bodies with primes. For a cinema body or the 24-70mm zoom, take the RS 5.');
  } else if (isXlrMic(item)) {
    add(mixers, (m) => `It plugs in by XLR, not USB. This mixer takes ${m.specs.channels ?? 'several'} mics and records them`);
    add(headphones, () => 'Hear the sound while you record');
  } else if (isPodMic(item)) {
    add(headphones, () => 'Hear the sound while you record');
    add(mixers, () => 'For more than one voice, record them all together');
  } else if (item.category === 'mic') {
    add(headphones, () => 'Check the sound while you record');
  } else if (item.category === 'mixer') {
    add(others.filter(isPodMic).sort((a, b) => Number(isXlrMic(b)) - Number(isXlrMic(a)) || byRate(a, b)), () => 'Broadcast mic for the mixer', 2);
    add(headphones, () => 'Hear the sound while you record');
    notes.push('Records to an SD card. Bring your own (we don’t stock them yet).');
  } else if (item.category === 'headphones') {
    add(mixers, () => 'Podcast studio to plug them into');
  } else if (needsStand(item)) {
    add(others.filter(isLightStand).sort(byRate), () => 'Holds the light up, with an arm to place it');
    if (kind(item) === 'mat') notes.push(NOTE_VMOUNT);
  } else if (isLightStand(item)) {
    add(others.filter(needsStand).sort(byRate), () => 'Light that goes on this stand', 3);
  } else if (isBackdropStand(item)) {
    add(others.filter(isBackdrop).sort(byRate), () => 'Paper to hang on it');
  } else if (isBackdrop(item)) {
    add(others.filter(isBackdropStand).sort(byRate), () => 'Holds the paper up');
  } else if (item.category === 'grip' && kind(item) === 'mic_stand') {
    add(others.filter(isPodMic).sort(byRate), () => 'Mic for this stand', 2);
  }
  return { pairs: pairs.slice(0, limit), notes };
}

/**
 * What the bag needs before it works: bodies without a lens, an XLR PodMic without a mixer, a big light
 * without a stand, a backdrop without its stand, a gimbal too light for the camera. Options are free
 * (when counted) and not already in the bag. Only things that stop the shoot: nice-to-haves stay on
 * the item page.
 */
export function kitGaps(lines: KitLine[], shelf: Gear[]): Gap[] {
  const byId = new Map(shelf.map((g) => [g.id, g]));
  const kit = lines.map((l) => ({ g: byId.get(l.itemId), qty: l.qty })).filter((x): x is { g: Gear; qty: number } => !!x.g);
  const inKit = new Set(kit.map((x) => x.g.id));
  const pool = shelf.filter((g) => !inKit.has(g.id) && free(g));
  const count = (test: (g: Gear) => boolean) => kit.filter((x) => test(x.g)).reduce((n, x) => n + x.qty, 0);
  const gaps: Gap[] = [];

  // Lenses: full-frame bodies take full-frame lenses first; APS-C bodies take whatever is left.
  const ffBodies = count((g) => isBody(g) && fullFrame(g)), apscBodies = count((g) => isBody(g) && !fullFrame(g));
  const ffLenses = count((g) => isLens(g) && fullFrame(g)), apscLenses = count((g) => isLens(g) && !fullFrame(g));
  const shortFF = Math.max(0, ffBodies - ffLenses);
  const shortApsc = Math.max(0, apscBodies - apscLenses - Math.max(0, ffLenses - ffBodies));
  const short = shortFF + shortApsc;
  if (short > 0) {
    const body = kit.find((x) => isBody(x.g) && (shortFF ? fullFrame(x.g) : !fullFrame(x.g)))!.g;
    const bodies = ffBodies + apscBodies;
    const wrongLens = shortFF > 0 ? kit.find((x) => isLens(x.g) && !fullFrame(x.g))?.g : undefined;
    gaps.push({
      key: 'lens',
      title: bodies === 1 ? 'Your camera needs a lens' : `Your cameras need ${short === 1 ? 'one more lens' : `${short} more lenses`}`,
      body: wrongLens
        ? `The ${wrongLens.name} is made for APS-C bodies. The ${body.name} needs a full-frame lens.`
        : 'Our cameras come as body only.',
      options: lensesFor(body, pool).slice(0, 3).map((l) => ({ itemId: l.id, reason: lensReason(l, body) })),
    });
  }

  if (count(isXlrMic) > 0 && count((g) => g.category === 'mixer') === 0) {
    gaps.push({
      key: 'mixer', title: 'Your PodMic needs a mixer', body: 'It plugs in by XLR, not USB, so it needs a mixer to record.',
      options: pool.filter((g) => g.category === 'mixer').sort(byRate).slice(0, 2).map((g) => ({ itemId: g.id, reason: `Takes ${g.specs.channels ?? 'several'} mics and records them` })),
    });
  }

  if (count(needsStand) > 0 && count(isLightStand) === 0) {
    gaps.push({
      key: 'stand', title: count(needsStand) === 1 ? 'Your light needs a stand' : 'Your lights need a stand', body: 'Big lights don’t come with one.',
      options: pool.filter(isLightStand).sort(byRate).slice(0, 2).map((g) => ({ itemId: g.id, reason: 'Holds the light up, with an arm to place it' })),
    });
  }

  if (count(isBackdrop) > 0 && count(isBackdropStand) === 0) {
    gaps.push({
      key: 'backdrop_stand', title: 'Your backdrop needs its stand', body: 'The paper roll hangs on a backdrop support.',
      options: pool.filter(isBackdropStand).sort(byRate).slice(0, 1).map((g) => ({ itemId: g.id, reason: 'Holds the paper up' })),
    });
  }

  // A gimbal must carry the heaviest body in the bag (with the zoom, if the zoom is in the bag).
  const gimbal = kit.find((x) => isGimbal(x.g))?.g;
  const bodies = kit.filter((x) => isBody(x.g)).map((x) => x.g);
  if (gimbal && bodies.length) {
    const lenses = kit.filter((x) => isLens(x.g)).map((x) => x.g);
    const heaviest = [...bodies].sort((a, b) => payloadNeeded(b, lenses) - payloadNeeded(a, lenses) || byRate(b, a))[0];
    const need = payloadNeeded(heaviest, lenses);
    if (payload(gimbal) < need) {
      const zoom = lenses.some((l) => kind(l) === 'zoom') && kind(heaviest) !== 'cinema';
      gaps.push({
        key: 'gimbal', title: 'Your gimbal is too light for this camera',
        body: `The ${gimbal.name} carries up to ${payload(gimbal)} kg: mirrorless bodies with primes. The ${heaviest.name}${zoom ? ' with the zoom' : ''} needs a stronger one.`,
        options: pool.filter((g) => isGimbal(g) && payload(g) >= need).sort(byRate).slice(0, 1).map((g) => ({ itemId: g.id, reason: `Carries up to ${payload(g)} kg` })),
        replaces: gimbal.id,
      });
    }
  }
  return gaps;
}
