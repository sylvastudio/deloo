import { Linking, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSupport } from '@/screens/account';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { Card } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

const POINTS: [IconName, string, string][] = [
  ['camera', 'Our own kit', 'Every camera, lens, light and mic you book on Deloo belongs to us. No middlemen, no surprise swaps.'],
  ['check', 'Checked before it leaves', 'We test, charge and photograph every piece before it goes out, so you can see the condition it left in.'],
  ['truck', 'Delivered across Lagos', 'We bring it to you and collect it after your shoot, or you can pick it up yourself.'],
  ['shield', 'No deposit', 'No money held back. Every booking includes Deloo Protection (damage cover) for accidental damage during your rental, up to a limit.'],
];

/** A short page about who Deloo is, for people deciding whether to trust us with their shoot. */
export default function About() {
  const c = useColors();
  const support = useSupport();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="About Deloo" fallback="/me" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">Gear for your shoot, sorted</Text>
        <Text tone="slate">
          Deloo rents out cameras, lenses, lighting and audio in Lagos. Tell us about your shoot and we’ll suggest the right kit,
          check it’s free on your dates and get it to you ready to use.
        </Text>
        {POINTS.map(([icon, title, body]) => (
          <Card key={title} style={styles.point}>
            <Icon name={icon} color={c.lagoon} />
            <Text variant="bodyStrong">{title}</Text>
            <Text variant="caption" tone="slate">{body}</Text>
          </Card>
        ))}
        <Text variant="heading" accessibilityRole="header">Talk to us</Text>
        <Text tone="slate">Questions before you book, or help during a rental: we’re on WhatsApp and the phone.</Text>
        {support.number ? <Button title="Chat on WhatsApp" onPress={() => support.chat('Hi Deloo, I have a question')} /> : null}
        {support.number ? <Button kind="secondary" title="Call us" onPress={support.call} /> : null}
        <Text variant="caption" tone="lagoon" accessibilityRole="link" style={{ textAlign: 'center' }}
          onPress={() => Linking.openURL('https://deloo.space').catch(() => {})}>deloo.space</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  point: { gap: space.xs },
});
