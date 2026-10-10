import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { plain } from '@/lib/bookings';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useNextBooking, useSupport } from '@/screens/account';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Notice } from '@/ui/feedback';
import { Field } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

const WHAT_HAPPENS = [
  'You’re signed out on this phone straight away.',
  'We delete your name, phone, email, plans and handover photos within 30 days, and message you when it’s done.',
  'Payment and booking records we must keep by law (for tax and refunds) are kept, without your contact details, for as long as the law requires.',
  'If you have a booking that’s still going, we finish it and settle any refund first.',
];

/**
 * Delete account (required by Google Play). Records a request through request_account_deletion
 * (0015) for Deloo to process by hand, because bookings and refunds may still be open;
 * then signs out. Typing DELETE stops it happening by accident.
 */
export default function DeleteAccount() {
  const c = useColors();
  const { signOut } = useSession();
  const next = useNextBooking();
  const support = useSupport();
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = typed.trim().toUpperCase() === 'DELETE';

  async function request() {
    setBusy(true); setError('');
    const { error: err } = await supabase.rpc('request_account_deletion', { p_reason: reason.trim() });
    if (err) { setBusy(false); return setError(plain(err, 'That didn’t send. Check your connection and try again.')); }
    await signOut(); // the router takes them to Welcome
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Delete account" fallback="/me" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="title" accessibilityRole="header">Delete your Deloo account</Text>
        <View style={{ gap: space.sm }}>
          {WHAT_HAPPENS.map((line) => (
            <View key={line} style={styles.bullet}>
              <Text tone="slate">{'•'}</Text>
              <Text tone="slate" style={{ flex: 1 }}>{line}</Text>
            </View>
          ))}
        </View>
        {next ? <Notice tone="warning">You have a booking that’s still going. We’ll finish it before we delete anything.</Notice> : null}
        <Field label="Why are you leaving?" value={reason} onChangeText={setReason} multiline hint="Optional. It helps us do better." />
        <Field label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" />
        {error ? <Notice tone="problem">{error}</Notice> : null}
        <Button title="Delete my account" disabled={!ok} loading={busy} onPress={request}
          style={{ backgroundColor: c.red }} accessibilityHint="Sends the request and signs you out" />
        {support.number ? (
          <Text variant="caption" tone="slate" style={{ textAlign: 'center' }}>
            Changed your mind or need help instead? <Text variant="caption" tone="lagoon" onPress={() => support.chat('Hi Deloo, about deleting my account')}>Chat on WhatsApp</Text>
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  bullet: { flexDirection: 'row', gap: space.sm },
});
