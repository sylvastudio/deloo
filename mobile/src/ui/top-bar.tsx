import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, space, touch } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon } from './icon';
import { Text } from './text';

/**
 * Screen header for pushed screens: back, optional title, optional step progress, optional right action.
 * `steps` draws a segmented progress bar (question flow).
 */
export function TopBar({
  title, onBack, steps, right,
}: { title?: string; onBack?: () => void; steps?: { current: number; total: number }; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        android_ripple={{ color: c.lagoonTint, borderless: true, radius: 24 }}
        style={styles.back}>
        <Icon name="back" />
      </Pressable>
      <View style={styles.middle}>
        {steps ? (
          <View style={styles.segments} accessible accessibilityLabel={`Question ${steps.current} of ${steps.total}`}>
            {Array.from({ length: steps.total }, (_, i) => (
              <View key={i} style={[styles.segment, { backgroundColor: i < steps.current ? c.lagoon : c.line }]} />
            ))}
          </View>
        ) : title ? <Text variant="bodyStrong" numberOfLines={1} accessibilityRole="header">{title}</Text> : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, minHeight: 56 },
  back: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  middle: { flex: 1, paddingHorizontal: space.xs },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  right: { minWidth: touch, alignItems: 'flex-end', paddingRight: space.sm },
});
