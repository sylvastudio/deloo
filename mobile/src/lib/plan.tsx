import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import type { Answers, Level } from '@/planner/types';
import { useSession } from './session';

/** A plan in progress. Saved on the phone after every change (user-flows §2 rule 3). */
export type Draft = {
  answers: Partial<Answers>;
  rawText: string;
  level: Level;
  /** Line key → chosen alternative id, from the swap sheet. */
  swaps: Record<string, string>;
  /** Line keys the renter removed. */
  removed: string[];
  /** The saved `events` row, once R6 has saved it. Cleared when answers change. */
  eventId?: string;
  updatedAt: string;
};

const KEY = 'deloo.plan.shoot';
const EMPTY: Draft = { answers: {}, rawText: '', level: 'better', swaps: {}, removed: [], updatedAt: '' };

function read(): Draft {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

type PlanState = {
  draft: Draft;
  answer: (patch: Partial<Answers>) => void;
  update: (patch: Partial<Omit<Draft, 'answers'>>) => void;
  reset: () => void;
  /** How many of the questions have an answer (including "Not sure"). */
  answered: number;
};

const PlanContext = createContext<PlanState | null>(null);

export function usePlan() {
  const p = use(PlanContext);
  if (!p) throw new Error('usePlan must be used inside <PlanProvider>');
  return p;
}

const KEEP_CHOICES = new Set(['startsAt', 'endsAt', 'area', 'budget']);

/** What the question flow asks (app/plan/ask QUESTIONS); everything else has per-shoot defaults. */
export const QUESTION_KEYS = ['shootType', 'location', 'startsAt'] as const;

export function PlanProvider({ children }: PropsWithChildren) {
  const [draft, setDraft] = useState<Draft>(read);

  const save = useCallback((next: Draft) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(stamped)); } catch { /* storage full: keep it in memory */ }
    setDraft(stamped);
  }, []);

  const answer = useCallback((patch: Partial<Answers>) => setDraft((d) => {
    // Dates, area and budget don't change what the shoot needs, so the renter's swaps and removals stay
    // (a swap to gear that isn't free on the new dates simply stops applying). Anything else re-sizes it.
    const keep = Object.keys(patch).every((k) => KEEP_CHOICES.has(k));
    const next = { ...d, answers: { ...d.answers, ...patch }, swaps: keep ? d.swaps : {}, removed: keep ? d.removed : [], eventId: undefined };
    try { localStorage.setItem(KEY, JSON.stringify({ ...next, updatedAt: new Date().toISOString() })); } catch { /* ignore */ }
    return { ...next, updatedAt: new Date().toISOString() };
  }), []);

  const update = useCallback((patch: Partial<Omit<Draft, 'answers'>>) => setDraft((d) => {
    const next = { ...d, ...patch, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }), []);

  const reset = useCallback(() => save(EMPTY), [save]);
  // Signed out: the next person on this phone starts with an empty plan.
  const { session } = useSession();
  const hadSession = useRef(!!session);
  useEffect(() => {
    if (hadSession.current && !session) setDraft(EMPTY);
    hadSession.current = !!session;
  }, [session]);
  const answered = useMemo(() => QUESTION_KEYS.filter((k) => draft.answers[k] !== undefined).length, [draft.answers]);

  return <PlanContext value={{ draft, answer, update, reset, answered }}>{children}</PlanContext>;
}
