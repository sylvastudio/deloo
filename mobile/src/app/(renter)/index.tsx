import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { answerChips, missingRequired } from '@/lib/answers-text';
import { readShoot } from '@/lib/intake';
import { QUESTION_KEYS, usePlan } from '@/lib/plan';
import { useSession } from '@/lib/session';
import { NextBookingCard, useNextBooking } from '@/screens/account';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Chip } from '@/ui/chip';
import { Composer } from '@/ui/composer';
import { Icon } from '@/ui/icon';
import { Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextAction } from '@/ui/text-action';

// Every example has days, so tapping one goes straight to a priced, checked setup.
const EXAMPLES = ['3-person podcast in Lekki this Saturday, two cameras', 'Music video Fri to Sun in VI, under 100k', 'Wedding next sat, need delivery to Ajah'];
const BROWSE = [['camera', 'Cameras'], ['lens', 'Lenses'], ['light', 'Lighting'], ['audio', 'Audio'], ['grip', 'Grip']] as const;

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

      <View style={{ gap: space.md }}>
        <Composer
          inputRef={input} value={text} onChangeText={setText} onSend={size} sendLabel="Suggest my kit"
          placeholder="Describe your shoot the way you’d tell a friend"
          // Voice is the phone keyboard's mic; there's no such thing in a desktop browser.
          onMic={Platform.OS !== 'web' ? () => { setVoiceTip(true); input.current?.focus(); } : undefined}
        />
        {voiceTip ? <Text variant="caption" tone="slate">Tap the mic on your keyboard and talk. We’ll read what you say.</Text> : null}
        {!text.trim() ? (
          <View style={[styles.examples, { borderColor: c.line }]}>
            {EXAMPLES.map((e, i) => (
              <Pressable
                key={e} onPress={() => setText(e)} accessibilityRole="button" accessibilityLabel={`Use example: ${e}`}
                android_ripple={{ color: c.raised }}
                style={({ pressed }) => [styles.example, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, pressed && { backgroundColor: c.raised }]}>
                <Text tone="slate" style={{ flex: 1 }}>{e}</Text>
                <Icon name="chevron" size={16} color={c.faint} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <TextAction label="Or answer a few quick questions" onPress={() => { reset(); router.push('/plan/ask/type'); }} />
      </View>

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
          {BROWSE.map(([group, label]) => (
            <Chip key={group} label={label} onPress={() => router.navigate(`/explore?group=${group}`)} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  examples: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  example: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.lg, paddingVertical: space.md },
  resume: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  browse: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
