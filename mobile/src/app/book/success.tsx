import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getBookingDraft, setBookingDraft } from '@/lib/booking-draft';
import { usePlan } from '@/lib/plan';
import { bookingDays, cachedSettings, getBooking, PAID, plain, setActiveHold, type BookingDetail } from '@/lib/bookings';
import { dayLabel, daysText, naira, rangeLabel } from '@/lib/format';
import { shareOnWhatsApp, shareText } from '@/lib/share';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { addDays } from '@/ui/date-range';
import { slotHours, slotPhrase } from '@/ui/delivery-slot';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';

type Days = { first: string; last: string };

/** The two dates to remember: delivery (or pickup) and the return morning. */
function calendarEvents(b: BookingDetail, days: Days, pickupAddress?: string) {
  const isPickup = b.delivery === 'pickup';
  const back = addDays(days.last, 1);
  const where = isPickup ? pickupAddress || 'Deloo base' : b.address;
  return [
    {
      key: 'out', day: days.first, hours: slotHours(b.delivery_slot),
      title: isPickup ? `Pick up Deloo gear (${b.ref})` : `Deloo delivery (${b.ref})`,
      note: isPickup ? 'Bring a valid ID.' : 'Be at the address with your phone on. The rider calls before coming. Handover photos take about 3 minutes.',
      where,
    },
    {
      key: 'back', day: back, hours: [8, 11] as [number, number],
      title: isPickup ? `Return Deloo gear (${b.ref})` : `Deloo collection (${b.ref})`,
      note: 'Pack everything with its batteries, chargers and cables. Copy your footage off the cards first.',
      where,
    },
  ];
}

/** Plain text for the share sheet (native: no reliable way to hand an .ics to every calendar app). */
function calendarText(b: BookingDetail, days: Days, pickupAddress?: string) {
  return calendarEvents(b, days, pickupAddress).map((e) => {
    const when = `${dayLabel(e.day)}${e.key === 'out' ? (b.delivery_slot ? `, ${b.delivery_slot}` : '') : ', morning'}`;
    return `${e.title}\n${when}${e.where ? `\n${e.where}` : ''}\n${e.note}`;
  }).join('\n\n');
}

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
/** "20261014T070000Z" for an hour on a Lagos day (UTC+1 all year). */
const icsTime = (day: string, hour: number) => `${day.replace(/-/g, '')}T${String(hour - 1).padStart(2, '0')}0000Z`;

/** An .ics file with both dates. Lines end in CRLF, as the format asks. */
function bookingIcs(b: BookingDetail, days: Days, pickupAddress?: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Deloo//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of calendarEvents(b, days, pickupAddress)) {
    lines.push('BEGIN:VEVENT', `UID:${b.id}-${e.key}@deloo.space`, `DTSTAMP:${stamp}`);
    if (e.hours) lines.push(`DTSTART:${icsTime(e.day, e.hours[0])}`, `DTEND:${icsTime(e.day, e.hours[1])}`);
    else lines.push(`DTSTART;VALUE=DATE:${e.day.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.day, 1).replace(/-/g, '')}`);
    lines.push(`SUMMARY:${icsEscape(e.title)}`, `DESCRIPTION:${icsEscape(`${e.note}\nhttps://app.deloo.space/booking/${b.id}`)}`);
    if (e.where) lines.push(`LOCATION:${icsEscape(e.where)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/** R-34 Success: only once the booking row is confirmed (otherwise back to R-32 pending). */
export default function Success() {
  const c = useColors();
  const { booking } = useLocalSearchParams<{ booking: string }>();
  const [b, setB] = useState<BookingDetail | null | undefined>(undefined);
  const [error, setError] = useState('');
  const { reset: resetPlan } = usePlan();
  const [calNote, setCalNote] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const row = await getBooking(booking);
      if (row && !PAID.includes(row.status)) { router.replace(`/book/pay?booking=${booking}`); return; }
      if (row) {
        // Booked from a plan: that plan is done, so Plan home stops offering "Continue your plan".
        if (getBookingDraft()?.from.kind === 'plan') resetPlan();
        setBookingDraft(null); setActiveHold(null);
      }
      setB(row);
    } catch (e) { setError(plain(e, 'Couldn’t load your booking.')); }
  }, [booking, resetPlan]);
  useEffect(() => { load(); }, [load]);

  // Web: Paystack's checkout is still behind this page in the browser history. Back goes to the booking
  // instead of a stale Paystack screen.
  useEffect(() => {
    if (Platform.OS !== 'web' || !booking) return;
    window.history.pushState(null, '', window.location.href);
    const onPop = () => router.replace(`/booking/${booking}`);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [booking]);

  if (error) return <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><EmptyState icon="warning" title="Couldn’t load your booking" body={error} action="Try again" onAction={load} /></SafeAreaView>;
  if (b === null) return <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><EmptyState icon="calendar" title="Booking not found" action="See my bookings" onAction={() => router.replace('/bookings')} /></SafeAreaView>;

  const days = b ? bookingDays(b) : null;
  const paid = b?.payments.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount_kobo, 0) || b?.total_kobo || 0;
  const pickup = cachedSettings()?.pickup_address;
  const isPickup = b?.delivery === 'pickup';
  const day1 = days ? dayLabel(days.first) : 'your first day';
  const slot = slotPhrase(b?.delivery_slot);
  const steps = isPickup
    ? [`Pick it up on ${day1}${slot ? `, ${slot}` : ''}${pickup ? ` at ${pickup}` : ''}. Bring a valid ID.`, 'We’ll WhatsApp you the evening before.', 'Return it the morning after your last day. Your deposit comes back within 48 hours after we check the gear.']
    : [`We deliver on ${day1}${slot ? `, ${slot}` : ''}. Someone needs to be at the address with their phone on. The rider calls before coming.`, 'We’ll WhatsApp you the evening before.', 'Handover photos take about 3 minutes. We collect the gear the morning after your last day; your deposit comes back within 48 hours after we check it.'];

  async function addToCalendar() {
    if (!b || !days) return;
    setCalNote('');
    if (Platform.OS === 'web') {
      try {
        const blob = new Blob([bookingIcs(b, days, pickup)], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `deloo-${b.ref ?? 'booking'}.ics`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setCalNote('Saved. Open the file to add both dates to your calendar.');
      } catch { setCalNote('Couldn’t make the calendar file. Note the dates above instead.'); }
      return;
    }
    const r = await shareText(calendarText(b, days, pickup));
    if (r === 'failed') setCalNote('Couldn’t open sharing. Note the dates above instead.');
  }

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
            <Button kind="secondary" title="Add to calendar" icon={<Icon name="calendar" />} onPress={addToCalendar}
              accessibilityHint={isPickup ? 'Pickup day and return morning' : 'Delivery day and return morning'} />
            {calNote ? <Text variant="caption" tone="slate">{calNote}</Text> : null}
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
