import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSupport } from '@/screens/account';
import { radius, space, touch } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

/** Answers to what renters ask most. Keep in step with deloo.space/terms and the cancellation RPC (0011). */
const FAQ: { q: string; a: string[] }[] = [
  {
    q: 'Is there a deposit?',
    a: [
      'No. You pay the rental, Deloo Protection (damage cover) and delivery if you choose it. Nothing is held back, and there’s nothing to wait for after your rental.',
      'Booked before we stopped taking deposits? Yours comes back within 48 hours of the gear passing its check. Card refunds can take a few working days to show.',
    ],
  },
  {
    q: 'What does Deloo Protection cover?',
    a: [
      'Protection is part of every booking. It costs 10–20% of the rental, depending on the gear (cameras 20%, lenses and lights 15%, audio and stands 10%).',
      'It covers accidental damage during your rental, up to a limit: Protection pays most of the repair or replacement cost.',
      'It doesn’t cover careless loss, theft without a police report, water damage or missing accessories. Those are charged at the gear’s replacement value.',
    ],
  },
  {
    q: 'What if I need to return it late?',
    a: [
      'Message or call us before your return time. If the gear is free, we’ll extend your booking.',
      'Extra days are charged at the same daily rate.',
    ],
  },
  {
    q: 'Can I cancel?',
    a: [
      'More than 72 hours before your first day: you get everything back.',
      'Between 24 and 72 hours before: half the rental back, plus delivery and Protection.',
      'Less than 24 hours before: delivery and Protection back.',
      'Changed your mind straight away? Cancel within 1 hour of paying and get a full refund, as long as your first day is more than a day away.',
    ],
  },
  {
    q: 'What’s in the box? Is it charged?',
    a: [
      'Everything arrives charged and ready to shoot.',
      'Open your booking to see the in-the-box list for each item, and check it when the gear arrives.',
    ],
  },
  {
    q: 'What about my footage?',
    a: ['Copy your footage off the memory cards before you return them. Cards are cleared before the next rental, so we can’t promise to recover anything left on one.'],
  },
];

/** Help: reach us on WhatsApp or by phone, and the common questions. */
export default function Help() {
  const c = useColors();
  const support = useSupport();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Help" fallback="/me" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">How can we help?</Text>
        {support.number ? (
          <View style={{ gap: space.sm }}>
            <Button title="Chat on WhatsApp" icon={<Icon name="whatsapp" size={20} color={c.onLagoon} />} onPress={() => support.chat()} />
            <Button kind="secondary" title="Call us" icon={<Icon name="phone" size={20} color={c.ink} />} onPress={support.call} />
          </View>
        ) : null}

        <Text variant="heading" accessibilityRole="header" style={{ marginTop: space.md }}>Common questions</Text>
        <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>
          {FAQ.map((f, i) => {
            const expanded = open === i;
            return (
              <View key={f.q} style={i < FAQ.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
                <Pressable
                  onPress={() => setOpen(expanded ? null : i)} accessibilityRole="button" accessibilityState={{ expanded }}
                  android_ripple={{ color: c.lagoonTint }} style={styles.q}>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>{f.q}</Text>
                  <Icon name={expanded ? 'minus' : 'plus'} size={20} color={c.slate} />
                </Pressable>
                {expanded ? (
                  <View style={styles.a}>
                    {f.a.map((line) => <Text key={line} tone="slate">{line}</Text>)}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <Text variant="caption" tone="slate">The full rules are in the rental terms at deloo.space/terms.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  q: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: touch + 8 },
  a: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm },
});
