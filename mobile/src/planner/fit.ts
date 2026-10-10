// Budget fit: bring a setup's rental under a naira ceiling with as few, as plain changes as we can.
//
// Deterministic and greedy, and it only ever chooses among what matching already offered (the plan's
// lines and their alternatives). It never prices anything itself: Review re-quotes on the server.
// Pure TypeScript only: no React Native, Expo or Supabase imports.

import { fmt, LEVELS } from './rules';
import type { Alternative, CategoryKey, Level, LineMatch, Offer, SetupMatch } from './types';

/** What the renter changed on a setup: the level, swaps (line key → alternative's item id) and removals. */
export interface Choices {
  level: Level;
  swaps: Record<string, string>;
  removed: string[];
}

export interface FitResult extends Choices {
  budgetKobo: number;
  /** Rental after the changes (what the budget is compared with). */
  rentalKobo: number;
  fits: boolean;
  /** Plain sentences, in the order applied, e.g. "Removed the DJI RS 5 gimbal (saves ₦45k)". */
  changes: string[];
}

/** The alternative a saved swap points at: by its item id (survives date changes), or an old saved index. */
export function swapTarget(alternatives: Alternative[], saved: string | undefined): Alternative | undefined {
  if (saved === undefined) return undefined;
  if (/^\d+$/.test(saved)) return alternatives[Number(saved)];
  return alternatives.find((a) => a.offers[0]?.itemId === saved);
}
/** What a swap is saved as: the alternative's first item. */
export const swapId = (alt: Alternative) => alt.offers[0]?.itemId ?? '';

/** The offers a line ends up with after the renter's choices. */
export function chosenFor(l: LineMatch, c: Pick<Choices, 'swaps' | 'removed'>): Offer[] {
  if (c.removed.includes(l.line.key)) return [];
  return swapTarget(l.alternatives, c.swaps[l.line.key])?.offers ?? l.offers;
}

const rentalOfOffers = (offers: Offer[]) => offers.reduce((s, o) => s + o.rentalKobo, 0);
export const rentalOf = (m: SetupMatch, c: Pick<Choices, 'swaps' | 'removed'>) => m.lines.reduce((s, l) => s + rentalOfOffers(chosenFor(l, c)), 0);

/** Which extras go first when money is short: the ones the shoot misses least. */
const DROP_RANK: Record<CategoryKey, number> = { headphones: 0, backdrop: 1, grip: 2, light: 3, gimbal: 4, mixer: 5, mic: 6, lens: 7, camera: 8 };

const money = (kobo: number) => {
  const n = Math.round(kobo / 100);
  return n >= 1000 ? `₦${fmt(n / 1000)}k` : `₦${fmt(n)}`;
};
const what = (offers: Offer[], l: LineMatch) => {
  if (offers.length === 1) return `${offers[0].units > 1 ? `${offers[0].units} × ` : 'the '}${offers[0].name}`;
  return `the ${l.line.category === 'light' ? 'lights' : l.line.category}`;
};
const cap = (l: Level) => l[0].toUpperCase() + l.slice(1);

/** One level: drop extras (least missed first), then take the cheapest complete alternatives. */
function fitLevel(m: SetupMatch, start: Choices, budget: number): FitResult {
  const c: Choices = { level: start.level, swaps: { ...start.swaps }, removed: [...start.removed] };
  const steps: { kind: 'drop' | 'swap'; key: string; text: string }[] = [];
  let rental = rentalOf(m, c);

  // 1. Non-essential lines, least missed first; the pricier of equals first (fewer changes).
  const extras = m.lines
    .filter((l) => !l.line.essential && chosenFor(l, c).length)
    .sort((a, b) => DROP_RANK[a.line.category] - DROP_RANK[b.line.category] || rentalOfOffers(chosenFor(b, c)) - rentalOfOffers(chosenFor(a, c)));
  for (const l of extras) {
    if (rental <= budget) break;
    const offers = chosenFor(l, c);
    const save = rentalOfOffers(offers);
    if (save <= 0) continue;
    c.removed.push(l.line.key);
    delete c.swaps[l.line.key];
    rental -= save;
    steps.push({ kind: 'drop', key: l.line.key, text: `Removed ${what(offers, l)} (saves ${money(save)})` });
  }

  // 2. The cheapest complete alternative on each line still in, biggest saving first.
  if (rental > budget) {
    const options = m.lines
      .filter((l) => !c.removed.includes(l.line.key))
      .map((l) => {
        const now = chosenFor(l, c);
        const cur = rentalOfOffers(now);
        const best = l.alternatives
          .filter((a) => a.kind !== 'nearby_date' && a.complete && a.offers.length && swapTarget(l.alternatives, swapId(a)) === a)
          .sort((x, y) => rentalOfOffers(x.offers) - rentalOfOffers(y.offers))[0];
        return { l, now, best, save: best ? cur - rentalOfOffers(best.offers) : 0 };
      })
      .filter((x) => x.best && x.save > 0)
      .sort((x, y) => y.save - x.save);
    for (const x of options) {
      if (rental <= budget) break;
      c.swaps[x.l.line.key] = swapId(x.best!);
      rental -= x.save;
      steps.push({ kind: 'swap', key: x.l.line.key, text: `Swapped ${what(x.now, x.l)} for ${what(x.best!.offers, x.l)} (saves ${money(x.save)})` });
    }
  }

  // 3. Put back any extra the swaps made unnecessary, most missed first.
  if (rental <= budget) {
    for (const s of [...steps].reverse()) {
      if (s.kind !== 'drop') continue;
      const l = m.lines.find((x) => x.line.key === s.key)!;
      const back = rentalOfOffers(l.offers);
      if (rental + back > budget) continue;
      c.removed = c.removed.filter((k) => k !== s.key);
      rental += back;
      steps.splice(steps.indexOf(s), 1);
    }
  }

  return { ...c, budgetKobo: budget, rentalKobo: rental, fits: rental <= budget, changes: steps.map((s) => s.text) };
}

/**
 * Greedy budget fit: on the current level, drop extras then take cheaper complete alternatives; if
 * that isn't enough, step down a level and start again from that level's plan. When nothing fits,
 * returns the leanest attempt with `fits: false` so the app can say how far over it still is.
 */
export function fitBudget(matches: Partial<Record<Level, SetupMatch>>, start: Choices, budgetKobo: number): FitResult {
  const levels = LEVELS.slice(0, LEVELS.indexOf(start.level) + 1).reverse();
  let last: FitResult | undefined;
  for (const level of levels) {
    const m = matches[level];
    if (!m) continue;
    const from: Choices = level === start.level ? start : { level, swaps: {}, removed: [] };
    const r = fitLevel(m, from, budgetKobo);
    if (level !== start.level) {
      const was = rentalOf(matches[start.level] ?? m, start);
      const plan = rentalOf(m, from);
      r.changes.unshift(`Stepped down to ${cap(level)}${was > plan ? ` (saves ${money(was - plan)})` : ''}`);
    }
    last = r;
    if (r.fits) return r;
  }
  return last ?? { ...start, budgetKobo, rentalKobo: matches[start.level] ? rentalOf(matches[start.level]!, start) : 0, fits: false, changes: [] };
}
