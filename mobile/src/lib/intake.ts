import type { Answers, ShootType } from '@/planner/types';
import { LAGOS_AREAS } from './format';

/**
 * Reads a typed or spoken description into planner answers, on the phone (works offline, costs nothing).
 * Only fills what the words clearly say; everything else stays empty so the questions ask for it.
 * "3-person podcast in Lekki on Saturday, two cameras" · "music video Fri to Sun in VI, under 100k"
 *
 * `now` is injectable so tests are deterministic; dates are whole Lagos days (UTC+1, no DST).
 */
export function readShoot(text: string, now = new Date()): Partial<Answers> {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ')} `;
  const has = (...words: string[]) => words.some((w) => new RegExp(`\\b${w}`).test(t));
  const a: Partial<Answers> = {};

  const types: [ShootType, string[]][] = [
    ['podcast', ['podcast', 'pod cast', 'talk show']],
    ['music_video', ['music video', 'mv\\b', 'video shoot for (my|the|a) song', 'visuals']],
    ['short_film', ['short film', 'film\\b', 'movie', 'skit', 'drama', 'series', 'documentary']],
    ['interview', ['interview', 'talking head', 'testimonial', 'q&a']],
    ['photo', ['photo shoot', 'photoshoot', 'photos', 'portrait', 'headshot', 'pictures', 'product shoot']],
    ['event', ['event', 'wedding', 'conference', 'concert', 'church service', 'thanksgiving', 'birthday', 'party', 'coverage']],
    ['content', ['youtube', 'vlog', 'tiktok', 'instagram', 'insta\\b', 'ig\\b', 'reels?\\b', 'content', 'social media', 'ad\\b', 'commercial']],
  ];
  const type = types.find(([, words]) => has(...words));
  if (type) a.shootType = type[0];

  if (has('indoors? and outdoors?', 'inside and outside', 'both indoor')) a.location = 'both';
  else if (has('outdoor', 'outside', 'beach', 'street', 'park\\b', 'field', 'rooftop')) a.location = 'outdoor';
  else if (has('indoor', 'inside', 'studio', 'room\\b', 'office', 'house', 'apartment', 'hall\\b', 'my place', 'home\\b', 'at mine\\b')) a.location = 'indoor';

  if (has('day and night', 'into the night', 'all day')) a.timeOfDay = 'both';
  else if (has('night', 'evening', 'dark\\b')) a.timeOfDay = 'night';
  else if (has('morning', 'afternoon', 'daytime', 'daylight')) a.timeOfDay = 'day';

  // "3 people", "two guests", "3-person podcast", "3 actors", "panel of 4", "a couple" (2), "me and my cohost" (2)
  const people = t.match(new RegExp(`\\b(${NUM})[\\s-]*(${PEOPLE_WORDS})\\b`)) ?? t.match(new RegExp(`\\bpanel of (${NUM})\\b`));
  if (people) a.people = Math.min(12, num(people[1]));
  else if (has('me and my (co-?host|guest|friend|partner)', 'two of us', 'couple\\b(?! of)')) a.people = 2;
  else if (has('solo', 'just me', 'by myself')) a.people = 1;
  const cams = t.match(/\b(\d|one|two|three|four)[\s-]*(cameras?|cams?|angles?)\b/);
  if (cams) a.angles = num(cams[1]);
  else if (has('multi-?cam')) a.angles = 3;

  if (has('no sound', 'no audio', 'playback', 'lip ?sync')) a.sound = 'none';
  else if (has('desk mic', 'podcast mic', 'podmic')) a.sound = 'desk';
  else if (has('lapel', 'lavalier', 'clip-?on', 'wireless mic')) a.sound = 'clip';
  else if (a.shootType === 'podcast') a.sound = 'desk';

  if (has('gimbal', 'moving shots?', 'tracking', 'walk and talk', 'smooth')) a.movement = true;
  else if (has('tripod', 'static', 'seated', 'sitting')) a.movement = false;

  // Delivery: "deliver to Ajah", "need delivery to Ajah", "drop off in Lekki". The area after it wins.
  const drop = t.match(/\b(deliver(?:ed|y)?|drop(?:ped)?[\s-]?(?:it |them )?off|bring (?:it|them|the gear))\b/);
  if (drop) a.delivery = 'delivery';
  else if (has('pick ?up', 'pick it up', 'collect it', "i'll come for")) a.delivery = 'pickup';
  const area = (drop ? findArea(t.slice((drop.index ?? 0) + drop[0].length)) : undefined) ?? findArea(t);
  if (area) a.area = area;

  const when = readDates(t, now);
  // A length without a start ("2 days") is kept so the calendar can pre-fill the range.
  if (when?.first) Object.assign(a, shootWindow(when.first, when.last ?? addDays(when.first, (when.days ?? 1) - 1)));
  else if (when?.days) a.days = when.days;

  if (has('cheap', 'tight budget', 'low budget', 'small budget', 'lean')) a.budget = 'low';
  else if (has('premium', 'best\\b', 'cinematic', 'top notch', 'top-notch', 'big budget')) a.budget = 'high';
  const naira = readBudget(t);
  if (naira) a.budgetKobo = naira * 100;

  const pinned = readNames(t);
  if (pinned.length) a.pinnedNames = pinned;

  return a;
}

