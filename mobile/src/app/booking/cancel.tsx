import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { cachedSettings, loadSettings, plain, quoteCancellation, requestCancellation } from '@/lib/bookings';
import { naira, whatsappUrl } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { SlideToConfirm } from '@/ui/slide-to-confirm';
import { Text } from '@/ui/text';

const REASONS = ['My shoot moved', 'Found it elsewhere', 'Booked by mistake', 'Too expensive', 'Something else'];

/** R-46 Cancel booking: shows what comes back (server quote) before the renter slides to cancel. */
export default function Cancel() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [q, setQ] = useState<{ can_cancel: boolean; refund_kobo: number; hours_to_start: number } | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<number | null>(null);

  const [help, setHelp] = useState(cachedSettings()?.support_whatsapp ?? '');
  useEffect(() => { loadSettings().then((s) => setHelp(s.support_whatsapp)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setError('');
    try { setQ(await quoteCancellation(id)); } catch (e) { setError(plain(e, 'Couldn’t work out your refund.')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function cancel() {
    setBusy(true); setError('');
    try {
      const r = await requestCancellation(id, reason);
      setDone(r.refund_kobo);
    } catch (e) {
      setError(plain(e, 'Couldn’t cancel. Try again or message us on WhatsApp.'));
      setAttempt((n) => n + 1);
    } finally { setBusy(false); }
  }

  if (done !== null) {
    return (
      <View style={[styles.sheet, { backgroundColor: c.paper }]}>
        <EmptyState icon="check" title="Booking cancelled"
          body={done > 0 ? `We’ll refund ${naira(done)} to the account you paid from, within 48 hours. Card refunds can take a few more working days to show.` : 'Nothing was charged, so there’s nothing to refund.'}
          action="Done" onAction={() => router.back()} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.paper }} contentContainerStyle={styles.sheet}>
      <Text variant="heading" accessibilityRole="header">Cancel this booking?</Text>
      {error && !q ? (
        <EmptyState icon="warning" title="Couldn’t check your refund" body={error} action="Try again" onAction={load} />
      ) : !q ? (
        <Skeleton style={{ height: 90 }} />
      ) : !q.can_cancel ? (
        <Notice tone="warning">Your gear is already on its way or with you, so this can’t be cancelled in the app. Message us on WhatsApp.</Notice>
      ) : <>
        {/* A paid booking always gets at least Protection (and any old deposit) back, so ₦0 means nothing was paid yet. */}
        {q.refund_kobo === 0 ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text variant="bodyStrong">Nothing paid yet</Text>
            <Text variant="caption" tone="slate">Cancelling lets the gear go so others can book it.</Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text variant="caption" tone="slate">If you cancel now, you get back</Text>
            <Text variant="number">{naira(q.refund_kobo)}</Text>
            <Text variant="caption" tone="slate">
              {q.hours_to_start > 72
                ? 'Everything, because it’s more than 72 hours before your first day.'
                : q.hours_to_start > 24 ? 'Delivery and Protection in full (and your deposit, if your booking had one), plus half the rental (24–72 hours before your first day).'
                : 'Delivery and Protection (and your deposit, if your booking had one). The rental isn’t refunded within 24 hours of your first day.'}
            </Text>
          </View>
        )}
        <Text variant="caption" tone="slate">Full refund if you cancel within an hour of paying and more than a day before your first day. Refunds go back to the account you paid from.</Text>
        <Text variant="label">Why are you cancelling? (optional)</Text>
        <View style={styles.chips}>{REASONS.map((r) => <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(reason === r ? '' : r)} />)}</View>
        {reason === 'My shoot moved' ? (
          <Notice tone="tip" icon="calendar">
            <View style={{ gap: space.xs }}>
              <Text variant="caption">Shoot moved? We can move your days instead, free if the gear is free.</Text>
              {help ? (
                <Text variant="label" tone="lagoon" accessibilityRole="link"
                  onPress={() => Linking.openURL(whatsappUrl(help, 'Hi Deloo, my shoot moved. Can you move my booking to new days?')).catch(() => {})}>
                  Chat with us
                </Text>
              ) : <Text variant="caption" tone="slate">Message us on WhatsApp before you cancel.</Text>}
            </View>
          </Notice>
        ) : null}
        {error ? <Notice tone="problem">{error}</Notice> : null}
        <SlideToConfirm key={attempt} label={busy ? 'Cancelling…' : 'Slide to cancel'} disabled={busy} onConfirm={cancel} />
      </>}
      <Button kind="quiet" title="Keep my booking" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
