import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { fonts, radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Text } from './text';

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      disabled={!onPress}
      onPress={() => { Haptics.selectionAsync(); onPress?.(); }}
      hitSlop={6}
      style={[styles.chip, { backgroundColor: selected ? c.ink : c.surface, borderColor: selected ? c.ink : c.line }]}>
      <Text variant="label" style={{ color: selected ? c.paper : c.ink }}>{label}</Text>
    </Pressable>
  );
}

type Status = 'available' | 'limited' | 'unavailable' | 'neutral';

/** Small status pill: availability, verification, booking state. */
export function Badge({ label, status = 'neutral' }: { label: string; status?: Status }) {
  const c = useColors();
  const map = {
    available: [c.greenTint, c.green], limited: [c.marigoldTint, c.ink], unavailable: [c.redTint, c.red], neutral: [c.raised, c.slate],
  } as const;
  const [bg, fg] = map[status];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="caption" style={{ color: fg, fontFamily: fonts.bodyMedium }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: space.lg, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
});
