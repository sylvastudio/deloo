import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Field, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

/**
 * Name and phone. RLS lets people update only these columns on their own profile row (0007), so a
 * plain update is enough; refresh() then brings the new values into the session.
 */
export default function EditAccount() {
  const c = useColors();
  const { session, profile, refresh } = useSession();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const unchanged = name.trim() === (profile?.full_name ?? '') && phone.trim() === (profile?.phone ?? '');

  async function save() {
    setError('');
    if (!name.trim()) return setError('Add your name.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Add a phone number we can call or WhatsApp.');
    if (!session) return;
    setBusy(true);
    const { error: err } = await supabase.from('profiles').update({ full_name: name.trim(), phone: phone.trim() }).eq('id', session.user.id);
    if (err) { setBusy(false); return setError('That didn’t save. Check your connection and try again.'); }
    await refresh();
    setBusy(false);
    if (router.canGoBack()) router.back(); else router.replace('/me');
  }

  const footer = (
    <View style={{ gap: space.sm }}>
      {error ? <Text variant="caption" tone="red" accessibilityRole="alert">{error}</Text> : null}
      <Button title="Save" loading={busy} disabled={unchanged} onPress={save} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Name and phone" fallback="/me" />
      <Screen edges={['bottom']} footer={footer}>
        <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
        <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber"
          placeholder="0803 123 4567" hint="Our riders call this number on delivery and pickup days." />
        <Text variant="caption" tone="slate">Bookings you’ve already made keep the contact number you gave for them. Message us if one needs changing.</Text>
      </Screen>
    </SafeAreaView>
  );
}
