import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { giveConsent, PRIVACY_URL, reasonText, useKyc } from '@/lib/kyc';
import { safeReturn } from '@/lib/return-to';
import { useSupport } from '@/screens/account';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Notice } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

/**
 * verify/index: why we check ID, what's needed, and the consent tick (docs/ux-kyc-protection.md §3).
 * Opened from Review ("Verify my ID", with ?return=/book/review) or from the Me chip. Someone already
 * verified, waiting, or asked for more sees where they stand instead of starting again.
 */
export default function VerifyStart() {
  const c = useColors();
  const params = useLocalSearchParams<{ return?: string }>();
  const ret = safeReturn(params.return, '/me');
  const kyc = useKyc();
  const support = useSupport();
  const [agreed, setAgreed] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace(ret as Href));

  // Verified but trust below 2 means it has lapsed: start again.
  const status = kyc.kyc_status === 'verified' && kyc.trust_level < 2 ? 'none' : kyc.kyc_status;
  if (status === 'verified' || status === 'pending' || status === 'rejected') {
    const copy = {
      verified: { title: 'Your ID is verified', body: 'You’re all set. You won’t be asked again for a while.' },
      pending: { title: 'We’re checking your ID', body: 'We usually check within 2 hours (8am to 8pm). You can pay for your booking now. We’ll confirm before your gear leaves us.' },
      rejected: { title: 'We couldn’t verify your ID', body: 'We can’t rent cameras to this account. If you think we got it wrong, chat with us.' },
    }[status];
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar fallback={ret as Href} />
        <Screen edges={['bottom']} title={copy.title}
          footer={status === 'rejected' && support.number
            ? <Button title="Chat with us on WhatsApp" icon={<Icon name="whatsapp" size={18} color={c.onLagoon} />} onPress={() => support.chat('Hi Deloo, my ID check was not approved. Can you help?')} />
            : <Button title="Done" onPress={back} />}>
          <Text tone="slate">{copy.body}</Text>
        </Screen>
      </SafeAreaView>
    );
  }

  function start() {
    giveConsent();
    router.push({ pathname: '/verify/id', params: { return: ret } });
  }

  const footer = (
    <View style={{ gap: space.sm }}>
      <Button title="Start" disabled={!agreed} onPress={start} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar fallback={ret as Href} />
      <Screen edges={['bottom']} title="Verify your ID" footer={footer}>
        {status === 'needs_more' ? (
          <Notice tone="warning">
            <View style={{ gap: 2 }}>
              <Text variant="bodyStrong">We need a clearer photo</Text>
              <Text variant="caption">{reasonText(kyc.kyc_reason)}</Text>
            </View>
          </Notice>
        ) : null}
        <Text tone="slate">We hand over cameras worth millions, so we check every renter once. It keeps prices low and there’s no deposit.</Text>

        <View style={{ gap: space.sm }}>
          <Text variant="label">You’ll need</Text>
          <Bullet text="Your NIN slip, driver’s licence, voter’s card or passport" />
          <Bullet text="2 minutes and good light" />
        </View>

        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setAgreed(!agreed); }}
          accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}
          style={[styles.consent, { borderColor: agreed ? c.lagoon : c.line, backgroundColor: c.surface }]}>
          <View style={[styles.box, { borderColor: agreed ? c.lagoon : c.faint, backgroundColor: agreed ? c.lagoon : 'transparent' }]}>
            {agreed ? <Icon name="check" size={16} color={c.onLagoon} /> : null}
          </View>
          <Text variant="caption" style={{ flex: 1 }}>
            I agree that Deloo may use my ID photo and selfie to confirm who I am. Only Deloo staff see them, and we delete them after we no longer need them.{' '}
            <Text variant="caption" tone="lagoon" accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>Privacy</Text>
          </Text>
        </Pressable>
      </Screen>
    </SafeAreaView>
  );
}

function Bullet({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={styles.bullet}>
      <View style={[styles.dot, { backgroundColor: c.slate }]} />
      <Text style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 10 },
  consent: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
