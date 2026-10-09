import type { Answers, EventType, StageAct } from '@/planner/types';
import { LAGOS_AREAS } from './format';

/**
 * Reads a typed or spoken description into planner answers, on the phone (works offline, costs nothing).
 * Only fills what the words clearly say; everything else stays empty so R4 asks for it.
 * "outdoor crusade, about 2,000 people, livestream on YouTube, we have a generator, Ikeja, Saturday"
 */
export function readEvent(text: string, now = new Date()): Partial<Answers> {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const has = (...words: string[]) => words.some((w) => new RegExp(`\\b${w}`).test(t));
  const a: Partial<Answers> = {};

  const types: [EventType, string[]][] = [
    ['crusade', ['crusade', 'open air service', 'outreach', 'revival']],
    ['wedding', ['wedding', 'reception', 'engagement', 'introduction']],
    ['conference', ['conference', 'seminar', 'summit', 'workshop', 'convention', 'symposium', 'retreat']],
    ['concert', ['concert', 'show', 'gig', 'praise night', 'worship night', 'festival']],
    ['launch', ['launch', 'product', 'activation', 'exhibition']],
    ['party', ['party', 'birthday', 'owambe', 'celebration', 'naming', 'dinner']],
    ['service', ['service', 'church', 'thanksgiving', 'vigil', 'harvest', 'sunday']],
  ];
  const type = types.find(([, words]) => has(...words));
  if (type) a.eventType = type[0];

  if (has('open field', 'open ground', 'open air', 'field', 'stadium', 'park', 'beach', 'open-air')) a.venue = 'open';
  else if (has('canopy', 'canopies', 'tent', 'marquee', 'covered')) a.venue = 'covered';
  else if (has('outdoor', 'outside')) a.venue = 'open';
  else if (has('hall', 'auditorium', 'indoor', 'inside', 'room', 'church', 'hotel', 'ballroom')) a.venue = 'indoor';
  if (a.venue === 'indoor') {
    if (has('auditorium', 'ballroom')) a.roomSize = 'auditorium';
    else if (has('hall')) a.roomSize = 'hall';
    else if (has('small room', 'meeting room', 'room')) a.roomSize = 'small';
  }

  // "2,000 people", "about 2k guests", "500 pax", "1.5k"
  const crowd = t.match(/(\d[\d,.]*)\s*(k\b)?\s*(people|persons|guests|pax|attendees|members|heads|souls|congregation|crowd)?/g)
    ?.map((m) => {
      const mm = m.match(/(\d[\d,.]*)\s*(k\b)?\s*(people|persons|guests|pax|attendees|members|heads|souls|congregation|crowd)?/)!;
      const n = parseFloat(mm[1].replace(/,/g, '')) * (mm[2] ? 1000 : 1);
      return { n, strong: !!mm[3] || !!mm[2] };
    })
    .filter((x) => x.n >= 10 && x.n <= 100000 && (x.strong || x.n >= 50));
  const best = crowd?.find((x) => x.strong) ?? crowd?.[0];
  if (best) a.crowd = Math.round(best.n);

  const stage: StageAct[] = [];
  if (has('band', 'drummer', 'drums', 'instrumentalist')) stage.push('band');
  if (has('choir', 'praise team', 'worship team', 'singers')) stage.push('choir');
  if (has('dj', 'playback', 'deejay')) stage.push('dj');
  if (has('panel', 'panelist')) stage.push('panel');
  if (has('speaker', 'preach', 'sermon', 'minister', 'mc', 'host', 'keynote', 'talk')) stage.push('speakers');
  if (stage.length) a.stage = stage;

  if (has('livestream', 'live stream', 'stream', 'go live', 'broadcast')) {
    a.stream = 'live';
    if (has('youtube')) a.platform = 'youtube';
    else if (has('facebook', 'fb')) a.platform = 'facebook';
    else if (has('instagram', 'ig live')) a.platform = 'instagram';
    else if (has('zoom')) a.platform = 'zoom';
  } else if (has('record', 'video coverage', 'film', 'coverage')) a.stream = 'record';
  else if (has('no stream', 'no livestream', 'no recording')) a.stream = 'none';

  if (has('no light', 'no power', 'no generator', 'need a generator', 'need generator')) a.power = 'none';
  else if (has('we have a generator', 'our generator', 'have gen', 'our gen', 'own generator')) a.power = 'generator';
  else if (has('nepa', 'grid', 'phcn', 'light is steady', 'ekedc', 'ikedc')) a.power = 'grid';

  if (has('sound guy', 'sound engineer', 'technician', 'someone to run', 'operator')) a.technicianWanted = true;

  const area = LAGOS_AREAS.find((ar) => t.includes(ar.toLowerCase())) ?? (has('vi\\b', 'v\\.i') ? 'Victoria Island' : undefined);
  if (area) a.area = area;

  const when = readDate(t, now);
  if (when) { a.startsAt = when.startsAt; a.endsAt = when.endsAt; }

  if (has('cheap', 'tight budget', 'low budget', 'small budget', 'lean')) a.budget = 'low';
  else if (has('premium', 'best', 'excellent', 'top notch', 'top-notch', 'big budget')) a.budget = 'high';

  return a;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Saturday", "next Sunday", "14 Nov", "Nov 14", "tomorrow" → a day in Lagos, setup from 8am, 12 hours. */
function readDate(t: string, now: Date): { startsAt: string; endsAt: string } | undefined {
  const lagos = new Date(now.getTime() + 3.6e6);
  const today = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()));
  let day: Date | undefined;
  if (/\btomorrow\b/.test(t)) day = new Date(today.getTime() + 864e5);
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b(next |this )?${w}\\b`).test(t));
  if (!day && wd >= 0) {
    let diff = (wd - today.getUTCDay() + 7) % 7 || 7;
    if (new RegExp(`\\bnext ${WEEKDAYS[wd]}\\b`).test(t) && diff < 7) diff += 7;
    day = new Date(today.getTime() + diff * 864e5);
  }
  const m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/) ??
    t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (!day && m) {
    const [dd, mon] = /\d/.test(m[1]) ? [Number(m[1]), m[2]] : [Number(m[2]), m[1]];
    let d = new Date(Date.UTC(today.getUTCFullYear(), MONTHS.indexOf(mon), dd));
    if (d < today) d = new Date(Date.UTC(today.getUTCFullYear() + 1, MONTHS.indexOf(mon), dd));
    day = d;
  }
  if (!day) return undefined;
  const ymd = day.toISOString().slice(0, 10);
  const startsAt = `${ymd}T08:00:00+01:00`;
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + 12 * 3.6e6).toISOString() };
}