/** A whole-day plan window: 08:00 on the first day to the start of the day after the last (Lagos). */
export function shootWindow(first: string, last: string): { startsAt: string; endsAt: string } {
  return { startsAt: `${first}T08:00:00+01:00`, endsAt: `${addDays(last < first ? first : last, 1)}T00:00:00+01:00` };
}

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2,
};
const NUM = '\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten';
const num = (w: string) => WORDS[w] ?? Number(w);
const PEOPLE_WORDS = [
  'people', 'persons?', 'guests?', 'hosts?', 'speakers?', 'man', 'men', 'woman', 'women', 'actors?', 'actresses?',
  'models?', 'panell?ists?', 'cast members?', 'dancers?', 'artistes?', 'artists?', 'kids', 'children', 'participants?',
  'presenters?', 'talents?', 'friends', 'girls', 'guys',
].join('|');

const ALIASES: [RegExp, string][] = [[/\bv\.?\s?i\b|\bv\/i\b/, 'Victoria Island'], [/\bfestac town\b/, 'Festac'], [/\blekki phase\b/, 'Lekki']];

/** The first Lagos area mentioned in `s`. */
function findArea(s: string): string | undefined {
  let best: { at: number; name: string } | undefined;
  for (const ar of LAGOS_AREAS) {
    const at = s.search(new RegExp(`\\b${ar.toLowerCase()}\\b`));
    if (at >= 0 && (!best || at < best.at)) best = { at, name: ar };
  }
  for (const [re, name] of ALIASES) {
    const at = s.search(re);
    if (at >= 0 && (!best || at < best.at)) best = { at, name };
  }
  return best?.name;
}

/**
 * Naira amounts: "under 100k", "₦150,000", "150k max", "budget of 80k", "N200k", "1.5m naira".
 * Returns naira (not kobo), or undefined when no amount reads as a budget.
 */
function readBudget(t: string): number | undefined {
  const amount = (n: string, unit = '') => {
    const v = Number(n.replace(/,/g, ''));
    return v * (unit === 'k' ? 1e3 : unit === 'm' ? 1e6 : 1);
  };
  const AMT = '(\\d[\\d,]*(?:\\.\\d+)?)\\s?(k|m)?\\b';
  const tries: RegExp[] = [
    new RegExp(`(?:₦|\\bngn\\s?|\\bn(?=\\d))\\s?${AMT}`),
    new RegExp(`${AMT}\\s*(?:naira|ngn)\\b`),
    new RegExp(`\\b(?:under|below|less than|max(?:imum)?|budget(?: is| of)?|within|up to|not more than|no more than)\\s*(?:₦|n)?\\s?${AMT}`),
    new RegExp(`${AMT}\\s*(?:max|tops|budget|or less)\\b`),
    /\b(\d{2,3}(?:\.\d)?)\s?(k)\b/, // not "4k" (video resolution)
  ];
  for (const re of tries) {
    const m = t.match(re);
    if (!m) continue;
    const v = amount(m[1], m[2]);
    if (v >= 1000 && v <= 100_000_000) return Math.round(v);
  }
  return undefined;
}

/**
 * Gear the renter named ("FX3", "24-70", "RODECaster", "ZV-E1"). The phone doesn't have the catalogue
 * here, so these stay as words; the planner matches them to listings (planner/match pinnedItems).
 */
