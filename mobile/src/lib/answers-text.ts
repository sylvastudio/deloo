import type { ResolvedAnswers } from '@/planner';
import type { Answers } from '@/planner/types';

export const SHOOT_LABEL: Record<string, string> = {
  podcast: 'Podcast', interview: 'Interview', content: 'YouTube or social content', music_video: 'Music video',
  short_film: 'Short film or skit', photo: 'Photo shoot', event: 'Event coverage', other: 'Shoot',
};
const LOCATION: Record<string, string> = { indoor: 'Indoors', outdoor: 'Outdoors', both: 'Indoors and out' };
const TIME: Record<string, string> = { day: 'Daytime', night: 'At night', both: 'Day and night' };
const SOUND: Record<string, string> = { desk: 'Desk mics', clip: 'Clip-on mics', none: 'No mics' };
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

const set = (v: unknown) => v !== undefined && v !== 'unsure';

/** "Sat 14 Nov" or "Sat 14 – Mon 16 Nov" for a rental window. */
export function daysLabel(startsAt: string, endsAt?: string): string {
  const from = DAY.format(new Date(startsAt));
  if (!endsAt) return from;
  // The window ends at the start of the day after the last rental day.
  const last = new Date(Date.parse(endsAt) - 1);
  const to = DAY.format(last);
  return to === from ? from : `${from} – ${to}`;
}

/**
 * One short chip label per answered question, in question order, for R4 and the top of R6. Answers
 * the server reader filled in (`ai`, Draft.aiKeys) say "check", since nobody confirmed them yet.
 */
export function answerChips(a: Partial<Answers>, ai: string[] = []): { key: string; label: string; q: string; ai?: boolean }[] {
  const out: { key: string; label: string; q: string; ai?: boolean }[] = [];
  if (set(a.shootType)) out.push({ key: 'shootType', q: 'type', label: SHOOT_LABEL[a.shootType as string] });
  if (typeof a.people === 'number') out.push({ key: 'people', q: 'people', label: a.people === 1 ? '1 person' : `${a.people} people` });
  if (typeof a.angles === 'number') out.push({ key: 'angles', q: 'angles', label: a.angles === 1 ? '1 camera' : `${a.angles} cameras` });
  if (set(a.location)) out.push({ key: 'location', q: 'where', label: LOCATION[a.location as string] });
  if (set(a.timeOfDay)) out.push({ key: 'timeOfDay', q: 'where', label: TIME[a.timeOfDay as string] });
  if (set(a.sound)) out.push({ key: 'sound', q: 'sound', label: SOUND[a.sound as string] });
  if (typeof a.movement === 'boolean') out.push({ key: 'movement', q: 'movement', label: a.movement ? 'Moving shots' : 'Static shots' });
  if (typeof a.startsAt === 'string' && a.startsAt !== 'unsure') {
    out.push({ key: 'startsAt', q: 'when', label: daysLabel(a.startsAt, typeof a.endsAt === 'string' && a.endsAt !== 'unsure' ? a.endsAt : undefined) });
  }
  if (set(a.area)) out.push({ key: 'area', q: 'area', label: a.delivery === 'delivery' ? `Delivery to ${a.area}` : (a.area as string) });
  return out.map((c) => (ai.includes(c.key) ? { ...c, label: `${c.label} · check`, ai: true } : c));
}

/** Chips for what the plan assumed (not asked), so each default is one tap from being changed. */
export function assumedChips(a: Partial<Answers>, r: Pick<ResolvedAnswers, 'people' | 'angles' | 'sound' | 'movement'>): { key: string; label: string; q: string }[] {
  const out: { key: string; label: string; q: string }[] = [];
  if (typeof a.people !== 'number') out.push({ key: 'people', q: 'people', label: `${r.people === 1 ? '1 person' : `${r.people} people`} · assumed` });
  if (typeof a.angles !== 'number') out.push({ key: 'angles', q: 'angles', label: `${r.angles === 1 ? '1 camera' : `${r.angles} cameras`} · assumed` });
  if (!set(a.sound)) out.push({ key: 'sound', q: 'sound', label: `${SOUND[r.sound]} · assumed` });
  if (typeof a.movement !== 'boolean') out.push({ key: 'movement', q: 'movement', label: `${r.movement ? 'Moving shots' : 'Static shots'} · assumed` });
  return out;
}

/** Required before sizing (user-flows F2 step 4); the rest gets safe defaults with a "We assumed…" note. */
export const REQUIRED: { key: keyof Answers; q: string; label: string }[] = [
  { key: 'shootType', q: 'type', label: 'What you’re shooting' },
  { key: 'location', q: 'where', label: 'Indoors or outdoors' },
  { key: 'startsAt', q: 'when', label: 'Which days you need it' },
];

export function missingRequired(a: Partial<Answers>) {
  return REQUIRED.filter((r) => a[r.key] === undefined);
}
