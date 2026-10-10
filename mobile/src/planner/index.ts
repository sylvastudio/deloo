// Deloo planner: shoot answers → Good / Better / Best setups → real gear, availability and totals.
// Pure TypeScript (no React Native, Expo or Supabase), so it runs offline on the device and in Node.

export * from './types';
export {
  RULES_VERSION,
  LEVELS,
  sizeSetups,
  sizeSetup,
  resolveAnswers,
  defaultLevel,
  fmt,
} from './rules';
export type { ResolvedAnswers } from './rules';
export { matchSetup, rentalDays, meetsSpec } from './match';
