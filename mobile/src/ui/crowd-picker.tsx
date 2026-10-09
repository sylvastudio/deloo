import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon } from './icon';
import { Text } from './text';

/** Stops on a roughly logarithmic scale: fine control for small events, big jumps for crusades. */
const STOPS = [20, 50, 80, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
const BAND = (n: number) => n < 100 ? 'A small gathering' : n < 300 ? 'A full hall' : n < 1000 ? 'A big auditorium' : n < 3000 ? 'A crusade-sized crowd' : 'A stadium-sized crowd';
const KNOB = 32;

function nearestIndex(n: number) {
  let best = 0;
  STOPS.forEach((s, i) => { if (Math.abs(s - n) < Math.abs(STOPS[best] - n)) best = i; });
  return best;
}

/** R3c: drag along the track (or tap − / +). The crowd of figures fills up as the number grows. */
export function CrowdPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(nearestIndex(value));
  const x = useSharedValue(0);
  const max = Math.max(1, width - KNOB);

  useEffect(() => { x.value = withTiming((index / (STOPS.length - 1)) * max, { duration: 120 }); }, [index, max, x]);

  function setFromIndex(i: number) {
    const clamped = Math.min(STOPS.length - 1, Math.max(0, i));
    if (clamped !== index) { Haptics.selectionAsync(); setIndex(clamped); onChange(STOPS[clamped]); }
  }

  const pan = Gesture.Pan().minDistance(0)
    .onBegin((e) => { runOnJS(setFromIndex)(Math.round(((e.x - KNOB / 2) / max) * (STOPS.length - 1))); })
    .onChange((e) => { runOnJS(setFromIndex)(Math.round(((e.x - KNOB / 2) / max) * (STOPS.length - 1))); });

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fill = useAnimatedStyle(() => ({ width: x.value + KNOB / 2 }));
  const n = STOPS[index];
  const figures = Math.max(1, Math.round(((index + 1) / STOPS.length) * 24));

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.readout} accessibilityLiveRegion="polite">
        <Text variant="hero">{n >= 10000 ? '10,000+' : n.toLocaleString('en-NG')}</Text>
        <Text tone="slate">{BAND(n)}</Text>
      </View>
      <View style={styles.crowd} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Array.from({ length: 24 }, (_, i) => (
          <Icon key={i} name="people" size={18} color={i < figures ? c.lagoon : c.line} />
        ))}
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fewer people" onPress={() => setFromIndex(index - 1)} style={[styles.step, { borderColor: c.line }]} hitSlop={6}><Icon name="minus" /></Pressable>
        <GestureDetector gesture={pan}>
          <View
            style={styles.trackWrap} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
            accessible accessibilityRole="adjustable" accessibilityLabel="Number of people" accessibilityValue={{ text: `${n} people` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => setFromIndex(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}>
            <View style={[styles.track, { backgroundColor: c.raised }]}>
              <Animated.View style={[styles.fill, { backgroundColor: c.lagoon }, fill]} />
            </View>
            <Animated.View style={[styles.knob, { backgroundColor: c.surface, borderColor: c.lagoon }, knob]} />
          </View>
        </GestureDetector>
        <Pressable accessibilityRole="button" accessibilityLabel="More people" onPress={() => setFromIndex(index + 1)} style={[styles.step, { borderColor: c.line }]} hitSlop={6}><Icon name="plus" /></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { alignItems: 'center', gap: 2, paddingTop: space.sm },
  crowd: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, paddingHorizontal: space.lg },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  step: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  trackWrap: { flex: 1, height: 48, justifyContent: 'center' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill },
  knob: { position: 'absolute', left: 0, width: KNOB, height: KNOB, borderRadius: KNOB / 2, borderWidth: 3 },
});
