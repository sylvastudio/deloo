import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { answerChips } from '@/lib/answers-text';
import { usePlan } from '@/lib/plan';
import { loadCatalogue } from '@/lib/plan-result';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';

/**
 * R5 Sizing: an honest "thinking" moment (never under ~0.9 s, never a fake spinner). Each line says what is
 * actually happening, and it preloads the catalogue so R6 opens instantly.
 */
export default function Sizing() {
  const c = useColors();
  const { draft } = usePlan();
  const a = draft.answers;
  const chips = answerChips(a);
  const where = chips.find((ch) => ch.key === 'area')?.label;
  const when = chips.find((ch) => ch.key === 'startsAt')?.label;
  const steps = useMemo(() => [
    typeof a.angles === 'number' ? `Choosing ${a.angles === 1 ? 'a camera' : `${a.angles} cameras`} and lenses` : 'Choosing cameras and lenses',
    a.location === 'outdoor' && a.timeOfDay === 'day' ? 'Planning fill light for the sun' : 'Planning your lighting',
    a.sound === 'none' ? 'Skipping mics: no sound needed' : typeof a.people === 'number' ? `Mics for ${a.people === 1 ? '1 person' : `${a.people} people`}` : 'Choosing mics',
    when ? `Checking what’s free on ${when}${where ? ` for ${where}` : ''}` : 'Checking what’s available',
  ], [a.angles, a.location, a.timeOfDay, a.sound, a.people, when, where]);
  const [shown, setShown] = useState(1);

  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setShown((n) => Math.min(steps.length, n + 1)), 260);
    const starts = typeof a.startsAt === 'string' && a.startsAt !== 'unsure' ? a.startsAt : undefined;
    const ends = typeof a.endsAt === 'string' && a.endsAt !== 'unsure' ? a.endsAt : undefined;
    const done = () => setTimeout(() => router.replace('/plan/setup'), Math.max(0, 1000 - (Date.now() - started)));
    loadCatalogue(starts, ends).then(done, done); // R6 shows the error state itself
    return () => clearInterval(t);
  }, [a.startsAt, a.endsAt, steps.length]);

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.paper }]}>
      <View style={styles.body} accessibilityLiveRegion="polite">
        <ActivityIndicator color={c.lagoon} size="large" />
        <Text variant="title" style={{ textAlign: 'center' }}>Putting your setup together</Text>
        <View style={{ gap: space.md, alignSelf: 'stretch' }}>
          {steps.slice(0, shown).map((s, i) => (
            <Animated.View key={s} entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)} style={styles.step}>
              <Icon name={i < shown - 1 ? 'check' : 'sparkles'} size={18} color={c.lagoon} />
              <Text tone={i < shown - 1 ? 'slate' : 'ink'} style={{ flex: 1 }}>{s}…</Text>
            </Animated.View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.xl, paddingHorizontal: space.xxl },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