function readNames(t: string): string[] {
  const out: string[] = [];
  const add = (s: string) => { const v = s.trim(); if (v && !out.includes(v)) out.push(v); };
  const patterns: RegExp[] = [
    /\bfx\s?-?\d{1,2}\b/g, /\bzv-?e\d{1,2}\b/g, /\ba7\s?(?:s|r|c)?\s?(?:iii|iv|ii|3|4)\b/g,
    /\brode\s?caster(?:\s?pro)?(?:\s?(?:ii|2))?\b/g, /\bpod\s?mic\b/g, /\bwireless\s(?:go|pro)\b/g,
    /\b(?:dji\s)?rs\s?\d(?:\s?mini)?\b/g, /\bf22c\b/g, /\bcob\s?\d{2,3}x?\b/g, /\bsl\s?\d{2,3}w\b/g, /\bpavo\s?tube\b/g, /\bmc\s?pro\b/g,
    /\b\d{2,3}\s?mm\b/g,
  ];
  for (const re of patterns) for (const m of t.matchAll(re)) add(m[0]);
  // Zoom ranges ("24-70", "16-35mm"), but not date ranges ("14-16 nov").
  for (const m of t.matchAll(/\b(\d{2,3})-(\d{2,3})(?:\s?mm)?\b(?!\s*(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/g)) {
    if (Number(m[2]) > Number(m[1]) && Number(m[1]) >= 10) add(`${m[1]}-${m[2]}`);
  }
  // "70mm" inside "24-70mm" is the zoom, not a prime.
  return out.filter((n) => !/^\d+\s?mm$/.test(n) || !out.some((o) => o.includes('-') && n.startsWith(o.split('-')[1])));
}

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const ORD = '(\\d{1,2})(?:st|nd|rd|th)?';
const TO = '\\s*(?:to|till|until|thru|through|-|–|—)\\s*';
/** Full weekday names, Sunday first; abbreviations only count with context ("on sat", "Fri to Sun"). */
const WD: [full: string, short: string][] = [
  ['sunday', 'sun'], ['monday', 'mon'], ['tuesday', 'tues?'], ['wednesday', 'wed'], ['thursday', 'thu(?:rs?)?'], ['friday', 'fri'], ['saturday', 'sat'],
];
const ANY_WD = WD.map(([f, s]) => `${f}|${s}`).join('|');

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dow = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const wdIndex = (w: string) => WD.findIndex(([f, s]) => new RegExp(`^(?:${f}|${s})$`).test(w));

type Read = { first?: string; last?: string; days?: number };

/**
 * Rental days in the words: ranges ("Fri to Sun", "14–16 Nov", "14 to 16 November"), weekends,
 * single days ("tmrw", "next sat", "the 18th", "14 Nov") and lengths ("2 days", "for a week").
 * Never earlier than tomorrow (bookings start tomorrow).
 */
function readDates(t: string, now: Date): Read | undefined {
  const today = new Date(now.getTime() + 3.6e6).toISOString().slice(0, 10);
  const tomorrow = addDays(today, 1);
  const out: Read = {};

  /** The next date with this day of the month and month (this year, else next year). */
  const dayMonth = (dd: number, mon: string) => {
    const m = MONTHS.indexOf(mon.slice(0, 3));
    const y = Number(today.slice(0, 4));
    const make = (yy: number) => new Date(Date.UTC(yy, m, dd)).toISOString().slice(0, 10);
    const d = make(y);
    return d < tomorrow ? make(y + 1) : d;
  };
  /** The next date with this day of the month (this month, else next month). */
  const dayOnly = (dd: number) => {
    const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
    const d = new Date(Date.UTC(y, m, dd)).toISOString().slice(0, 10);
    return d >= tomorrow && Number(d.slice(8)) === dd ? d : new Date(Date.UTC(y, m + 1, dd)).toISOString().slice(0, 10);
  };
  /** "sat", "this friday", "next sat": the next such day after today ("next" skips this week's). */
  const weekday = (w: string, prefix?: string) => {
    const i = wdIndex(w);
    if (prefix === 'next') {
      // Next week's day (weeks start on Monday): "next sat" on a Wednesday is 10 days away, "next mon" 5.
      const nextMonday = addDays(today, 7 - ((dow(today) + 6) % 7));
      return addDays(nextMonday, (i + 6) % 7);
    }
    return addDays(today, (i - dow(today) + 7) % 7 || 7);
  };

  let m: RegExpMatchArray | null;
  if ((m = t.match(new RegExp(`\\b${ORD}\\s+(?:of\\s+)?${MON}${TO}${ORD}\\s+(?:of\\s+)?${MON}`)))) {
    out.first = dayMonth(Number(m[1]), m[2]); out.last = dayMonth(Number(m[3]), m[4]);
    if (out.last < out.first) out.last = addDays(out.last, 365);
  } else if ((m = t.match(new RegExp(`\\b(?:from\\s+)?(?:the\\s+)?${ORD}${TO}(?:the\\s+)?${ORD}\\s+(?:of\\s+)?${MON}`)))) {
    out.last = dayMonth(Number(m[2]), m[3]);
    const startMonth = Number(m[1]) <= Number(m[2]) ? m[3] : MONTHS[(MONTHS.indexOf(m[3].slice(0, 3)) + 11) % 12];
    out.first = dayMonth(Number(m[1]), startMonth);
  } else if ((m = t.match(new RegExp(`\\b${MON}\\s+${ORD}${TO}${ORD}\\b`)))) {
    out.first = dayMonth(Number(m[2]), m[1]); out.last = dayMonth(Number(m[3]), m[1]);
  } else if ((m = t.match(new RegExp(`\\b(?:(this|next|coming)\\s+)?(${ANY_WD})${TO}(${ANY_WD})\\b`)))) {
    out.first = weekday(m[2], m[1]);
    out.last = addDays(out.first, (wdIndex(m[3]) - wdIndex(m[2]) + 7) % 7);
  } else if ((m = t.match(/\bfrom the (\d{1,2})(?:st|nd|rd|th)? (?:to|till|until|-) (?:the )?(\d{1,2})(?:st|nd|rd|th)?\b/))) {
    out.first = dayOnly(Number(m[1])); out.last = addDays(out.first, Math.max(0, Number(m[2]) - Number(m[1])));
  } else if ((m = t.match(/\b(this|next|coming)?\s?weekend\b/))) {
    // Saturday and Sunday. On a Saturday "this weekend" is just Sunday (bookings start tomorrow).
    const d = dow(today);
    const sat = d === 6 ? today : d === 0 ? addDays(today, 6) : addDays(today, 6 - d);
    const s = m[1] === 'next' ? addDays(sat, 7) : sat;
    out.first = s < tomorrow ? tomorrow : s; out.last = addDays(s, 1);
  } else if (/\b(tomorrow|tmrw|tmr|tmoro|2moro)\b/.test(t)) {
    out.first = tomorrow;
  } else if ((m = t.match(new RegExp(`\\b${ORD}\\s+(?:of\\s+)?${MON}`)) ?? t.match(new RegExp(`\\b${MON}\\s+${ORD}\\b`)))) {
    const [dd, mon] = /\d/.test(m[1]) ? [Number(m[1]), m[2]] : [Number(m[2]), m[1]];
    out.first = dayMonth(dd, mon);
  } else if ((m = t.match(new RegExp(`\\b(?:(this|next|coming)\\s+)?(${WD.map(([f]) => f).join('|')})\\b`)) ??
                  t.match(new RegExp(`\\b(?:on|by|this|next|coming)\\s+(?:(this|next)\\s+)?(${WD.map(([, s]) => s).join('|')})\\b`)))) {
    const prefix = m[1] ?? (/\bnext\s/.test(m[0]) ? 'next' : undefined);
    out.first = weekday(m[2], prefix);
  } else if ((m = t.match(/\b(?:on |for |by )?the (\d{1,2})(?:st|nd|rd|th)\b/))) {
    const dd = Number(m[1]);
    if (dd >= 1 && dd <= 31) out.first = dayOnly(dd);
  }

  // Lengths: "2 days", "a 3-day shoot", "for a week", "a couple of days"
  const len = t.match(new RegExp(`\\b(${NUM}|a|an|couple of)[\\s-]*(days?|weeks?)\\b`));
  if (len && !out.last) {
    const n = len[1] === 'couple of' ? 2 : num(len[1]);
    const days = Math.min(30, n * (len[2].startsWith('week') ? 7 : 1));
    if (days >= 1) out.days = days;
  }
  if (!out.first && !out.days) return undefined;
  if (out.first && out.first > addDays(today, 365)) return out.days ? { days: out.days } : undefined;
  return out;
}
