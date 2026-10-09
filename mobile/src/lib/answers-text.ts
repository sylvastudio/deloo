import type { Answers } from '@/planner/types';

const TYPE: Record<string, string> = {
  service: 'Church service', crusade: 'Crusade', conference: 'Conference', wedding: 'Wedding', concert: 'Concert',
  launch: 'Product launch', party: 'Party', other: 'Event',
};
const VENUE: Record<string, string> = { indoor: 'Indoors', covered: 'Covered outdoors', open: 'Open outdoors' };
const POWER: Record<string, string> = { grid: 'Grid power', generator: 'Own generator', none: 'No power yet' };
const STREAM: Record<string, string> = { none: 'No stream', record: 'Recording', live: 'Livestream' };
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

/** One short chip label per answered question, in question order, for R4 and the top of R6. */
export function answerChips(a: Partial<Answers>): { key: string; label: string; q: string }[] {
  const out: { key: string; label: string; q: string }[] = [];
  const set = (v: unknown) => v !== undefined && v !== 'unsure';
  if (set(a.eventType)) out.push({ key: 'eventType', q: 'type', label: TYPE[a.eventType as string] });
  if (set(a.venue)) out.push({ key: 'venue', q: 'venue', label: VENUE[a.venue as string] });
  if (typeof a.crowd === 'number') out.push({ key: 'crowd', q: 'crowd', label: `~${a.crowd.toLocaleString('en-NG')} people` });
  if (Array.isArray(a.stage) && a.stage.length) out.push({ key: 'stage', q: 'stage', label: a.stage.map((s) => s === 'dj' ? 'DJ' : s[0].toUpperCase() + s.slice(1)).join(', ') });
  if (set(a.stream)) out.push({ key: 'stream', q: 'stream', label: STREAM[a.stream as string] + (a.platform && a.platform !== 'unsure' ? `: ${a.platform === 'youtube' ? 'YouTube' : a.platform[0].toUpperCase() + a.platform.slice(1)}` : '') });
  if (set(a.power)) out.push({ key: 'power', q: 'power', label: POWER[a.power as string] });
  if (typeof a.startsAt === 'string' && a.startsAt !== 'unsure') out.push({ key: 'startsAt', q: 'when', label: DAY.format(new Date(a.startsAt)) });
  if (set(a.area)) out.push({ key: 'area', q: 'area', label: a.area as string });
  return out;
}

/** Required before sizing (user-flows F2 step 4); the rest gets safe defaults with a "We assumed…" note. */
export const REQUIRED: { key: keyof Answers; q: string; label: string }[] = [
  { key: 'eventType', q: 'type', label: 'What kind of event' },
  { key: 'venue', q: 'venue', label: 'Indoors or outdoors' },
  { key: 'crowd', q: 'crowd', label: 'How many people' },
  { key: 'startsAt', q: 'when', label: 'When it is' },
  { key: 'area', q: 'area', label: 'Where in Lagos' },
];

export function missingRequired(a: Partial<Answers>) {
  return REQUIRED.filter((r) => a[r.key] === undefined);
}
