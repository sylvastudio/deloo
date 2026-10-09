import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon } from './icon';
import { Text } from './text';

const KNOB = 56;

/**
 * Slide to confirm for actions that move money or gear (docs/native-app-plan.md §4.4).
 * Needs a deliberate drag past 85%, so it can't fire from a pocket or a scroll. Screen readers get a
 * double-tap button instead of the drag.
 */
export function SlideToConfirm({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [done, setDone] = useState(false);
  const x = useSharedValue(0);
  const max = Math.max(0, width - KNOB - 8);

  function confirm() {
    setDone(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  }

  const pan = Gesture.Pan()
    .enabled(!disabled && !done)
    .activeOffsetX([-8, 8])
    .onChange((e) => { x.value = Math.min(max, Math.max(0, x.value + e.changeX)); })
    .onEnd(() => {
      if (x.value > max * 0.85) { x.value = withTiming(max, { duration: 120 }); runOnJS(confirm)(); }
      else x.value = withSpring(0, { damping: 18 });
    });

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fill = useAnimatedStyle(() => ({ width: x.value + KNOB + 4 }));
  const hint = useAnimatedStyle(() => ({ opacity: max ? 1 - x.value / max : 1 }));

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: disabled ? c.raised : c.lagoonTint, opacity: disabled ? 0.6 : 1 }]}>
      <Animated.View style={[styles.fill, { backgroundColor: c.lagoon }, fill]} />
      <Animated.View style={[styles.labelWrap, hint]} pointerEvents="none">
        <Text style={[type.bodyStrong, { color: c.lagoon }]}>{done ? 'Done' : label}</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.knob, { backgroundColor: c.lagoon }, knob]}>
          <Icon name={done ? 'check' : 'chevron'} color={c.onLagoon} />
        </Animated.View>
      </GestureDetector>
      {/* Screen-reader path: the whole control is a button that confirms on activation. */}
      <Pressable
        style={StyleSheet.absoluteFill} accessible accessibilityRole="button" accessibilityLabel={label}
        accessibilityHint="Double tap to confirm" disabled={disabled || done}
        onPress={() => { AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (on) confirm(); }); }}
        importantForAccessibility="yes" pointerEvents="box-none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: KNOB + 8, borderRadius: radius.pill, justifyContent: 'center', overflow: 'hidden', padding: 4 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill, opacity: 0.18 },
  labelWrap: { position: 'absolute', left: KNOB + space.lg, right: space.lg, alignItems: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
});
