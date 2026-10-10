// Sizing rules: shoot answers → Good / Better / Best setups.
//
// Fixed, deterministic rules, not AI. Same answers + same RULES_VERSION = same setups, so a saved
// recommendation (recommendations.rules_version) can always be explained later.
//
// !! A working DP / sound recordist should review these before launch. They are sensible starting
// !! points for Deloo's own stock (Sony bodies, E-mount lenses, Amaran/Aputure lights, RODE audio).
//
// Pure TypeScript only: no React Native, Expo or Supabase imports (runs offline on the device).

import type { Answers, CategoryKey, Group, Level, Line, Location, Setup, ShootType, SoundMode, SpecNeed, TimeOfDay } from './types';

export const RULES_VERSION = '2026-10-10.1';

export const LEVELS: Level[] = ['good', 'better', 'best'];

// ---------------------------------------------------------------------------------------------
// Defaults per shoot type, used when an answer is "Not sure" or missing
// ---------------------------------------------------------------------------------------------

const DEFAULT_PEOPLE: Record<ShootType, number> = {
  podcast: 2, interview: 2, content: 1, music_video: 1, short_film: 2, photo: 1, event: 1, other: 1,
};
const DEFAULT_ANGLES: Record<ShootType, number> = {
  podcast: 2, interview: 2, content: 1, music_video: 1, short_film: 1, photo: 1, event: 2, other: 1,
};
const DEFAULT_SOUND: Record<ShootType, SoundMode> = {
  podcast: 'desk', interview: 'clip', content: 'clip', music_video: 'none', short_film: 'clip', photo: 'none', event: 'clip', other: 'clip',
};
const DEFAULT_MOVEMENT: Record<ShootType, boolean> = {
  podcast: false, interview: false, content: false, music_video: true, short_film: true, photo: false, event: true, other: false,
};

/** Most cameras rolling at once that makes sense to plan for. */
const MAX_ANGLES = 4;

/** Camera grade per level: 1 entry (ZV-E10), 2 (FX30), 3 full frame (ZV-E1), 4 cinema full frame (FX3). */
const CAMERA_GRADE: Record<Level, number> = { good: 1, better: 2, best: 3 };

/** Run-and-gun shoots want a zoom on the main camera; sit-down shoots want fast primes. */
const ZOOM_FIRST: ShootType[] = ['event', 'content'];

const SHOOT_WORD: Record<ShootType, string> = {
  podcast: 'podcast', interview: 'interview', content: 'shoot', music_video: 'music video', short_film: 'film',
  photo: 'photo shoot', event: 'event', other: 'shoot',
};

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** Which level R6 opens on: the one that fits the budget, else Better. */
export function defaultLevel(budget: Answers['budget']): Level {
  if (budget === 'low') return 'good';
  if (budget === 'high') return 'best';
  return 'better';
}

