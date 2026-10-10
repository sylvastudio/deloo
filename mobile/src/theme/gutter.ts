import { useWindowDimensions } from 'react-native';

import { space } from './tokens';

/** Page gutter (spec §1 rule 8): 16 on phones narrower than 400dp (most are 360), 24 from 400 up. */
export function gutterFor(width: number): number {
  return width < 400 ? space.lg : space.xl;
}

/** The page gutter for the current window width. Re-renders on rotation or a resized web window. */
export function useGutter(): number {
  return gutterFor(useWindowDimensions().width);
}
