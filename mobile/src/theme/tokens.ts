/**
 * Deloo design tokens for the native app. Colours come from the web's design.html palette
 * (lagoon, marigold, ink on paper) with a real dark theme; sizes are tuned for phones.
 */

export const palette = {
  light: {
    paper: '#F3F5F4',        // app background
    surface: '#FFFFFF',      // cards, sheets
    raised: '#EBEFEE',       // pressed tiles, inputs
    ink: '#12161C',          // main text
    slate: '#4A5560',        // secondary text
    faint: '#7B8791',        // hints, placeholders
    line: '#D3DADB',
    lagoon: '#0F6B73',       // primary
    lagoonStrong: '#0B5359',
    lagoonTint: '#E0EFEF',
    onLagoon: '#FFFFFF',
    brand: '#0F6B73',        // deep lagoon panels (welcome, plan card, NOW card): deep in both themes
    onBrand: '#FFFFFF',
    marigold: '#F2A900',     // highlight, "limited"
    marigoldTint: '#FDF1D3',
    onMarigold: '#12161C',
    red: '#C23A2E',          // "not available", errors
    redTint: '#FBEAE7',
    green: '#1F8A5B',        // "available", verified
    greenTint: '#E1F2E9',
    greenInk: '#15603F',     // text on greenTint (AA contrast)
  },
  dark: {
    paper: '#0E1215',
    surface: '#161B20',
    raised: '#1F262C',
    ink: '#E7ECEE',
    slate: '#9AA7B0',
    faint: '#6F7C85',
    line: '#2A333A',
    lagoon: '#3AAAB2',
    lagoonStrong: '#5CC3CA',
    lagoonTint: '#12292C',
    onLagoon: '#081214',
    brand: '#0F5A61',        // bright lagoon would put marigold at 1.6:1 on these panels
    onBrand: '#FFFFFF',
    marigold: '#F5B82E',
    marigoldTint: '#2D2410',
    onMarigold: '#12161C',
    red: '#EE6A5C',
    redTint: '#2E1714',
    green: '#4CC08A',
    greenTint: '#11261C',
    greenInk: '#7FD9AE',
  },
} as const;

export type Palette = { [K in keyof typeof palette.light]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Font family names registered in the root layout (useFonts keys). */
export const fonts = {
  display: 'BricolageGrotesque_600SemiBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'AtkinsonHyperlegibleNext_400Regular',
  bodyMedium: 'AtkinsonHyperlegibleNext_500Medium',
  bodyBold: 'AtkinsonHyperlegibleNext_700Bold',
} as const;

/** Type scale. Line heights are explicit so Android and iOS render the same. */
export const type = {
  hero: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  number: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
} as const;

export type TypeVariant = keyof typeof type;

/** Minimum touch target (Material: 48dp). */
export const touch = 48;
