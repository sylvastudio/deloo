import { StyleSheet, View } from 'react-native';

import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon } from './icon';
import { Text } from './text';

export type Checkpoint = { label: string; detail?: string; time?: string; state: 'done' | 'current' | 'next' };

/** Booking lifecycle as a vertical checkpoint list (Chowdeck-style tracker, R20/V2). */
export function CheckpointTracker({ steps }: { steps: Checkpoint[] }) {
  const c = useColors();
  return (
    <View accessibilityRole="list">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const dot = s.state === 'done' ? c.lagoon : s.state === 'current' ? c.marigold : c.line;
        return (
          <View key={s.label} style={styles.row} accessibilityRole="text"
            accessibilityLabel={`${s.label}${s.time ? `, ${s.time}` : ''}, ${s.state === 'done' ? 'done' : s.state === 'current' ? 'happening now' : 'next'}`}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: dot, borderColor: s.state === 'current' ? c.marigold : dot }]}>
                {s.state === 'done' ? <Icon name="check" size={12} color={c.onLagoon} /> : null}
              </View>
              {!last ? <View style={[styles.line, { backgroundColor: s.state === 'done' ? c.lagoon : c.line }]} /> : null}
            </View>
            <View style={[styles.body, !last && { paddingBottom: space.lg }]}>
              <View style={styles.head}>
                <Text variant={s.state === 'current' ? 'bodyStrong' : 'body'} tone={s.state === 'next' ? 'slate' : 'ink'} style={{ flex: 1 }}>{s.label}</Text>
                {s.time ? <Text variant="caption" tone="slate">{s.time}</Text> : null}
              </View>
              {s.detail ? <Text variant="caption" tone="slate">{s.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  rail: { alignItems: 'center', width: 22 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, marginVertical: 2 },
  body: { flex: 1, gap: 2 },
  head: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
});
