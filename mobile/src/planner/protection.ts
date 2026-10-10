// Deloo Protection (damage cover) by gear, as a share of each item's rental. Mirrors
// private.item_protection_rate in supabase/migrations/0019 (the server's quote is what's charged;
// this only lets the planner show the same total before Review).
import type { CategoryKey } from './types';

export function protectionRateFor(category: CategoryKey | string): number {
  if (category === 'camera') return 0.2;
  if (category === 'lens' || category === 'light' || category === 'gimbal') return 0.15;
  return 0.1;
}
