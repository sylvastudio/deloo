import { Pressable, StyleSheet, View } from 'react-native';

import { radius, space, touch } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon } from './icon';
import { Text } from './text';

/** − 2 + with 48dp targets. */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const c = useColors();
  const btn = (delta: number, icon: 'minus' | 'plus', off: boolean) => (
    <Pressable onPress={() => onChange(value + delta)} disabled={off} accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? 'More' : 'Fewer'} ${label}`} android_ripple={{ color: c.lagoonTint, borderless: true }}
      style={[styles.stepBtn, { borderColor: c.line, opacity: off ? 0.35 : 1 }]}>
      <Icon name={icon} size={20} />
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessibilityLabel={`${value} ${label}`}>
      {btn(-1, 'minus', value <= min)}
      <Text variant="heading" style={{ minWidth: 28, textAlign: 'center' }}>{value}</Text>
      {btn(1, 'plus', value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepBtn: { width: touch, height: touch, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
