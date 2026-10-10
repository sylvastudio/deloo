import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { setBookingDraft } from '@/lib/booking-draft';
import { bookingDays, cachedSettings, getBooking, PAID, plain, setActiveHold, type BookingDetail } from '@/lib/bookings';
import { daysText, naira, rangeLabel } from '@/lib/format';
import { shareOnWhatsApp } from '@/lib/share';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';

/** R-34 Success: only once the booking row is confirmed (otherwise back to R-32 pending). */
export default function Success() {
  const c = useColors();
  const { booking } = useLocalSearchParams<{ booking: string }>();
  const [b, setB] = useState<BookingDetail | null | undefined>(undefined);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const row = await getBooking(booking);
      if (row && !PAID.includes(row.status)) { router.replace(`/book/pay?booking=${booking}`); return; }
      if (row) { setBookingDraft(null); setActiveHold(null); }
      setB(row);
    } catch (e) { setError(plain(e, 'Couldn’t load your booking.')); }
  }, [booking]);
  useEffect(() => { load(); }, [load]);

  if (error) return <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><EmptyState icon="warning" title="Couldn’t load your booking" body={error} action="Try again" onAction={load} /></SafeAreaView>;
  if (b === null) return <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><EmptyState icon="calendar" title="Booking not found" action="See my bookings" onAction={() => router.replace('/bookings')} /></SafeAreaView>;

  const days = b ? bookingDays(b) : null;
  const paid = b?.payments.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount_kobo, 0) || b?.total_kobo || 0;
  const pickup = cachedSettings()?.pickup_address;
  const steps = b?.delivery === 'pickup'
    ? ['We check, charge and pack your gear the day before.', `Pick it up on ${days ? rangeLabel(days.first, days.first) : 'your first day'}${pickup ? ` at ${pickup}` : ''}. Bring an ID.`, 'Return it the morning after your last day. Your deposit comes back within 48 hours.']
    : ['We check, charge and pack your gear the day before.', `We deliver on ${days ? rangeLabel(days.first, days.first) : 'your first day'}. Take a few photos when it arrives.`, 'We collect it the morning after your last day. Your deposit comes back within 48 hours.'];

  async function share() {
    if (!b || !days) return;
    const text = `I’ve booked camera gear on Deloo for ${rangeLabel(days.first, days.last)} (${b.ref}): ${b.booking_items.map((i) => i.item_name).join(', ')}.`;
    await shareOnWhatsApp(text);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Animated.View entering={ZoomIn.springify().reduceMotion(ReduceMotion.System)} style={[styles.badge, { backgroundColor: c.lagoon }]}>
          <Icon name="check" size={44} color={c.onLagoon} />
        </Animated.View>
        <Text variant="title" style={{ textAlign: 'center' }}>You’re booked</Text>
        {!b || !days ? <Skeleton style={{ height: 80, alignSelf: 'stretch' }} /> : <>
          <Text tone="slate" style={{ textAlign: 'center' }}>
            {b.ref} · {rangeLabel(days.first, days.last)} · {daysText(b.days)}{'\n'}Paid {naira(paid)}, including a {naira(b.deposit_kobo)} refundable deposit.
          </Text>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text variant="bodyStrong">What happens next</Text>
            {steps.map((s, i) => (
              <View key={s} style={styles.step}>
                <View style={[styles.num, { backgroundColor: c.lagoonTint }]}><Text variant="label" tone="lagoon">{i + 1}</Text></View>
                <Text variant="caption" style={{ flex: 1 }}>{s}</Text>
              </View>
            ))}
          </View>
        </>}
      </ScrollView>
      <View style={styles.footer}>
        <Button title="View booking" onPress={() => router.replace(`/booking/${booking}`)} />
        <Button kind="secondary" title="Share to WhatsApp" disabled={!b} onPress={share} />
        <Button kind="quiet" title="Back to Plan" onPress={() => router.dismissTo('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  badge: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  card: { alignSelf: 'stretch', borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: space.xl, gap: space.sm },
});
