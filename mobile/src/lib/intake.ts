import type { Answers, ShootType } from '@/planner/types';
import { LAGOS_AREAS } from './format';

/**
 * Reads a typed or spoken description into planner answers, on the phone (works offline, costs nothing).
 * Only fills what the words clearly say; everything else stays empty so R4 asks for it.
 * "3-person podcast in Lekki on Saturday, two cameras" · "music video at night outdoors, need a gimbal"
 */
export function readShoot(text: string, now = new Date()): Partial<Answers> {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const has = (...words: string[]) => words.some((w) => new RegExp(`\\b${w}`).test(t));
  const a: Partial<Answers> = {};

  const types: [ShootType, string[]][] = [
    ['podcast', ['podcast', 'pod cast', 'talk show']],
    ['music_video', ['music video', 'mv\\b', 'video shoot for (my|the|a) song', 'visuals']],
    ['short_film', ['short film', 'film', 'movie', 'skit', 'drama', 'series', 'documentary']],
    ['interview', ['interview', 'talking head', 'testimonial', 'q&a']],
    ['photo', ['photo shoot', 'photoshoot', 'photos', 'portrait', 'headshot', 'pictures', 'product shoot']],
    ['event', ['event', 'wedding', 'conference', 'concert', 'service', 'birthday', 'party', 'coverage']],
    ['content', ['youtube', 'vlog', 'tiktok', 'instagram', 'reels', 'content', 'social media', 'ad\\b', 'commercial']],
  ];
  const type = types.find(([, words]) => has(...words));
  if (type) a.shootType = type[0];

  if (has('indoors? and outdoors?', 'inside and outside', 'both indoor')) a.location = 'both';
  else if (has('outdoor', 'outside', 'beach', 'street', 'park', 'field', 'rooftop')) a.location = 'outdoor';
  else if (has('indoor', 'inside', 'studio', 'room', 'office', 'house', 'apartment', 'hall')) a.location = 'indoor';

  if (has('day and night', 'into the night', 'all day')) a.timeOfDay = 'both';
  else if (has('night', 'evening', 'dark')) a.timeOfDay = 'night';
  else if (has('morning', 'afternoon', 'daytime', 'daylight')) a.timeOfDay = 'day';

  // "3 people", "two guests", "3-person podcast", "me and my cohost" (2)
  const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const n = (w: string) => WORDS[w] ?? Number(w);
  const people = t.match(/\b(\d|one|two|three|four|five|six)[\s-]*(people|persons?|guests?|hosts?|speakers?|man|woman)\b/);
  if (people) a.people = n(people[1]);
  else if (has('me and my (co-?host|guest|friend|partner)', 'two of us')) a.people = 2;
  else if (has('solo', 'just me', 'by myself')) a.people = 1;
  const cams = t.match(/\b(\d|one|two|three|four)[\s-]*(cameras?|cams?|angles?)\b/);
  if (cams) a.angles = n(cams[1]);
  else if (has('multi-?cam')) a.angles = 3;

  if (has('no sound', 'no audio', 'playback', 'lip ?sync')) a.sound = 'none';
  else if (has('desk mic', 'podcast mic', 'podmic')) a.sound = 'desk';
  else if (has('lapel', 'lavalier', 'clip-?on', 'wireless mic')) a.sound = 'clip';
  else if (a.shootType === 'podcast') a.sound = 'desk';

  if (has('gimbal', 'moving shots?', 'tracking', 'walk and talk', 'smooth')) a.movement = true;
  else if (has('tripod', 'static', 'seated', 'sitting')) a.movement = false;

  const area = LAGOS_AREAS.find((ar) => t.includes(ar.toLowerCase())) ?? (has('vi\\b', 'v\\.i') ? 'Victoria Island' : undefined);
  if (area) a.area = area;

  const when = readDate(t, now);
  if (when) { a.startsAt = when.startsAt; a.endsAt = when.endsAt; }

  if (has('cheap', 'tight budget', 'low budget', 'small budget', 'lean')) a.budget = 'low';
  else if (has('premium', 'best', 'cinematic', 'top notch', 'top-notch', 'big budget')) a.budget = 'high';

  return a;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Saturday", "next Sunday", "14 Nov", "Nov 14", "tomorrow" → one rental day in Lagos, from 8am. */
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
