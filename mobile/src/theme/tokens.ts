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
    red: '#C23A2E',          // "not available", errors (4.9:1 on paper)
    redTint: '#FBEAE7',
    onRed: '#FFFFFF',        // danger button label (5.3:1)
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
    onRed: '#12161C',        // white on this red is 3.1:1; ink is 5.9:1
    green: '#4CC08A',
    greenTint: '#11261C',
    greenInk: '#7FD9AE',
  },
} as const;

export type Palette = { [K in keyof typeof palette.light]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/**
 * Font family names registered in the root layout (useFonts keys). One family, Inter, in light
 * and regular weights: the calm, airy feel of the ChatGPT and Claude apps (Söhne / Styrene are
 * licensed; Inter is the closest open face). Keys keep their old names so screens don't change.
 */
export const fonts = {
  light: 'Inter_300Light',
  display: 'Inter_400Regular',
  displayBold: 'Inter_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
} as const;

/**
 * Type scale. Large type is light with slight negative tracking; reading text is 16/24 (1.5),
 * as in ChatGPT and Claude. Line heights are explicit so Android and iOS render the same.
 */
export const type = {
  hero: { fontFamily: fonts.light, fontSize: 34, lineHeight: 40, letterSpacing: -0.9 },
  title: { fontFamily: fonts.light, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.bodyMedium, fontSize: 18, lineHeight: 24, letterSpacing: -0.25 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, letterSpacing: -0.05 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  number: { fontFamily: fonts.light, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
} as const;

export type TypeVariant = keyof typeof type;

/** Minimum touch target (Material: 48dp). */
export const touch = 48;

/**
 * Control heights, after ChatGPT / Claude: 44 for buttons and fields (hit area padded to 48 by
 * hitSlop where needed), 36 for chips, 52 for the composer's resting height.
 */
export const control = { button: 48, field: 48, chip: 36, composer: 52, row: 56 } as const;

/**
 * Largest system font scale each variant follows. Display sizes stop at 1.6x so a 40pt total
 * doesn't become 64pt+ and break the layout; reading sizes go to 2x (WCAG 1.4.4, 200%).
 */
export const maxScale: Record<TypeVariant, number> = {
  hero: 1.6, number: 1.6, title: 1.6, heading: 1.8,
  body: 2, bodyStrong: 2, label: 2, caption: 2,
};