/** 2000 → "2,000" without relying on the device locale. */
export function fmt(n: number): string {
  const s = String(Math.round(n * 10) / 10);
  const [int, dec] = s.split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec ? `${withCommas}.${dec}` : withCommas;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmt(n)} ${n === 1 ? one : many}`;
}

function line(key: string, category: CategoryKey, group: Group, qty: number, spec: SpecNeed, essential: boolean, reasonKey: string, reason: string): Line {
  return { key, category, group, qty, spec, essential, reasonKey, reason };
}

// ---------------------------------------------------------------------------------------------
// Resolve answers ("Not sure" → safe default + a "We assumed…" sentence)
// ---------------------------------------------------------------------------------------------

export interface ResolvedAnswers {
  shootType: ShootType;
  location: Location;
  timeOfDay: TimeOfDay;
  people: number;
  angles: number;
  sound: SoundMode;
  movement: boolean;
  /** Needs its own light: indoors, or any part after dark. */
  needsLight: boolean;
  /** Daylight outdoors only: lights just fill shadows. */
  daylightOutdoors: boolean;
  assumptions: string[];
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

export function resolveAnswers(a: Answers): ResolvedAnswers {
  const assumptions: string[] = [];

  let shootType: ShootType;
  if (a.shootType === 'unsure') {
    shootType = 'other';
    assumptions.push('We planned a general video shoot: one camera, clip-on mics and a key light.');
  } else shootType = a.shootType;

  let location: Location;
  if (a.location === 'unsure') {
    // Indoors needs the most light, so it never under-delivers.
    location = 'indoor';
    assumptions.push('We assumed you’re shooting indoors, so we added lights. Outdoors in daylight needs fewer.');
  } else location = a.location;

  let timeOfDay: TimeOfDay;
  if (a.timeOfDay === 'unsure') {
    timeOfDay = 'day';
    assumptions.push('We assumed a daytime shoot.');
  } else timeOfDay = a.timeOfDay;

  let people = count(a.people);
  if (people === null) {
    people = DEFAULT_PEOPLE[shootType];
    assumptions.push(`We assumed ${plural(people, 'person', 'people')} on camera.`);
  }

  let angles = count(a.angles);
  if (angles === null) {
    angles = DEFAULT_ANGLES[shootType];
    assumptions.push(`We planned ${plural(angles, 'camera angle')}, usual for a ${SHOOT_WORD[shootType]}.`);
  }
  angles = Math.min(MAX_ANGLES, angles);

  let sound: SoundMode;
  if (a.sound === 'unsure') {
    sound = DEFAULT_SOUND[shootType];
    assumptions.push(sound === 'desk' ? 'We added desk mics, one per person.' : sound === 'clip' ? 'We added clip-on wireless mics for clean voices.' : 'We didn’t add mics: sound comes from playback or isn’t needed.');
  } else sound = a.sound;

  let movement: boolean;
  if (a.movement === 'unsure') {
    movement = DEFAULT_MOVEMENT[shootType];
    if (movement) assumptions.push('We added a gimbal for smooth moving shots.');
  } else movement = a.movement;

  const night = timeOfDay !== 'day';
  return {
    shootType, location, timeOfDay, people, angles, sound, movement,
    needsLight: location !== 'outdoor' || night,
    daylightOutdoors: location === 'outdoor' && !night,
    assumptions,
  };
}

// ---------------------------------------------------------------------------------------------
// Line builders, one per group
// ---------------------------------------------------------------------------------------------

function cameraGrade(c: ResolvedAnswers, level: Level): number {
  // Films and music videos lean on the image: Best goes to a cinema body.
  if (level === 'best' && (c.shootType === 'short_film' || c.shootType === 'music_video')) return 4;
  return CAMERA_GRADE[level];
}

function cameraLines(c: ResolvedAnswers, level: Level): Line[] {
  const grade = cameraGrade(c, level);
  const what = grade >= 4 ? 'a full-frame cinema camera' : grade >= 3 ? 'full-frame cameras' : grade >= 2 ? 'cameras with better low light and colour' : 'light 4K cameras';
  const angles = c.angles === 1
    ? '1 camera'
    : c.shootType === 'podcast' || c.shootType === 'interview'
      ? `${c.angles} cameras: a wide shot and ${c.angles === 2 ? 'a close-up' : 'close-ups on each person'}`
      : `${c.angles} cameras rolling at once`;
  const spec: SpecNeed = { minGrade: grade };
  return [line('camera.main', 'camera', 'camera', c.angles, spec, true, 'camera.main',
    `${angles}. ${level === 'good' ? 'The lightest kit that still shoots clean 4K.' : `${what[0].toUpperCase()}${what.slice(1)}${grade >= 3 ? ' for shallow focus and clean low light' : ''}.`} Bodies come without a lens, so we added one each.`)];
}

function lensLines(c: ResolvedAnswers, level: Level): Line[] {
  const out: Line[] = [];
  // Full-frame bodies need full-frame lenses (an APS-C lens leaves dark corners).
  const fullFrame = cameraGrade(c, level) >= 3 ? true : undefined;
  const grade = level === 'good' ? undefined : 2;
  let primes = c.angles;
  if (ZOOM_FIRST.includes(c.shootType) && level !== 'good') {
    out.push(line('lens.zoom', 'lens', 'lens', 1, { kinds: ['zoom'], fullFrame }, true, 'lens.zoom',
      'A 24–70 zoom on the main camera: wide to close-up without changing lenses while things happen.'));
    primes -= 1;
  }
  if (primes > 0) {
    const spec: SpecNeed = { kinds: ['prime'], fullFrame };
    if (grade) spec.minGrade = grade;
    out.push(line('lens.prime', 'lens', 'lens', primes, spec, true, 'lens.prime',
      `${plural(primes, 'prime lens', 'prime lenses')}${out.length ? ' for the other cameras' : ''}: bright (f/1.8 or faster) for soft backgrounds and less light needed.`));
  }
  return out;
}

function lightLines(c: ResolvedAnswers, level: Level, notes: string[]): Line[] {
  const out: Line[] = [];
  const li = LEVELS.indexOf(level);
  if (c.daylightOutdoors) {
    // The sun is the key light; at Better/Best a battery light fills shadows on faces.
    if (level === 'good') return out;
    out.push(line('light.fill', 'light', 'light', 1, level === 'best' ? { kinds: ['mat'], battery: true } : { kinds: ['panel', 'mat'], battery: true }, false, 'light.outdoor_fill',
      `Outdoors the sun does most of the work. A battery light fills the shadows on faces${level === 'best' ? '; the big soft mat looks most natural' : ''}.`));
    return out;
  }
  if (!c.needsLight) return out;
  const outdoorNight = c.location === 'outdoor';
  // Key light: does the main lighting on faces. Outdoors at night it must run on battery.
  const keySpec: SpecNeed = outdoorNight ? { kinds: ['mat', 'panel'], battery: true } : { kinds: ['cob', 'mat'] };
  const keys = c.people >= 3 && level === 'best' ? 2 : 1;
  out.push(line('light.key', 'light', 'light', keys, keySpec, true, 'light.key',
    `${keys === 2 ? '2 key lights so every face is lit evenly' : 'A key light, the main light on faces'}${outdoorNight ? ', on battery since there’s no power outside' : ': cameras need far more light than the room has'}.`));
  if (outdoorNight) notes.push('Battery lights run on V-mount batteries. Bring charged batteries, or ask us about adding some.');
  if (li >= 1 && c.shootType !== 'event') {
    out.push(line('light.fill', 'light', 'light', 1, { kinds: ['cob', 'panel', 'mat'] }, false, 'light.fill',
      'A fill light on the other side softens shadows, so faces look natural, not harsh.'));
  }
  const accents = c.shootType === 'music_video' ? [0, 1, 2][li] : [0, 0, 1][li];
  if (accents) {
    out.push(line('light.accent', 'light', 'light', accents, { kinds: ['tube', 'panel'], rgb: true }, false, 'light.accent',
      `${accents === 1 ? 'A colour light' : `${accents} colour lights`} behind ${c.shootType === 'music_video' ? 'the artist for mood' : 'you to separate you from the background'}.`));
  }
  return out;
}

function audioLines(c: ResolvedAnswers, level: Level, notes: string[]): Line[] {
  const out: Line[] = [];
  if (c.sound === 'none') return out;
  if (c.sound === 'desk') {
    if (c.people === 1 && level === 'good') {
      out.push(line('audio.mics', 'mic', 'audio', 1, { kinds: ['podcast'], usb: true }, true, 'audio.usb_mic',
        'A broadcast mic that plugs straight into your laptop by USB. Nothing else needed.'));
      return out;
    }
    out.push(line('audio.mics', 'mic', 'audio', c.people, { kinds: ['podcast'] }, true, 'audio.desk_mics',
      `${plural(c.people, 'broadcast mic')}, one per person, so every voice is close and clear.`));
    out.push(line('audio.mixer', 'mixer', 'audio', 1, { minChannels: Math.min(4, c.people), records: true }, c.people >= 2, 'audio.mixer',
      `A podcast mixer to run ${c.people >= 2 ? `all ${c.people} mics` : 'the mic'} and record straight to a memory card.`));
    if (c.people > 4) notes.push(`The RODECaster takes 4 mics. For ${c.people} people, guests can share a mic or we can plan a bigger setup.`);
  } else {
    // Clip-on wireless kits carry 2 mics each.
    const kits = Math.ceil(c.people / 2);
    out.push(line('audio.wireless', 'mic', 'audio', kits, { kinds: ['lavalier'], wireless: true }, true, 'audio.wireless',
      `${kits === 1 ? 'A wireless kit with 2 clip-on mics' : `${kits} wireless kits (2 clip-on mics each)`} for ${plural(c.people, 'person', 'people')}: clean voices even when they move.`));
  }
  if (level !== 'good') {
    out.push(line('audio.headphones', 'headphones', 'audio', 1, {}, false, 'audio.headphones',
      'Headphones to check the sound while you record. Bad audio can’t be fixed later.'));
  }
  return out;
}

function gripLines(c: ResolvedAnswers, level: Level, lights: Line[]): Line[] {
  const out: Line[] = [];
  if (c.movement) {
    const heavy = cameraGrade(c, level) >= 3 || lights.length > 0 && level === 'best';
    out.push(line('grip.gimbal', 'gimbal', 'grip', 1, { minPayloadKg: heavy ? 3 : 2 }, true, 'grip.gimbal',
      `A gimbal for smooth moving shots${heavy ? ', strong enough for a full-frame body and lens' : ''}.`));
  }
  if (c.shootType === 'photo' && level !== 'good') {
    out.push(
      line('grip.backdrop', 'backdrop', 'grip', 1, { kinds: ['paper'] }, false, 'grip.backdrop', 'A seamless paper backdrop for clean studio portraits.'),
      line('grip.backdrop_stand', 'grip', 'grip', 1, { kinds: ['backdrop_stand'] }, false, 'grip.backdrop_stand', 'A backdrop stand to hang the paper.'),
    );
  }
  if (level === 'best' && lights.some((l) => l.key === 'light.key' && l.spec.kinds?.includes('cob'))) {
    out.push(line('grip.c_stand', 'grip', 'grip', 1, { kinds: ['c_stand'] }, false, 'grip.c_stand',
      'A C-stand to hold the key light high and steady, with an arm to place it exactly.'));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/** Size one level. */
export function sizeSetup(answers: Answers, level: Level): Setup {
  const c = resolveAnswers(answers);
  const notes: string[] = [];
  const lights = lightLines(c, level, notes);
  const lines = [...cameraLines(c, level), ...lensLines(c, level), ...lights, ...audioLines(c, level, notes), ...gripLines(c, level, lights)];
  if (c.sound === 'none' && c.shootType === 'music_video') notes.push('Music videos are shot to playback, so we didn’t add mics.');
  return { level, rulesVersion: RULES_VERSION, lines, assumptions: c.assumptions, notes };
}

/** Good (minimum that works), Better (recommended default), Best (comfortable headroom). */
export function sizeSetups(answers: Answers): Setup[] {
  return LEVELS.map((level) => sizeSetup(answers, level));
}
