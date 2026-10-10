import { Redirect } from 'expo-router';
import { useState } from 'react';

import { missingRequired } from '@/lib/answers-text';
import { usePlan } from '@/lib/plan';

/**
 * R4 Missing details: no hub. Straight into the first required question we couldn't read (each one
 * shows what we did understand as chips and chains to the next), then the setup. Everything optional
 * gets a safe default on R6 with a "We assumed…" note.
 */
export default function Details() {
  const { draft } = usePlan();
  const [href] = useState(() => {
    const missing = missingRequired(draft.answers);
    return missing.length ? (`/plan/ask/${missing[0].q}?chain=1` as const) : ('/plan/setup' as const);
  });
  return <Redirect href={href} />;
}
