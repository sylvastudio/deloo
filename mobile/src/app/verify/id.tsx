import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ID_TYPES, needsBack, setIdType, setPhoto, useKycFlow, type Shot } from '@/lib/kyc';
import { CameraDenied, shootIdPhoto } from '@/lib/photos';
import { safeReturn } from '@/lib/return-to';
import { useSession } from '@/lib/session';
import { fonts, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { Notice } from '@/ui/feedback';
import { Screen } from '@/ui/layout';
import { PhotoSlot } from '@/ui/photo-slot';
import { Text } from '@/ui/text';
import { TextAction } from '@/ui/text-action';
import { TopBar } from '@/ui/top-bar';

/** verify/id: which ID, then a photo of its front (and back for a driver's licence or voter's card). */
export default function VerifyId() {
  const c = useColors();
  const params = useLocalSearchParams<{ return?: string }>();
  const ret = safeReturn(params.return, '/me');
  const { profile } = useSession();
  const flow = useKycFlow();
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Opened straight from a link ("Fix it" on a booking): the consent tick comes first.
  useEffect(() => {
    if (!flow.consentAt) router.replace({ pathname: '/verify', params: { return: ret } });
  }, [flow.consentAt, ret]);

  const back = needsBack(flow.idType);
  const done = !!flow.idType && !!flow.photos.front && (!back || !!flow.photos.back);

  async function take(shot: Shot, source: 'camera' | 'library') {
    setError(''); setDenied(false); setBusy(true);
    try {
      const p = await shootIdPhoto('id', source);
      if (p) setPhoto(shot, p.uri);
    } catch (e) {
      if (e instanceof CameraDenied) setDenied(true);
      else setError('Couldn’t take that photo. Try again.');
    } finally { setBusy(false); }
  }

  const footer = (
    <Button title="Continue" disabled={!done || busy}
      onPress={() => router.push({ pathname: '/verify/selfie', params: { return: ret } })} />
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar fallback={ret as Href} />
      <Screen edges={['bottom']} title="Photo of your ID" subtitle="Lay it flat. All four corners in the frame, no glare." footer={footer}>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Type of ID">
          {ID_TYPES.map((t) => <Chip key={t.key} label={t.label} selected={flow.idType === t.key} onPress={() => setIdType(t.key)} />)}
        </View>

        {denied ? (
          <Notice tone="warning">
            <View style={{ gap: space.xs }}>
              <Text variant="caption">Allow camera access so you can photograph your ID.</Text>
              <TextAction label="Open settings" size="caption" onPress={() => Linking.openSettings().catch(() => {})} />
            </View>
          </Notice>
        ) : null}
        {error ? <Notice tone="problem">{error}</Notice> : null}

        {flow.idType ? <>
          <PhotoSlot label={back ? 'Front of your ID' : 'Your ID'} uri={flow.photos.front} disabled={busy} onTake={(s) => take('front', s)} />
          {back ? <PhotoSlot label="Back of your ID" uri={flow.photos.back} disabled={busy} onTake={(s) => take('back', s)} /> : null}
        </> : <Text variant="caption" tone="slate">Choose the ID you’ll use.</Text>}

        <View style={{ gap: 0 }}>
          <Text variant="caption" tone="slate">
            Name on your ID must match your Deloo name: <Text variant="caption" style={{ color: c.ink, fontFamily: fonts.bodyMedium }}>{profile?.full_name || 'not set'}</Text>.
          </Text>
          <TextAction label="Edit name" size="caption" onPress={() => router.push('/account/edit')} />
        </View>
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
