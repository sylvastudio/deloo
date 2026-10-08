import { useColorScheme } from 'react-native';

import { palette, type Palette } from './tokens';

/** The palette for the phone's current light/dark setting. */
export function useColors(): Palette {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}

export function useIsDark() {
  return useColorScheme() === 'dark';
}
