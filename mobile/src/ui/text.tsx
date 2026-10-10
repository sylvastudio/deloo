import { Platform, Text as RNText, type TextProps } from 'react-native';

import { maxScale, type, type TypeVariant } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';

type Tone = 'ink' | 'slate' | 'faint' | 'lagoon' | 'red' | 'green' | 'greenInk' | 'onLagoon';

/**
 * Text in the type scale. Follows the system font size up to `maxScale` for the variant.
 * `fit` keeps a single line (money, counts) and shrinks it to fit instead of wrapping or clipping
 * (native only: web can't shrink to fit, and a one-line clip there could cut digits off, so it wraps).
 */
export function Text({
  variant = 'body', tone = 'ink', fit, style, ...rest
}: TextProps & { variant?: TypeVariant; tone?: Tone; fit?: boolean }) {
  const c = useColors();
  return (
    <RNText
      maxFontSizeMultiplier={maxScale[variant]}
      {...(fit && Platform.OS !== 'web' ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.5 } : null)}
      {...rest}
      style={[type[variant], { color: c[tone] }, style]}
    />
  );
}
