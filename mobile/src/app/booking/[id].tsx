import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { advanceDemoBooking, cancelDemoBooking, getDemoBooking, STEPS } from '@/lib/demo-bookings';
import { naira } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/chip';
import { EmptyState } from '@/ui/feedback';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';
import { CheckpointTracker } from '@/ui/tracker';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' });
const DETAIL: Record<number, string> = {
  0: 'Waiting for the owners to confirm. Usually within 2 hours.',
  1: 'Everything is confirmed. We’ll remind you the day before.',
  2: 'Your gear is ready. Check it with the owner’s photos before you take it.',
  3: 'Handed over and checked. Enjoy your event.',
  4: 'Your event is on. Something wrong? Tap Help and we’ll sort it.',
  5: 'Returned. The owner is checking it.',
  6: 'Your deposit is on its way back.',
};

/** R20 Booking tracker (demo bookings now; real bookings from the pilot). */
export default function Tracker() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [b, setB] = useState(() => (id ? getDemoBooking(id) : undefined));

  if (!b) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar title="Booking" />
      <EmptyState icon="calendar" title="Booking not found" body="It may have been cancelled." action="See all bookings" onAction={() => router.replace('/bookings')} />
    </SafeAreaView>
  );

  const steps = STEPS.map((label, i) => ({ label, state: i < b.step ? 'done' : i === b.step ? 'current' : 'next', detail: i === b.step ? DETAIL[i] : undefined }) as const);
  const deposit = b.parts.reduce((s, p) => s + p.depositKobo, 0);
  const done = b.step === STEPS.length - 1;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Booking" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: space.xs }}>
          <Badge label="Demo booking" status="limited" />
          <Text variant="title">{b.title}</Text>
          {b.startsAt ? <Text tone="slate">{DAY.format(new Date(b.startsAt))}{b.area ? ` · ${b.area}` : ''}</Text> : null}
        </View>

        <View style={[styles.card, { backgroundColor: c.lagoon }]}>
          <Text variant="label" style={{ color: c.onLagoon, opacity: 0.85 }}>NOW</Text>
          <Text variant="heading" style={{ color: c.onLagoon }}>{STEPS[b.step]}</Text>
          <Text style={{ color: c.onLagoon }}>{DETAIL[b.step]}</Text>
        </View>

        <CheckpointTracker steps={steps} />

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1 }]}>
          {b.parts.map((p) => (
            <View key={p.vendorId} style={{ gap: 2 }}>
              <Text variant="bodyStrong">{p.vendorName}</Text>
              {p.items.map((it) => <Text key={it.title} variant="caption" tone="slate">• {it.title}</Text>)}
              <Text variant="caption" tone="slate">{p.delivery === 'delivery' ? 'Delivery' : 'You pick up'}{p.technician ? ' · with technician' : ''}</Text>
            </View>
          ))}
          <Text variant="caption">Paid {naira(b.totalKobo)} · deposit {naira(deposit)} {done ? 'refunded' : 'comes back after return'}</Text>
        </View>

        <Button kind="secondary" title="Help on WhatsApp" onPress={() => Linking.openURL(`whatsapp://send?text=${encodeURIComponent(`Hi Deloo, about my booking ${b.id}`)}`).catch(() => {})} />
        {!done ? <Button kind="quiet" title="Demo: move to the next step" onPress={() => setB(advanceDemoBooking(b.id))} /> : null}
        {b.step === 0 ? <Button kind="quiet" title="Cancel booking" onPress={() => { cancelDemoBooking(b.id); router.replace('/bookings'); }} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
});
