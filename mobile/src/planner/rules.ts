// Sizing rules: event answers → Good / Better / Best setups (PRD §4.2).
//
// Fixed, deterministic rules, not AI. Same answers + same RULES_VERSION = same setups, so a saved
// recommendation (recommendations.rules_version) can always be explained later.
//
// !! Before launch an AV / sound engineer must review every number in this file (PRD §8 Q6).
// !! The ratios below are sensible starting points, not field-tested values.
//
// Pure TypeScript only: no React Native, Expo or Supabase imports (runs offline on the device).

import type {
  Answers,
  CategoryKey,
  EventType,
  Group,
  Level,
  Line,
  PowerSource,
  RoomSize,
  Setup,
  SpecNeed,
  StageAct,
  StreamMode,
  Venue,
  CrowdBand,
} from './types';

export const RULES_VERSION = '2026-10-09.1';

export const LEVELS: Level[] = ['good', 'better', 'best'];

// ---------------------------------------------------------------------------------------------
// Constants (each one is a rule an AV engineer should check)
// ---------------------------------------------------------------------------------------------

/** People one powered top covers. Sound fades faster outdoors with no walls to reflect it. */
const PEOPLE_PER_TOP: Record<Venue, number> = { indoor: 100, covered: 70, open: 50 };

/** Beyond this many box speakers a line array throws further and cleaner; cap boxes per level. */
const MAX_BOX_TOPS: Record<Level, number> = { good: 16, better: 24, best: 32 };

/** Subwoofers per level for box-speaker rigs. */
const MAX_SUBS: Record<Level, number> = { good: 6, better: 8, best: 12 };

/** Open-air (or covered outdoor) crowds this big get a line array at Best. */
const LINE_ARRAY_FROM = 1500;

/** Generator sizes commonly rented in Lagos, in kVA. */
const GENERATOR_KVA = [7.5, 20, 40, 60];
/** Stabiliser (AVR) sizes, in kVA. Above the largest we split the load across several. */
const AVR_KVA = [5, 10, 20];

/** Safety margin on the summed load, and the power factor used to turn kW into kVA. */
const LOAD_HEADROOM = 1.25;
const POWER_FACTOR = 0.8;

/** Seated floor area per person incl. aisles (m²), used to guess the farthest viewer. */
const M2_PER_PERSON = 0.6;
/** Classic AV rule: farthest viewer at most 6 × the image height away. */
const VIEW_DISTANCE_PER_HEIGHT = 6;

/** Lagos is UTC+1 all year. Daylight is roughly 07:00–18:30. */
const LAGOS_OFFSET_MIN = 60;
const DAY_START_MIN = 7 * 60;
const DUSK_MIN = 18 * 60 + 30;

/**
 * Running draw per unit, in watts. These are average draws while the event runs, not amplifier
 * peak ratings (a "1,300 W" powered speaker draws far less on average).
 */
const DRAW_W = {
  boxTop: 400,
  lineArrayBox: 1000,
  sub: 600,
  monitor: 300,
  wirelessReceiver: 15,
  mixerAnalog: 60,
  mixerDigital: 150,
  tv55: 150,
  tv75: 250,
  projector: 450,
  projector10k: 1000,
  ledPerSqFtOutdoor: 40,
  ledPerSqFtIndoor: 30,
  camera: 30,
  switcher: 50,
  streamingKit: 30,
  movingHead: 250,
  par: 100,
};

/** Representative head count for each R3c band (the middle of the band, leaning high). */
const CROWD_BAND_VALUE: Record<CrowdBand, number> = {
  lt100: 80,
  '100-300': 250,
  '300-1000': 700,
  '1000-3000': 2000,
  '3000+': 4000,
};

export function crowdFromBand(band: CrowdBand): number {
  return CROWD_BAND_VALUE[band];
}

