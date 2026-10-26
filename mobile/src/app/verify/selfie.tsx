import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { needsBack, sendKyc, setPhoto, useKycFlow } from '@/lib/kyc';
import { CameraDenied, shootIdPhoto } from '@/lib/photos';
import { safeReturn } from '@/lib/return-to';
import { useSession } from '@/lib/session';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Notice } from '@/ui/feedback';
import { Screen } from '@/ui/layout';
import { PhotoSlot } from '@/ui/photo-slot';
import { Text } from '@/ui/text';
import { TextAction } from '@/ui/text-action';
import { TopBar } from '@/ui/top-bar';

/** verify/selfie: a selfie holding the ID (front camera), then everything is sent. */
export default function VerifySelfie() {
  const c = useColors();
  const params = useLocalSearchParams<{ return?: string }>();
  const ret = safeReturn(params.return, '/me');
  const { refresh } = useSession();
  const flow = useKycFlow();
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  // Reached without the ID photos (a reload on the web loses them): back to the ID step.
  const idReady = !!flow.idType && !!flow.photos.front && (!needsBack(flow.idType) || !!flow.photos.back);
  useEffect(() => {
    if (!idReady && !sending) router.replace({ pathname: '/verify/id', params: { return: ret } });
  }, [idReady, sending, ret]);

  async function take(source: 'camera' | 'library') {
    setError(''); setDenied(false); setBusy(true);
    try {
      const p = await shootIdPhoto('selfie', source);
      if (p) setPhoto('selfie', p.uri);
    } catch (e) {
      if (e instanceof CameraDenied) setDenied(true);
      else setError('Couldn’t take that photo. Try again.');
    } finally { setBusy(false); }
  }

  async function send() {
    setError(''); setSending(true);
    try {
      await sendKyc();
      // The session's profile now says pending; Review and Me read it.
      refresh().catch(() => {});
      router.replace({ pathname: '/verify/done', params: { return: ret } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send your photos. Try again.');
      setSending(false);
    }
  }

  const footer = (
    <View style={{ gap: space.sm }}>
      {sending ? <Text variant="caption" tone="slate">Sending your photos securely…</Text> : null}
      <Button title="Send" loading={sending} disabled={!flow.photos.selfie || busy} onPress={send} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar fallback={ret as Href} />
      <Screen edges={['bottom']} title="Now a selfie with your ID" subtitle="Hold your ID next to your face. Face and ID both clear." footer={footer}>
        {denied ? (
          <Notice tone="warning">
            <View style={{ gap: space.xs }}>
              <Text variant="caption">Allow camera access so you can take the selfie.</Text>
              <TextAction label="Open settings" size="caption" onPress={() => Linking.openSettings().catch(() => {})} />
            </View>
          </Notice>
        ) : null}
        {error ? <Notice tone="problem">{error}</Notice> : null}
        <PhotoSlot label="Selfie with your ID" icon="person" portrait uri={flow.photos.selfie} disabled={busy || sending} onTake={take} />
      </Screen>
    </SafeAreaView>
  );
}
