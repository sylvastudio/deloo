import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';

/** A friendly empty state with one next step. */
export function EmptyState({
  icon, title, body, action, onAction,
}: { icon: IconName; title: string; body?: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.lagoonTint }]}><Icon name={icon} size={28} color={c.lagoon} /></View>
      <Text variant="heading" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text tone="slate" style={{ textAlign: 'center' }}>{body}</Text> : null}
      {action && onAction ? <Button kind="secondary" title={action} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: space.sm }} /> : null}
    </View>
  );
}

/** Pulsing placeholder block while content loads. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const c = useColors();
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700, reduceMotion: ReduceMotion.System }), -1, true);
  }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ backgroundColor: c.raised, borderRadius: radius.md, height: 16 }, style, a]} />;
}

/** A coloured note: tip (lagoon), warning (marigold), problem (red). */
export function Notice({ tone = 'tip', icon, children }: { tone?: 'tip' | 'warning' | 'problem'; icon?: IconName; children: React.ReactNode }) {
  const c = useColors();
  const bg = { tip: c.lagoonTint, warning: c.marigoldTint, problem: c.redTint }[tone];
  const fg = { tip: c.lagoon, warning: c.ink, problem: c.red }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole={tone === 'problem' ? 'alert' : undefined}>
      <Icon name={icon ?? (tone === 'tip' ? 'info' : 'warning')} size={18} color={fg} />
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Text variant="caption" style={{ color: tone === 'problem' ? c.red : c.ink }}>{children}</Text> : children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  notice: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
});