/** Which level R6 opens on (user-flows F4 step 1): the one that fits the budget, else Better. */
export function defaultLevel(budget: Answers['budget']): Level {
  if (budget === 'low') return 'good';
  if (budget === 'high') return 'best';
  return 'better';
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

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

/** Speakers come in pairs (left and right), so round up to an even number, at least 2. */
function ceilEven(x: number): number {
  return Math.max(2, Math.ceil(x / 2) * 2);
}

/** First step ≥ x, or the largest step when x is above them all. */
function stepUp(x: number, steps: number[]): number {
  for (const s of steps) if (s >= x) return s;
  return steps[steps.length - 1];
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const VENUE_PHRASE: Record<Venue, string> = {
  indoor: 'indoors',
  covered: 'outdoors under a canopy',
  open: 'in an open field',
};

const DEFAULT_STAGE: Record<EventType, StageAct[]> = {
  service: ['speakers', 'band'],
  crusade: ['speakers', 'band'],
  conference: ['speakers'],
  wedding: ['speakers', 'dj'],
  concert: ['band'],
  launch: ['speakers'],
  party: ['dj'],
  other: ['speakers'],
};

const STAGE_WORD: Record<StageAct, string> = {
  speakers: 'people speaking',
  band: 'a band',
  choir: 'a choir',
  dj: 'a DJ',
  panel: 'a panel',
};

// ---------------------------------------------------------------------------------------------
// Resolve answers ("Not sure" → safe default + a "We assumed…" sentence)
// ---------------------------------------------------------------------------------------------

/** Answers with every "Not sure" replaced by its safe default. */
export interface ResolvedAnswers {
  eventType: EventType;
  venue: Venue;
  outdoor: boolean;
  room: RoomSize | null;
  crowd: number;
  stage: Set<StageAct>;
  stream: StreamMode;
  platform: string | null;
  power: PowerSource;
  daylight: boolean;
  evening: boolean;
  timesKnown: boolean;
  technicianWanted: boolean;
  assumptions: string[];
}

function parseTime(v: string | undefined): number | null {
  if (!v || v === 'unsure') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Does the event overlap daylight and/or evening, in Lagos time? */
function timeOfDay(start: number, end: number): { daylight: boolean; evening: boolean } {
  if (end - start >= 24 * 3600_000) return { daylight: true, evening: true };
  let daylight = false;
  let evening = false;
  // Check every 15 minutes; events are at most a day here, so ≤ 96 steps.
  for (let t = start; t <= end; t += 15 * 60_000) {
    const d = new Date(t + LAGOS_OFFSET_MIN * 60_000);
    const min = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (min >= DAY_START_MIN && min < DUSK_MIN) daylight = true;
    else evening = true;
  }
  return { daylight, evening };
}

function guessRoom(crowd: number): RoomSize {
  if (crowd <= 100) return 'small';
  if (crowd <= 600) return 'hall';
  return 'auditorium';
}

const ROOM_WORD: Record<RoomSize, string> = { small: 'a small room', hall: 'a hall', auditorium: 'an auditorium' };

export function resolveAnswers(a: Answers): ResolvedAnswers {
  const assumptions: string[] = [];

  let eventType: EventType;
  if (a.eventType === 'unsure') {
    eventType = 'other';
    assumptions.push('We assumed a general event with people speaking, so we planned mics and sound for talks.');
  } else eventType = a.eventType;

  let venue: Venue;
  if (a.venue === 'unsure') {
    // Open air needs the most sound and a daylight screen, so it never under-delivers.
    venue = 'open';
    assumptions.push(
      'We assumed it is outdoors in the open, so sound and screens are sized for that. If it is indoors, tell us and it will cost less.',
    );
  } else venue = a.venue;
  const outdoor = venue !== 'indoor';

  let crowd: number;
  if (a.crowd === 'unsure' || !Number.isFinite(a.crowd) || a.crowd <= 0) {
    crowd = 300;
    assumptions.push('We assumed about 300 people.');
  } else crowd = Math.round(a.crowd);

  let room: RoomSize | null = null;
  if (!outdoor) {
    if (a.roomSize && a.roomSize !== 'unsure') room = a.roomSize;
    else {
      room = guessRoom(crowd);
      assumptions.push(`We assumed ${ROOM_WORD[room]} for ${fmt(crowd)} people, to size the screen.`);
    }
  }

  let stageList: StageAct[];
  if (a.stage === 'unsure' || a.stage.length === 0) {
    stageList = DEFAULT_STAGE[eventType];
    assumptions.push(`We assumed ${list(stageList.map((s) => STAGE_WORD[s]))} on stage.`);
  } else stageList = a.stage;

  let stream: StreamMode;
  if (a.stream === 'unsure') {
    stream = 'none';
    assumptions.push('We assumed no recording or livestream. Add one any time.');
  } else stream = a.stream;
  const platform = a.platform && a.platform !== 'unsure' ? a.platform : null;

  let power: PowerSource;
  if (a.power === 'unsure') {
    // No power is the safe case: the event still runs if the venue has nothing.
    power = 'none';
    assumptions.push('We assumed no generator, so we added one.');
  } else power = a.power;

  const start = parseTime(a.startsAt);
  const end = parseTime(a.endsAt);
  let daylight = true;
  let evening = true;
  const timesKnown = start !== null && end !== null && end > start;
  if (timesKnown) ({ daylight, evening } = timeOfDay(start, end));
  else assumptions.push('We did not know the time, so we planned for daylight and added a few lights in case it runs past 6:30pm.');

  let technicianWanted = false;
  if (a.technicianWanted === 'unsure') {
    assumptions.push('We only added a technician where the gear needs one. You can add one when you book.');
  } else technicianWanted = a.technicianWanted === true;

  return {
    eventType,
    venue,
    outdoor,
    room,
    crowd,
    stage: new Set(stageList),
    stream,
    platform,
    power,
    daylight,
    evening,
    timesKnown,
    technicianWanted,
    assumptions,
  };
}

// ---------------------------------------------------------------------------------------------
// Line builders, one per group. Each returns the lines for one level.
// ---------------------------------------------------------------------------------------------

function line(
  key: string,
  category: CategoryKey,
  group: Group,
  qty: number,
  spec: SpecNeed,
  drawWatts: number,
  essential: boolean,
  reasonKey: string,
  reason: string,
): Line {
  return { key, category, group, qty, spec, drawWatts, essential, reasonKey, reason };
}

function soundLines(c: ResolvedAnswers, level: Level, notes: string[]): Line[] {
  const out: Line[] = [];
  const crowdTxt = `${fmt(c.crowd)} people ${VENUE_PHRASE[c.venue]}`;
  const ppt = PEOPLE_PER_TOP[c.venue];
  const raw = c.crowd / ppt;

  // --- Main speakers ("tops") ---
  // Better = 1 top per ppt people. Good = the fewest that still reach the back (75%). Best = 25% more.
  // Best outdoors for very big crowds switches to a line array, which throws sound further.
  const useLineArray = level === 'best' && c.outdoor && c.crowd >= LINE_ARRAY_FROM;
  let tops: number;
  if (useLineArray) {
    // Per side: 4 boxes, plus 1 for every 750 people, up to 12 a side.
    const perSide = Math.min(12, Math.max(4, Math.ceil(c.crowd / 750) + 2));
    tops = perSide * 2;
    out.push(
      line('sound.tops', 'speaker', 'sound', tops, { lineArray: true, powered: true }, DRAW_W.lineArrayBox, true, 'sound.line_array',
        `For ${crowdTxt}, a line array of ${tops} boxes (${perSide} a side) throws clear sound right to the back without deafening the front rows.`),
    );
  } else {
    const factor = level === 'good' ? 0.75 : level === 'better' ? 1 : 1.25;
    const wanted = ceilEven(raw * factor);
    tops = Math.min(wanted, MAX_BOX_TOPS[level]);
    const small = c.room === 'small';
    // Small rooms are fine with 10" boxes; everywhere else needs 1,000 W+ boxes; open air at Best wants 15".
    const spec: SpecNeed = { powered: true, lineArray: false, minWatts: small ? 500 : 1000 };
    if (level === 'best' && c.venue === 'open') spec.minSizeIn = 15;
    const why =
      level === 'good'
        ? 'the fewest that still reach the back rows'
        : level === 'better'
          ? `about 1 for every ${ppt} people, so the back rows hear clearly`
          : 'with headroom, so nobody has to push them to the limit';
    let reason = `For ${crowdTxt}, ${plural(tops, 'speaker')}: ${why}.`;
    if (c.outdoor) reason += ' Outdoors there are no walls to carry the sound, so you need more than indoors.';
    if (wanted > tops) {
      reason += ` ${fmt(tops)} is the most box speakers that makes sense; a line array covers a crowd this big better.`;
      notes.push(`For ${fmt(c.crowd)} people a line array would cover better than box speakers. See Best.`);
    }
    out.push(line('sound.tops', 'speaker', 'sound', tops, spec, DRAW_W.boxTop, true, 'sound.tops', reason));
  }

  // --- Subwoofers: music (band, DJ) and big events need bass ordinary speakers can't make. ---
  const music = c.stage.has('band') || c.stage.has('dj');
  if (music || ['concert', 'crusade', 'party'].includes(c.eventType)) {
    // About 1 sub per 2 tops at Better; Good gets half that; Best at least a pair.
    // Beyond the cap the problem is coverage (tops), not bass. A line array gets ~0.8 subs per box.
    const perTop = level === 'good' ? 1 / 4 : 1 / 2;
    const subs = useLineArray
      ? ceilEven(tops * 0.8)
      : Math.min(MAX_SUBS[level], Math.max(level === 'best' ? 2 : 1, Math.ceil(tops * perTop)));
    const spec: SpecNeed = c.room === 'small' ? {} : { minWatts: 1000 };
    out.push(
      line('sound.subs', 'subwoofer', 'sound', subs, spec, DRAW_W.sub,
        c.eventType === 'concert' || c.eventType === 'party' || c.stage.has('dj'), 'sound.subs',
        `${music ? 'Music' : 'A crowd this size'} needs deep bass that normal speakers can't make: ${plural(subs, 'subwoofer')}${useLineArray ? ', matched to the line array' : subs === MAX_SUBS[level] ? '' : `, about 1 for every ${level === 'good' ? 4 : 2} speakers`}.`),
    );
  }

  // --- Stage monitors: performers must hear themselves or they sing off key. ---
  const MON: Record<StageAct, [number, number, number]> = {
    speakers: [0, 1, 1], // a pulpit/lectern wedge
    band: [2, 4, 5],
    choir: [1, 2, 3],
    dj: [1, 1, 2], // booth monitor
    panel: [0, 1, 1],
  };
  const li = LEVELS.indexOf(level);
  const monParts: string[] = [];
  let monitors = 0;
  for (const act of c.stage) {
    const n = MON[act][li];
    if (n > 0) {
      monitors += n;
      monParts.push(`${fmt(n)} for ${act === 'speakers' ? 'the speaker' : act === 'dj' ? 'the DJ' : `the ${act}`}`);
    }
  }
  if (monitors > 0) {
    out.push(
      line('sound.monitors', 'monitor', 'sound', monitors, { minWatts: 500 }, DRAW_W.monitor, c.stage.has('band'), 'sound.monitors',
        `So the people on stage can hear themselves: ${list(monParts)}.`),
    );
  }

  // --- Mics, by who is on stage. Someone always talks (MC, pastor, host), so 2 wireless always. ---
  const spare = level === 'good' ? 0 : level === 'better' ? 1 : 2;
  let wireless = 2;
  const wParts = ['2 for whoever is speaking'];
  if (c.stage.has('band')) {
    wireless += 2;
    wParts.push('2 for lead singers');
  }
  if (c.stage.has('panel')) {
    wireless += 1;
    wParts.push('1 to pass round for questions');
  }
  if (spare) wParts.push(`${spare} spare in case a battery dies`);
  wireless += spare;
  out.push(
    line('sound.mics_wireless', 'mic', 'sound', wireless, { kinds: ['handheld'], wireless: true }, DRAW_W.wirelessReceiver, true, 'sound.mics_wireless',
      `${plural(wireless, 'wireless mic')}: ${list(wParts)}.`),
  );
  let wired = 0;
  if (c.stage.has('panel')) {
    // One desk mic per panellist; 4 is a typical panel.
    out.push(line('sound.mics_panel', 'mic', 'sound', 4, { wireless: false }, 0, true, 'sound.mics_panel',
      '4 desk mics, one for each panellist, so nobody has to pass a mic around mid-sentence.'));
    wired += 4;
  }
  if (c.stage.has('choir')) {
    // Choir mics on stands, about 1 per 5–6 singers in a typical church choir.
    const n = level === 'good' ? 3 : level === 'better' ? 4 : 6;
    out.push(line('sound.mics_choir', 'mic', 'sound', n, { wireless: false }, 0, true, 'sound.mics_choir',
      `${plural(n, 'mic')} on stands across the choir so every section is heard.`));
    wired += n;
  }
  if (c.stage.has('band')) {
    // Kick, snare, overheads, keys, bass, guitar: about 6 inputs; Best mics the drums fully.
    const n = level === 'best' ? 8 : 6;
    out.push(line('sound.mics_band', 'mic', 'sound', n, { wireless: false }, 0, true, 'sound.mics_band',
      `${plural(n, 'wired mic')} for the band: drums, keys and guitars.`));
    wired += n;
  }

  // --- Mixer: every mic needs a channel, plus 4 for music playback, laptops and instruments. ---
  const mics = wireless + wired;
  const needCh = mics + 4;
  const ch = stepUp(needCh, [12, 16, 24, 32]);
  if (needCh > 32) notes.push(`You need ${fmt(needCh)} mixer inputs; ask the sound engineer about a stage box or a second mixer.`);
  // 16+ channels: digital (scenes saved, run from a tablet). Best is always digital.
  const digital = ch >= 16 || level === 'best';
  const mixerSpec: SpecNeed = { minChannels: ch };
  if (digital) mixerSpec.digital = true;
  out.push(
    line('sound.mixer', 'mixer', 'sound', 1, mixerSpec, digital ? DRAW_W.mixerDigital : DRAW_W.mixerAnalog, true, 'sound.mixer',
      `${plural(mics, 'mic')} plus 4 inputs for music and laptops: a ${ch}-channel mixer${digital ? ', digital so settings are saved and it can be run from a tablet' : ''}.`),
  );

  return out;
}

function screenLines(c: ResolvedAnswers, level: Level): Line[] {
  // Talks, sermons and launches need slides/lyrics on screen; weddings and concerts only when big.
  const core = ['service', 'crusade', 'conference', 'launch'].includes(c.eventType);
  if (!core && c.crowd < 300) return [];
  const essential = core;
  const out: Line[] = [];
  const crowdTxt = fmt(c.crowd);

  if (c.outdoor) {
    // Daylight outdoors washes out any projector, and canopies leak light: outdoor LED walls only.
    const big = c.crowd >= 1000;
    const [w, h] = level === 'best' ? (big ? [16, 9] : [12, 8]) : big ? [12, 8] : [10, 6];
    out.push(
      line('screen.main', 'led_wall', 'screen', 1, { outdoor: true, minWidthFt: w, minHeightFt: h }, Math.round(w * h * DRAW_W.ledPerSqFtOutdoor), essential, 'screen.led_outdoor',
        `Outdoors, daylight washes out projectors, so an outdoor LED wall at least ${w}×${h} ft${big ? ` so ${crowdTxt} people can read it from the back` : ''}.`),
    );
  } else {
    const room = c.room ?? 'hall';
    // Farthest viewer ≈ depth of a roughly square room seating everyone; image height = distance ÷ 6.
    const depthFt = Math.sqrt(c.crowd * M2_PER_PERSON) * 3.281;
    const heightFt = Math.max(6, Math.round(depthFt / VIEW_DISTANCE_PER_HEIGHT));
    if (room === 'small') {
      // Small rooms: a big TV is sharper than a projector and works with the lights on.
      const size = level === 'good' ? 55 : 75;
      const n = level === 'best' ? 2 : 1;
      out.push(
        line('screen.main', 'tv', 'screen', n, { minScreenIn: size }, size >= 75 ? DRAW_W.tv75 : DRAW_W.tv55, essential, 'screen.tv_small_room',
          `In a small room a ${size}" TV is sharp and works with the lights on${n > 1 ? '; 2 so both sides of the room see clearly' : ''}.`),
      );
    } else if (room === 'hall' || level !== 'best') {
      // Halls: 5,000 lm projector (6,000 at Best). Auditoriums: 10,000 lm. Two side screens from 300 people.
      const lumens = room === 'auditorium' ? 10000 : level === 'best' ? 6000 : 5000;
      const n = level !== 'good' && c.crowd >= 300 && room === 'hall' ? 2 : 1;
      out.push(
        line('screen.projector', 'projector', 'screen', n, { minLumens: lumens }, lumens >= 10000 ? DRAW_W.projector10k : DRAW_W.projector, essential, 'screen.projector',
          `For ${room === 'auditorium' ? 'an auditorium' : 'a hall'} of ${crowdTxt} people, a ${fmt(lumens)}-lumen projector is bright enough with the room lights on${n > 1 ? '; 2, one each side of the stage' : ''}.`),
        line('screen.projection_screen', 'projection_screen', 'screen', n, { minHeightFt: heightFt }, 0, essential, 'screen.size_from_distance',
          `The back row is about ${fmt(Math.round(depthFt))} ft away, so the screen needs to be about ${heightFt} ft tall (height = farthest viewer ÷ 6).`),
      );
    } else {
      // Auditorium at Best: an indoor LED wall, bright and sharp without dimming the room.
      out.push(
        line('screen.main', 'led_wall', 'screen', 1, { minWidthFt: 12, minHeightFt: 7 }, Math.round(12 * 7 * DRAW_W.ledPerSqFtIndoor), essential, 'screen.led_indoor',
          `For an auditorium of ${crowdTxt} people, an LED wall at least 12×7 ft stays bright and sharp without dimming the room.`),
      );
    }
  }

  // Better/Best: a TV facing the stage so speakers see slides/lyrics without turning round.
  if (level !== 'good' && c.room !== 'small') {
    const size = level === 'best' ? 75 : 55;
    out.push(
      line('screen.confidence', 'tv', 'screen', 1, { minScreenIn: size }, size >= 75 ? DRAW_W.tv75 : DRAW_W.tv55, false, 'screen.confidence_monitor',
        `A ${size}" TV facing the stage so whoever is speaking sees the slides without turning their back to the crowd.`),
    );
  }
  return out;
}

function cameraLines(c: ResolvedAnswers, level: Level): Line[] {
  if (c.stream === 'none') return [];
  const out: Line[] = [];
  if (c.stream === 'record') {
    const res = level === 'best' ? '4k' : '1080p';
    out.push(
      line('camera.record', 'camera', 'camera', 1, { kinds: ['camcorder', 'dslr', 'cinema'], resolution: res }, DRAW_W.camera, true, 'camera.record',
        `1 ${res === '4k' ? '4K' : 'HD'} camera on a tripod to record the whole event.`),
    );
    return out;
  }
  // Livestream: a switcher mixes several cameras live. 2 is the minimum for cutting between shots.
  const dest = c.platform ? ` to ${c.platform === 'youtube' ? 'YouTube' : c.platform === 'facebook' ? 'Facebook' : c.platform === 'instagram' ? 'Instagram' : c.platform === 'zoom' ? 'Zoom' : 'your platform'}` : '';
  let cams: number;
  if (level === 'best') {
    cams = 4;
    out.push(
      line('camera.live', 'camera', 'camera', 3, { kinds: ['camcorder', 'cinema', 'ptz'], resolution: '4k' }, DRAW_W.camera, true, 'camera.live',
        `3 4K cameras for the stream${dest}: a wide shot, the speaker close up, and the crowd.`),
      line('camera.ptz', 'camera', 'camera', 1, { kinds: ['ptz'] }, DRAW_W.camera, false, 'camera.ptz',
        '1 remote-controlled (PTZ) camera, so one operator can follow the action from the desk.'),
    );
  } else {
    cams = level === 'good' ? 2 : 3;
    out.push(
      line('camera.live', 'camera', 'camera', cams, { kinds: ['camcorder', 'ptz', 'dslr', 'cinema'], resolution: '1080p' }, DRAW_W.camera, true, 'camera.live',
        `${plural(cams, 'HD camera')} for the stream${dest}: ${cams === 2 ? 'a wide shot and a close-up' : 'a wide shot, the speaker close up, and the crowd'}.`),
    );
  }
  out.push(
    line('camera.switcher', 'switcher', 'camera', 1, { minInputs: cams + 1, streams: true }, DRAW_W.switcher, true, 'camera.switcher',
      `A live switcher with at least ${cams + 1} inputs (${cams} cameras plus slides) that streams directly.`),
  );
  // Bonded internet combines several SIMs: needed outdoors (no wired internet) and at Best.
  const bonded = c.outdoor || level === 'best';
  out.push(
    line('camera.internet', 'streaming_kit', 'camera', 1, bonded ? { bonded: true } : {}, DRAW_W.streamingKit, true, 'camera.internet',
      bonded
        ? 'Bonded internet that combines several networks (MTN, Airtel, Glo), so the stream stays up if one drops.'
        : 'A 4G internet kit for the stream. Fine with good signal; Best adds bonded internet.'),
  );
  return out;
}

function lightLines(c: ResolvedAnswers, level: Level): Line[] {
  const li = LEVELS.indexOf(level);
  const out: Line[] = [];
  if (c.eventType === 'concert' || c.eventType === 'party') {
    // Shows need movement and colour: moving heads for effects, pars for colour wash.
    const heads = (c.eventType === 'concert' ? [4, 6, 8] : [2, 4, 6])[li];
    const pars = [4, 8, 12][li];
    out.push(
      line('light.moving', 'light', 'light', heads, { kinds: ['moving_head'] }, DRAW_W.movingHead, c.eventType === 'concert', 'light.moving_heads',
        `${plural(heads, 'moving-head light')} for movement and effects that make the ${c.eventType} feel alive.`),
      line('light.wash', 'light', 'light', pars, { kinds: ['par', 'wash'] }, DRAW_W.par, c.eventType === 'concert', 'light.pars',
        `${plural(pars, 'LED par')} to colour the stage${c.venue === 'indoor' ? ' and walls' : ''}.`),
    );
  } else if (c.evening) {
    // Other events only need to light faces once the sun is down (cameras need it too).
    const pars = [4, 6, 8][li];
    out.push(
      line('light.wash', 'light', 'light', pars, { kinds: ['par', 'wash'] }, DRAW_W.par, false, 'light.stage_wash',
        c.timesKnown
          ? `It runs past 6:30pm, so ${plural(pars, 'stage light')} keep faces visible${c.stream !== 'none' ? ' to the crowd and the cameras' : ''}.`
          : `${plural(pars, 'stage light')} in case it runs past 6:30pm, so faces stay visible.`),
    );
  }
  return out;
}

function powerLines(c: ResolvedAnswers, level: Level, gear: Line[], notes: string[]): { lines: Line[]; loadKva: number } {
  // Sum running draw, add 25% headroom, convert kW → kVA at power factor 0.8.
  const watts = gear.reduce((s, l) => s + l.drawWatts * l.qty, 0);
  const kw = (watts * LOAD_HEADROOM) / 1000;
  const loadKva = Math.ceil((kw / POWER_FACTOR) * 10) / 10;
  const out: Line[] = [];
  const drawTxt = `Your gear draws about ${fmt(Math.round(watts / 100) / 10)} kW; with a safety margin that's ${fmt(loadKva)} kVA`;

  // Generator size: smallest standard size above the load; Best goes one size up for comfort.
  let genKva = stepUp(loadKva, GENERATOR_KVA);
  if (level === 'best') genKva = stepUp(genKva + 0.1, GENERATOR_KVA);
  const genQty = loadKva > GENERATOR_KVA[GENERATOR_KVA.length - 1] ? Math.ceil(loadKva / genKva) : 1;
  const genSpec: SpecNeed = { minKva: genKva };
  // Best: soundproof, so it never drowns out the quiet moments.
  if (level === 'best') genSpec.silent = true;
  const genWhat = `${genQty > 1 ? `${genQty} × ` : 'a '}${fmt(genKva)} kVA generator${genQty > 1 ? 's' : ''}${level === 'best' ? ', soundproof' : ''}`;

  if (c.power === 'none') {
    out.push(line('power.generator', 'generator', 'power', genQty, genSpec, 0, true, 'power.generator',
      `There's no power at the venue. ${drawTxt}, so ${genWhat}.`));
  } else if (c.power === 'grid' && level !== 'good') {
    // Grid power in Lagos can go at any time ("light can go"): Better/Best keep a backup.
    out.push(line('power.generator', 'generator', 'power', genQty, genSpec, 0, false, 'power.backup_generator',
      `Backup in case light goes in the middle of the event. ${drawTxt}, so ${genWhat}.`));
  } else if (c.power === 'generator') {
    notes.push(`Your own generator should be at least ${fmt(stepUp(loadKva, GENERATOR_KVA))} kVA for this setup.`);
  }

  // Stabiliser / surge protector on EVERY setup (PRD §4.2): Lagos surges kill speakers and screens.
  const top = AVR_KVA[AVR_KVA.length - 1];
  const avrQty = loadKva > top ? Math.ceil(loadKva / top) : 1;
  const avrKva = avrQty > 1 ? top : stepUp(loadKva, AVR_KVA);
  out.push(line('power.avr', 'avr', 'power', avrQty, { minKva: avrKva }, 0, true, 'power.avr',
    `Power surges are the most common way gear dies in Lagos. ${avrQty > 1 ? `${avrQty} × ${avrKva} kVA stabilisers, one per circuit, protect` : `A ${fmt(avrKva)} kVA stabiliser protects`} everything; we add one to every setup.`));

  return { lines: out, loadKva };
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/** Size one level. */
export function sizeSetup(answers: Answers, level: Level): Setup {
  const c = resolveAnswers(answers);
  const notes: string[] = [];
  const gear = [...soundLines(c, level, notes), ...screenLines(c, level), ...cameraLines(c, level), ...lightLines(c, level)];
  const power = powerLines(c, level, gear, notes);
  return {
    level,
    rulesVersion: RULES_VERSION,
    lines: [...gear, ...power.lines],
    assumptions: c.assumptions,
    notes,
    loadKva: power.loadKva,
    technicianWanted: c.technicianWanted,
  };
}

/** Good (minimum that works), Better (recommended default), Best (comfortable headroom). */
export function sizeSetups(answers: Answers): Setup[] {
  return LEVELS.map((level) => sizeSetup(answers, level));
}
