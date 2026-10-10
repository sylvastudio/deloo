import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { naira } from '@/lib/format';
import { space } from '@/theme/tokens';
import { Text } from './text';

/**
 * The one money look for Review, Pay and Booking (spec §1 rule 3): a big total in Bricolage,
 * naira in full, never compact. Pass `kobo` (stored money) or a ready `value` string.
 * The figure stays on one line and shrinks to fit at large font sizes instead of wrapping.
 */
export function MoneyHero({
  kobo, value, label, caption, size = 'hero', style,
}: {
  kobo?: number; value?: string; label?: string; caption?: string; size?: 'hero' | 'number'; style?: StyleProp<ViewStyle>;
}) {
  const amount = value ?? (kobo === undefined ? '' : naira(kobo));
  return (
    <View style={[styles.hero, style]} accessible accessibilityLabel={[label, amount, caption].filter(Boolean).join(', ')}>
      {label ? <Text variant="caption" tone="slate">{label}</Text> : null}
      <Text variant={size} fit style={styles.figure}>{amount}</Text>
      {caption ? <Text tone="slate">{caption}</Text> : null}
    </View>
  );
}

/**
 * A label-and-amount line in a price breakdown. `total` makes it the bold closing line;
 * `hint` explains the line underneath (what Protection covers, refunds).
 */
export function PriceRow({
  label, kobo, value, hint, total, tone = 'ink',
}: {
  label: string; kobo?: number; value?: string; hint?: string; total?: boolean; tone?: 'ink' | 'greenInk' | 'slate';
}) {
  const amount = value ?? (kobo === undefined ? '' : naira(kobo));
  return (
    <View style={styles.rowWrap}>
      <View style={styles.row} accessible accessibilityLabel={`${label}, ${amount}`}>
        <Text variant={total ? 'bodyStrong' : 'body'} style={styles.label}>{label}</Text>
        <Text variant={total ? 'heading' : 'bodyStrong'} tone={tone} style={styles.amount}>{amount}</Text>
      </View>
      {hint ? <Text variant="caption" tone="slate">{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 2 },
  figure: { fontVariant: ['tabular-nums'] },
  rowWrap: { gap: 2 },
  // Wraps at large font sizes: the amount drops under the label instead of squeezing it.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.md },
  label: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  amount: { marginLeft: 'auto', textAlign: 'right', fontVariant: ['tabular-nums'] },
});
