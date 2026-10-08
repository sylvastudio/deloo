import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useSession } from '@/lib/session';
import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Card, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

const EXAMPLES = ['Outdoor crusade, 2,000 people, livestream', 'Wedding reception for 300 in a hall', 'Youth conference, 500, band and projector'];

/**
 * Plan home: the start card from docs/native-app-plan.md §4.2. The question flow and setups
 * arrive in N2; until then the card says so instead of pretending.
 */
export default function Plan() {
  const c = useColors();
  const { profile } = useSession();
  const [text, setText] = useState('');
  const first = profile?.full_name.split(' ')[0] ?? '';

  return (
    <Screen kicker={`Hi ${first}`} title="What’s the event?">
      <View style={[styles.start, { backgroundColor: c.lagoon }]}>
        <Text style={[type.heading, { color: c.onLagoon }]}>Tell us about it the way you’d tell a friend.</Text>
        <View style={[styles.inputRow, { backgroundColor: c.surface }]}>
          <TextInput
            value={text} onChangeText={setText} multiline placeholder="e.g. Outdoor crusade, about 2,000 people…"
            placeholderTextColor={c.faint} style={[type.body, styles.input, { color: c.ink }]}
            accessibilityLabel="Describe your event"
          />
          <Pressable
            accessibilityRole="button" accessibilityLabel="Describe it by voice"
            style={[styles.mic, { backgroundColor: c.marigold }]} android_ripple={{ color: '#00000022', borderless: true }}>
            <Text style={{ fontSize: 22 }}>🎙️</Text>
          </Pressable>
        </View>
        <View style={styles.examples}>
          {EXAMPLES.map((e) => (
            <Pressable key={e} onPress={() => setText(e)} style={[styles.example, { borderColor: '#ffffff55' }]} accessibilityRole="button">
              <Text variant="caption" style={{ color: c.onLagoon }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text variant="bodyStrong" tone="faint" style={styles.or}>Or answer a few quick questions (coming soon)</Text>

      <Card style={{ backgroundColor: c.marigoldTint, borderColor: c.marigoldTint }}>
        <Text variant="bodyStrong">The planner is being built</Text>
        <Text variant="caption" tone="slate">
          Soon this turns your description into a full setup (sound, screens, power) with what’s free on your date. Meanwhile, browse what’s available.
        </Text>
        <Pressable onPress={() => router.navigate('/explore')} hitSlop={8}><Text variant="label" tone="lagoon">Explore gear →</Text></Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  start: { borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: radius.lg, padding: space.sm, paddingLeft: space.lg, gap: space.sm },
  input: { flex: 1, minHeight: 72, maxHeight: 160, paddingTop: space.sm, textAlignVertical: 'top' },
  mic: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  examples: { gap: space.sm },
  example: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, alignSelf: 'flex-start' },
  or: { paddingVertical: space.sm },
});
