import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { bookingDays, cachedSettings, isActive, listBookings, plain, stageOf, stageTone, STAGE_LABEL, type Booking } from '@/lib/bookings';
import { lagosTime, lagosWhen, naira, rangeLabel, whatsappUrl } from '@/lib/format';
import { pendingUploads, useHandoverJobs, waitingText } from '@/lib/handover';
import { itemPhotoUrl } from '@/lib/photos';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Badge } from '@/ui/chip';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Segmented } from '@/ui/segmented';
import { Text } from '@/ui/text';

type Tab = 'active' | 'past';

/** R-40 Bookings: the renter's real bookings, Active and Past, newest first. */
export default function Bookings() {
  const c = useColors();
  const [list, setList] = useState<Booking[] | null>(null);
  const [savedAt, setSavedAt] = useState<string>();
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const jobs = useHandoverJobs();
  const waiting = pendingUploads(jobs);

  const load = useCallback(async () => {
    try {
      const r = await listBookings();
      setList(r.list); setSavedAt(r.offline ? r.savedAt : undefined); setError('');
    } catch (e) { setError(plain(e, 'Couldn’t load your bookings.')); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Tries that were never paid (a hold that ran out, or was let go to change details) aren't bookings.
  const neverPaid = (b: NonNullable<typeof list>[number]) => !b.confirmed_at && !b.needs_refund && (b.status === 'expired' || b.status === 'cancelled' || (b.status === 'hold' && !isActive(b)));
  const shown = (list ?? []).filter((b) => !neverPaid(b) && (tab === 'active' ? isActive(b) : !isActive(b)));
  const help = cachedSettings()?.support_whatsapp;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">Bookings</Text>
        <Segmented label="Show bookings" value={tab} onChange={setTab} options={[{ value: 'active', label: 'Active' }, { value: 'past', label: 'Past' }]} />
        {savedAt ? <Notice tone="warning">{`You’re offline. Showing what we saved at ${lagosTime(savedAt)}.`}</Notice> : null}
        {waiting ? <Notice tone="tip" icon="clock">{`${waitingText(waiting)}. We’ll keep trying.`}</Notice> : null}
      </View>
      {error && !list ? (
        <View style={{ padding: space.xl, gap: space.md }}>
          <EmptyState icon="warning" title="Couldn’t load your bookings" body={error} action="Try again" onAction={load} />
          {help ? <Text variant="label" tone="lagoon" style={{ textAlign: 'center' }} onPress={() => Linking.openURL(whatsappUrl(help, 'Hi Deloo, I can’t see my bookings')).catch(() => {})}>Chat on WhatsApp</Text> : null}
        </View>
      ) : !list ? (
        <View style={styles.list}>{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 112, borderRadius: radius.lg }} />)}</View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} colors={[c.lagoon]} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={tab === 'active' ? (
            <EmptyState icon="calendar" title="No bookings yet" body="Book a camera, lens, light or mic and follow it here: on the way, delivered, collected, checked."
              action="Explore gear" onAction={() => router.navigate('/explore')} />
          ) : <EmptyState icon="calendar" title="Nothing here yet" body="Finished and cancelled bookings show here." />}
          renderItem={({ item }) => <BookingCard b={item} waiting={pendingUploads(jobs, item.id)} />}
        />
      )}
    </SafeAreaView>
  );
}

/** What the renter should do next, if anything. */
function nextAction(b: Booking): string | undefined {
  const stage = stageOf(b);
  const { last } = bookingDays(b);
  if (b.needs_refund) return 'We received your payment. We’ll call you';
  if (stage === 'hold') return isActive(b) && b.hold_expires_at ? `Pay by ${lagosTime(b.hold_expires_at)} to keep it` : undefined;
  if (stage === 'out_for_delivery') return 'On the way. Take photos when it arrives';
  if (stage === 'in_use' || stage === 'delivered') return `Return due ${rangeLabel(last, last)}`;
  if (stage === 'return_due') return 'Return due. Take photos before it goes';
  if (stage === 'collected') return 'We’re checking the gear';
  if (stage === 'inspected' && b.deposit_kobo > 0) return 'Deposit on its way back';
  return undefined;
}

function BookingCard({ b, waiting }: { b: Booking; waiting: number }) {
  const c = useColors();
  const stage = stageOf(b);
  const { first, last } = bookingDays(b);
  const next = nextAction(b);
  const cover = b.booking_items[0];
  const label = b.needs_refund ? 'Payment received' : b.status === 'hold' && !isActive(b) ? 'Hold ended' : STAGE_LABEL[stage];
  return (
    <Pressable onPress={() => router.push(b.status === 'hold' && isActive(b) ? `/book/pay?booking=${b.id}` : `/booking/${b.id}`)}
      accessibilityRole="button" accessibilityLabel={`Booking ${b.ref ?? ''}, ${rangeLabel(first, last)}, ${label}`}
      android_ripple={{ color: c.lagoonTint }} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
      <View>
        {cover?.items?.photos[0] ? (
          <Image source={{ uri: itemPhotoUrl(cover.items.photos[0]) }} style={[styles.thumb, { backgroundColor: '#fff', borderColor: c.line }]} contentFit="contain" />
        ) : (
          <View style={[styles.thumb, styles.art, { backgroundColor: c.lagoonTint, borderColor: c.line }]}><Icon name={categoryIcon(cover?.items?.category_key ?? '')} size={24} color={c.lagoon} /></View>
        )}
        {b.booking_items.length > 1 ? (
          <View style={[styles.more, { backgroundColor: c.ink }]}><Text variant="caption" style={{ color: c.paper }}>+{b.booking_items.length - 1}</Text></View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.top}>
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{rangeLabel(first, last)}</Text>
          <Text variant="label">{naira(b.total_kobo, true)}</Text>
        </View>
        <Text variant="caption" tone="slate" numberOfLines={1}>
          {b.ref ? `${b.ref} · ` : ''}{b.booking_items.map((i) => i.item_name).join(', ') || `Booked ${lagosWhen(b.created_at)}`}
        </Text>
        <View style={styles.badges}>
          <Badge label={label} status={b.needs_refund ? 'limited' : b.status === 'hold' && !isActive(b) ? 'unavailable' : stageTone(stage)} />
          {waiting ? <Badge label={waitingText(waiting)} /> : null}
        </View>
        {next ? <Text variant="caption" tone="lagoon">{next}</Text> : null}
      </View>
      <Icon name="chevron" color={c.slate} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md, gap: space.md },
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', minHeight: 96 },
  thumb: { width: 56, height: 56, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  art: { alignItems: 'center', justifyContent: 'center' },
  more: { position: 'absolute', right: -4, bottom: -4, borderRadius: radius.pill, paddingHorizontal: 6, minWidth: 22, alignItems: 'center' },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
});
