import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getPendingBooking, setPendingBooking } from '@/lib/booking-draft';
import { addDemoBooking } from '@/lib/demo-bookings';
import { naira } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Badge, Chip } from '@/ui/chip';
import { EmptyState, Notice } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { SlideToConfirm } from '@/ui/slide-to-confirm';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

const METHODS = [['transfer', 'Bank transfer'], ['card', 'Card'], ['ussd', 'USSD']] as const;

/** R17 Pay, with slide to pay at the bottom (R18 success follows). Demo: no Paystack call yet. */
export default function Pay() {
  const c = useColors();
  const pending = getPendingBooking();
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>('card');
  const [left, setLeft] = useState(() => (pending ? pending.holdUntil - Date.now() : 0));
  useEffect(() => {
    const t = setInterval(() => setLeft(pending ? pending.holdUntil - Date.now() : 0), 1000);
    return () => clearInterval(t);
  }, [pending]);

  if (!pending) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title="Pay" />
        <EmptyState icon="clock" title="Your hold has ended" body="Go back to your setup to check it’s still free." action="Back to my setup" onAction={() => router.replace('/plan/setup')} />
      </SafeAreaView>
    );
  }
  const expired = left <= 0;
  const mins = Math.max(0, Math.floor(left / 60000)), secs = Math.max(0, Math.floor((left % 60000) / 1000));
  const rental = pending.parts.reduce((s, p) => s + p.rentalKobo, 0);
  const deposit = pending.parts.reduce((s, p) => s + p.depositKobo, 0);

  function pay() {
    if (!pending) return;
    const booking = addDemoBooking({
      title: pending.title, startsAt: pending.startsAt, endsAt: pending.endsAt, area: pending.area, parts: pending.parts,
      deliveryKobo: pending.deliveryKobo, protectionKobo: pending.protectionKobo, totalKobo: pending.totalKobo,
    });
    setPendingBooking(null);
    router.replace(`/book/success?id=${booking.id}`);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Pay" right={<Badge label={expired ? 'Hold ended' : `Held ${mins}:${String(secs).padStart(2, '0')}`} status={expired ? 'unavailable' : mins < 5 ? 'limited' : 'neutral'} />} />
      <ScrollView contentContainerStyle={styles.content}>
        <Badge label="Demo: no real money moves" status="limited" />
        <View style={{ gap: 2 }}>
          <Text variant="caption" tone="slate">To pay</Text>
          <Text variant="hero">{naira(pending.totalKobo)}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text variant="bodyStrong">Rental and fees</Text>
          <Text variant="caption" tone="slate">{naira(rental)} rental · {naira(pending.protectionKobo)} protection{pending.deliveryKobo ? ` · ${naira(pending.deliveryKobo)} delivery` : ''}</Text>
          <Text variant="caption" tone="slate">Goes to the owners only after they confirm. Until then, it’s safe with Deloo.</Text>
        </View>
        <View style={[styles.card, { backgroundColor: c.greenTint, borderColor: c.greenTint }]}>
          <View style={styles.row}><Icon name="shield" size={18} color={c.greenInk} /><Text variant="bodyStrong" style={{ color: c.greenInk }}>Deposit {naira(deposit)}</Text></View>
          <Text variant="caption">Comes back to you within 24 hours of a clean return.</Text>
          <View style={[styles.track, { backgroundColor: c.surface }]}><View style={[styles.fill, { backgroundColor: c.green }]} /></View>
          <Text variant="caption" tone="slate">Paid → held during your event → returned</Text>
        </View>
        <Text variant="label">Pay with</Text>
        <View style={styles.row}>{METHODS.map(([k, l]) => <Chip key={k} label={l} selected={method === k} onPress={() => setMethod(k)} />)}</View>
        {method === 'card' ? <Text variant="caption" tone="slate">Card is quickest. It also covers repair costs if gear is damaged, so you don’t need a bigger deposit.</Text> : null}
        {expired ? <Notice tone="problem">Your 30-minute hold ended. Go back to check the gear is still free.</Notice> : null}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line }]}>
        <SlideToConfirm label={`Slide to pay ${naira(pending.totalKobo)}`} disabled={expired} onConfirm={pay} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { width: '33%', height: 6 },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
