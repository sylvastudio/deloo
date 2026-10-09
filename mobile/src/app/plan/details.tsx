import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { answerChips, missingRequired } from '@/lib/answers-text';
import { usePlan } from '@/lib/plan';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Notice } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

/**
 * R4 Missing details: what we understood (tap a chip to change it) and only the required answers
 * still missing. Everything optional gets a safe default on R6 with a "We assumed…" note.
 */
export default function Details() {
  const c = useColors();
  const { draft } = usePlan();
  const chips = answerChips(draft.answers);
  const missing = missingRequired(draft.answers);
  const understoodNothing = chips.length === 0;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">{understoodNothing ? 'Let’s fill in the details' : 'Here’s what we understood'}</Text>
        {draft.rawText ? <Text tone="slate" style={{ fontStyle: 'italic' }}>“{draft.rawText}”</Text> : null}

        {chips.length ? (
          <View style={styles.wrap}>
            {chips.map((ch) => (
              <Pressable key={ch.key} accessibilityRole="button" accessibilityLabel={`${ch.label}. Change`}
                onPress={() => router.push(`/plan/ask/${ch.q}?edit=1`)}
                style={[styles.understood, { backgroundColor: c.lagoonTint, borderColor: c.lagoon }]}>
                <Text variant="label" style={{ color: c.ink }}>{ch.label}</Text>
                <Icon name="edit" size={14} color={c.lagoon} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {missing.length ? <>
          <Text variant="heading" style={{ marginTop: space.md }}>{missing.length === 1 ? 'One more thing' : `${missing.length} quick questions`}</Text>
          {missing.map((m) => (
            <Pressable key={m.key} accessibilityRole="button" onPress={() => router.push(`/plan/ask/${m.q}?edit=1`)}
              android_ripple={{ color: c.lagoonTint }}
              style={[styles.missing, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>{m.label}</Text>
              <Icon name="chevron" color={c.slate} />
            </Pressable>
          ))}
        </> : (
          <Notice tone="tip" icon="sparkles">That’s everything we need. Anything else, we’ll assume and tell you on the next screen.</Notice>
        )}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line }]}>
        <Button title="Size my setup" disabled={missing.length > 0} onPress={() => router.push('/plan/sizing')} />
        {missing.length ? <Text variant="caption" tone="slate" style={{ textAlign: 'center' }}>Answer {missing.length === 1 ? 'the question' : 'the questions'} above first.</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  understood: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, minHeight: 40, borderRadius: radius.pill, borderWidth: 1 },
  missing: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, minHeight: 60, overflow: 'hidden' },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
