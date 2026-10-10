import { useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { Field, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

/**
 * Name and phone, then straight to planning. Deloo rents its own gear for now; people who want to
 * rent out theirs join the waitlist from Coming soon (vertical "gear").
 */
export default function Onboarding() {
  const { session, refresh } = useSession();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function finish() {
    setError('');
    if (!name.trim()) return setError('Add your name.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Add a phone number we can call or WhatsApp.');
    if (!session) return;
    setBusy(true);
    const fields = { full_name: name.trim(), phone: phone.trim(), wants_to_rent: true, has_gear: false };
    // Insert, or update if an earlier attempt got this far (not upsert: users may not write `id`).
    let { error: err } = await supabase.from('profiles').insert({ id: session.user.id, ...fields });
    if (err?.code === '23505') ({ error: err } = await supabase.from('profiles').update(fields).eq('id', session.user.id));
    setBusy(false);
    if (err) return setError('Setup didn’t finish. Check your connection and try again.');
    await refresh(); // the router moves on once the profile exists
  }

  const footer = (
    <View style={{ gap: space.sm }}>
      {error ? <Text variant="caption" tone="red" accessibilityRole="alert">{error}</Text> : null}
      <Button title="Start planning" loading={busy} onPress={finish} />
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']} footer={footer}>
      <Text variant="title" accessibilityRole="header">What should we call you?</Text>
      <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" autoFocus />
      <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber"
        placeholder="0803 123 4567" hint="For delivery and pickup on your rental days." />
      <Text variant="caption" tone="slate">Cameras, lenses, lights and audio for your shoot, delivered across Lagos.</Text>
    </Screen>
  );
}
