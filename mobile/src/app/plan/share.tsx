import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { answerChips } from '@/lib/answers-text';
import { naira } from '@/lib/format';
import { lineTitle } from '@/lib/line-text';
import { usePlan } from '@/lib/plan';
import { applyChoices, usePlanResult } from '@/lib/plan-result';
import { shareOnWhatsApp, shareText } from '@/lib/share';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/feedback';
import { Text } from '@/ui/text';

/**
 * R10 Share to WhatsApp: a plain-text quote for whoever approves the spend (client, producer, team).
 * Text only, no image, to save the recipient's data. A web link is added once deloo.space/s/… exists.
 */
export default function ShareSetup() {
  const c = useColors();
  const { draft } = usePlan();
  const { matches } = usePlanResult(draft);
  const message = useMemo(() => {
    if (!matches) return '';
    const r = applyChoices(matches[draft.level], draft);
    const about = answerChips(draft.answers).map((ch) => ch.label).join(' · ');
    const items = r.lines.filter((l) => l.chosen.length).map((l) => `• ${lineTitle(l.line, l.chosen)}`).join('\n');
    const level = draft.level[0].toUpperCase() + draft.level.slice(1);
    return [
      `Shoot kit from Deloo (${level})`,
      about,
      '',
      items,
      '',
      `Total: ${naira(r.totalKobo)}`,
      `(${naira(r.rentalKobo)} rental + ${naira(r.depositKobo)} refundable deposit + ${naira(r.protectionKobo)} protection)`,
      r.match.totals.technicianNote ?? '',
    ].filter((x, i, all) => x !== '' || all[i - 1] !== '').join('\n').trim();
  }, [matches, draft]);

  const [copied, setCopied] = useState(false);
  async function whatsapp() {
    if ((await shareOnWhatsApp(message)) === 'copied') setCopied(true);
  }
  async function other() {
    if ((await shareText(message)) === 'copied') setCopied(true);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: c.surface }}>
      <Text variant="heading" accessibilityRole="header">Share your setup</Text>
      <Text variant="caption" tone="slate">Send it to whoever approves the spending. They don’t need the app.</Text>
      {message ? (
        <View style={[styles.bubble, { backgroundColor: c.greenTint }]}>
          <Text variant="caption" selectable>{message}</Text>
        </View>
      ) : <Skeleton style={{ height: 160 }} />}
      <Button title="Send on WhatsApp" disabled={!message} onPress={whatsapp} />
      <Button kind="secondary" title={copied ? 'Copied. Paste it anywhere' : 'Other apps or copy'} disabled={!message} onPress={other} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  bubble: { padding: space.lg, borderRadius: radius.lg, borderTopLeftRadius: 4 },
});
