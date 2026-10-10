import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { answerChips, missingRequired } from '@/lib/answers-text';
import { readShoot } from '@/lib/intake';
import { QUESTION_KEYS, usePlan } from '@/lib/plan';
import { useSession } from '@/lib/session';
import { NextBookingCard, useNextBooking } from '@/screens/account';
import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { categoryIcon, Icon } from '@/ui/icon';
import { Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

const EXAMPLES = ['3-person podcast in Lekki on Saturday, two cameras', 'Music video at night outdoors, moving shots', 'Interview for a brand, indoors in Ikeja, 2 days'];
const BROWSE = [['camera', 'camera', 'Cameras'], ['lens', 'lens', 'Lenses'], ['light', 'light', 'Lighting'], ['audio', 'mic', 'Audio'], ['grip', 'gimbal', 'Grip']] as const;

/**
 * R1 Plan home: your next booking (if any) on top, then describe the shoot (type or voice), answer
 * questions, or pick up a saved plan.
 */
export default function Plan() {
  const c = useColors();
  const { profile } = useSession();
  const { draft, answer, update, reset, answered } = usePlan();
  const next = useNextBooking();
  const [text, setText] = useState('');
  const [voiceTip, setVoiceTip] = useState(false);
  const input = useRef<TextInput>(null);
  const first = profile?.full_name.split(' ')[0] ?? '';
  const chips = answerChips(draft.answers);

  function size() {
    const words = text.trim();
    if (!words) return;
    reset();
    update({ rawText: words });
    const read = readShoot(words);
    answer(read);
    router.push(missingRequired(read).length ? '/plan/details' : '/plan/setup');
    setText('');
  }

  return (
    <Screen kicker={first ? `Hi ${first}` : undefined} title="What are you shooting?">
      {next ? <NextBookingCard b={next} /> : null}

      <View style={[styles.start, { backgroundColor: c.brand }]}>
        <Text style={[type.heading, { color: c.onBrand }]}>Tell us about it the way you’d tell a friend.</Text>
        <View style={[styles.inputRow, { backgroundColor: c.surface }]}>
          <TextInput
            ref={input} value={text} onChangeText={setText} multiline placeholder="e.g. A podcast with 3 people, Saturday in Lekki"
            placeholderTextColor={c.faint} style={[type.body, styles.input, { color: c.ink }]} accessibilityLabel="Describe your shoot"
          />
{/* Voice is the phone keyboard's mic; there's no such thing in a desktop browser. */}
          {Platform.OS !== 'web' ? (
          <Pressable
            accessibilityRole="button" accessibilityLabel="Describe it by voice"
            onPress={() => { setVoiceTip(true); input.current?.focus(); }}
            style={[styles.mic, { backgroundColor: c.marigold }]} android_ripple={{ color: '#00000022', borderless: true }}>
            <Icon name="mic" size={24} color={c.onMarigold} />
          </Pressable>
          ) : null}
        </View>
        {voiceTip ? <Text variant="caption" style={{ color: c.onBrand }}>Tap the mic on your keyboard and talk. We’ll read what you say.</Text> : null}
        {text.trim() ? (
          <Button kind="accent" title="Suggest my kit" onPress={size} />
        ) : (
          <View style={styles.examples}>
            {EXAMPLES.map((e) => (
              <Pressable key={e} onPress={() => setText(e)} style={styles.example} accessibilityRole="button" accessibilityLabel={`Use example: ${e}`}>
                <Text variant="caption" style={{ color: c.onBrand }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Button kind="secondary" title="Or answer a few quick questions" onPress={() => { reset(); router.push('/plan/ask/type'); }} />

      {answered > 0 ? (
        <Pressable
          onPress={() => router.push(missingRequired(draft.answers).length ? '/plan/details' : '/plan/setup')}
          accessibilityRole="button" accessibilityLabel={`Continue your plan, ${answered} of ${QUESTION_KEYS.length} answered`}
          android_ripple={{ color: c.lagoonTint }} style={[styles.resume, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Icon name="edit" size={20} color={c.lagoon} />
          <View style={{ flex: 1 }}>
            <Text variant="label">Continue your plan</Text>
            <Text variant="caption" tone="slate" numberOfLines={1}>
              {chips.slice(0, 3).map((ch) => ch.label).join(' · ') || 'Your shoot'} · {answered} of {QUESTION_KEYS.length} answered
            </Text>
          </View>
          <Icon name="chevron" size={20} color={c.slate} />
        </Pressable>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Text variant="label" tone="slate">Browse gear</Text>
        <View style={styles.browse}>
          {BROWSE.map(([group, k, label]) => (
            <Pressable key={group} onPress={() => router.navigate(`/explore?group=${group}`)} accessibilityRole="button"
              style={[styles.browseItem, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Icon name={categoryIcon(k)} color={c.lagoon} />
              <Text variant="caption">{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  start: { borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: radius.lg, padding: space.sm, paddingLeft: space.lg, gap: space.sm },
  input: { flex: 1, minHeight: 72, maxHeight: 160, paddingTop: space.sm, textAlignVertical: 'top' },
  mic: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  examples: { gap: space.sm },
  example: { borderWidth: 1, borderColor: '#ffffff55', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, alignSelf: 'flex-start' },
  resume: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  browse: { flexDirection: 'row', gap: space.sm },
  browseItem: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
