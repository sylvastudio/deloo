import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { space, type } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';

const WORDS = ['Cameras', 'Lenses', 'Lights', 'Mics', 'Gimbals'];

export default function Welcome() {
  const c = useColors();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % WORDS.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.lagoon }]} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Text style={[type.heading, { color: c.onLagoon }]}>deloo<Text style={[type.heading, { color: c.marigold }]}>.</Text></Text>
      </View>
      <View style={styles.middle}>
        <View style={styles.wordBox} accessible accessibilityLabel={`${WORDS.join(', ')} for your event`}>
          <Animated.Text
            key={WORDS[i]}
            entering={FadeInDown.duration(380).reduceMotion(ReduceMotion.System)}
            exiting={FadeOutUp.duration(260).reduceMotion(ReduceMotion.System)}
            style={[type.hero, styles.word, { color: c.marigold }]}>
            {WORDS[i]}
          </Animated.Text>
        </View>
        <Text style={[type.hero, { color: c.onLagoon }]}>for your shoot,{'\n'}sorted.</Text>
        <Text style={[type.body, { color: c.onLagoon, opacity: 0.85, marginTop: space.lg }]}>
          Tell us about your shoot. We’ll recommend the right kit from Deloo’s own gear and check it’s free on your dates.
        </Text>
      </View>
      <View style={styles.bottom}>
        <Button title="Get started" kind="accent" onPress={() => router.push('/sign-in')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { paddingHorizontal: space.xl, paddingTop: space.lg },
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl },
  wordBox: { height: 48, overflow: 'hidden' },
  word: { position: 'absolute' },
  bottom: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md },
});
