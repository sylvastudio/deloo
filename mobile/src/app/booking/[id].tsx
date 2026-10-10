import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  bookingDays, cachedSettings, getBooking, loadSettings, plain, stageOf, STAGE_LABEL, TIMELINE,
  type BookingDetail, type Handover, type Settings, type Stage,
} from '@/lib/bookings';
import { dayLabel, daysText, lagosWhen, naira, rangeLabel, whatsappUrl } from '@/lib/format';
import { pendingUploads, signedUrls, useHandoverJobs, waitingText, type HandoverJob } from '@/lib/handover';
import { itemPhotoUrl } from '@/lib/photos';
import { radius, space, touch } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/chip';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';
import { CheckpointTracker, type Checkpoint } from '@/ui/tracker';

const REFUND_STATUS: Record<string, string> = { queued: 'Queued', processing: 'On its way', success: 'Sent', failed: 'Delayed, we’re on it' };
const REFUND_PURPOSE: Record<string, string> = {
  deposit: 'Deposit refund', cancellation: 'Cancellation refund', duplicate: 'Duplicate payment refund', gear_gone: 'Full refund',
  claim_balance: 'Deposit balance', goodwill: 'Goodwill credit',
};
const SHOT: Record<string, string> = { overview: 'Overview', serial: 'Serial', accessories: 'Accessories', damage: 'Damage', video_test: 'Video', other: 'Other' };

/** What each stage means for the renter, in a sentence. */
function stageDetail(b: BookingDetail, stage: Stage, pickup: boolean): string {
  const { first, last } = bookingDays(b);
  switch (stage) {
    case 'confirmed': return pickup ? `Paid and confirmed. Pick up on ${dayLabel(first)}.` : `Paid and confirmed. We deliver on ${dayLabel(first)}${b.delivery_slot ? `, ${b.delivery_slot}` : ''}.`;
    case 'preparing': return 'We’re checking, charging and packing your gear.';
    case 'out_for_delivery': return pickup ? 'Ready for you at our base.' : b.rider_name ? `${b.rider_name} is on the way.` : 'Your gear is on the way.';
    case 'delivered': return `Enjoy your shoot. Return due ${dayLabel(last)}.`;
    case 'in_use': return `Enjoy your shoot. Return due ${dayLabel(last)}${b.collection_slot ? `, ${b.collection_slot}` : ''}.`;
    case 'return_due': return pickup ? 'Bring it back to our base tomorrow morning.' : `We collect it the morning after ${dayLabel(last)}.`;
    case 'collected': return 'Back with us. We’re checking it over.';
    case 'inspected': return 'All checked. Your deposit is on its way back.';
    case 'closed': return 'All done. Thanks for renting with Deloo.';
    case 'disputed': return 'We found something during the check. We’ll call you to go through it with photos.';
    default: return '';
  }
}

/** R-41 Booking tracker, with R-46 cancel and R-42 handover photos reached from here. */
export default function Tracker() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [b, setB] = useState<BookingDetail | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(cachedSettings);
  const jobs = useHandoverJobs();
  const myJobs = jobs.filter((j) => j.bookingId === id);
  const waiting = pendingUploads(jobs, id);

  const load = useCallback(async () => {
    try { setB(await getBooking(id)); setError(''); } catch (e) { setError(plain(e, 'Couldn’t load this booking.')); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { loadSettings().then(setSettings).catch(() => {}); }, []);
  // Uploads finishing change what the server has: refresh when the queue for this booking empties.
  const before = useRef(waiting);
  useEffect(() => { if (before.current > 0 && waiting === 0) load(); before.current = waiting; }, [waiting, load]);

  const help = settings?.support_whatsapp;
  const chat = (text: string) => help && Linking.openURL(whatsappUrl(help, text)).catch(() => {});

  if (b === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar title="Booking" />
        <EmptyState icon="calendar" title="Booking not found" body="It may belong to another account." action="See all bookings" onAction={() => router.replace('/bookings')} />
      </SafeAreaView>
    );
  }
  if (!b) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar title="Booking" />
        {error ? (
          <View style={{ padding: space.xl }}>
            <EmptyState icon="warning" title="Couldn’t load this booking" body={error} action="Try again" onAction={load} />
            {help ? <Button kind="quiet" title="Chat on WhatsApp" onPress={() => chat('Hi Deloo, I can’t open my booking')} /> : null}
          </View>
        ) : <View style={styles.content}><Skeleton style={{ height: 40, width: '60%' }} /><Skeleton style={{ height: 110 }} /><Skeleton style={{ height: 260 }} /></View>}
      </SafeAreaView>
    );
  }

  const stage = stageOf(b);
  const { first, last } = bookingDays(b);
  const pickup = b.delivery === 'pickup';
  const hadDelivery = b.handovers.some((h) => h.party === 'renter' && h.kind === 'delivery') || myJobs.some((j) => j.kind === 'delivery' && j.state === 'ready');
  const hadReturn = b.handovers.some((h) => h.party === 'renter' && h.kind === 'collection') || myJobs.some((j) => j.kind === 'collection' && j.state === 'ready');
  const canReceive = (b.status === 'out_for_delivery' || b.status === 'delivered') && !hadDelivery;
  const canReturn = b.status === 'delivered' && (hadDelivery || stage === 'return_due') && !hadReturn;
  const canCancel = ['hold', 'confirmed', 'preparing'].includes(b.status);
  const paid = b.payments.filter((p) => p.status === 'success');
  const ended = b.status === 'cancelled' || b.status === 'expired';
  const label = (s: Stage) => (pickup && s === 'out_for_delivery' ? 'Ready for pickup' : pickup && s === 'delivered' ? 'Picked up' : STAGE_LABEL[s]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={b.ref ?? 'Booking'} />
      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} colors={[c.lagoon]} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={{ gap: space.xs }}>
          <Text variant="title">{rangeLabel(first, last)}</Text>
          <Text tone="slate">{daysText(b.days)} · {pickup ? 'You pick up' : 'Delivered to you'} · {naira(b.total_kobo)}</Text>
        </View>
        {error ? <Notice tone="warning">{error}</Notice> : null}
        {waiting ? <Notice tone="tip" icon="clock">{`${waitingText(waiting)}. We’ll keep trying, even after you close the app.`}</Notice> : null}

        {/* Banners for the off-path states */}
        {b.needs_refund ? (
          <Notice tone="problem"><View style={{ gap: 2 }}>
            <Text variant="bodyStrong" tone="red">We received your payment but the gear was taken</Text>
            <Text variant="caption">Your money is safe. We’ll call you to offer other gear or refund you in full.</Text>
          </View></Notice>
        ) : b.status === 'cancelled' ? (
          <Notice tone="warning">{`Cancelled${b.cancelled_at ? ` on ${lagosWhen(b.cancelled_at)}` : ''}. ${b.refunds.length ? 'Your refund is below.' : 'Nothing to refund.'}`}</Notice>
        ) : b.status === 'expired' ? (
          <Notice tone="warning">The hold ended before payment, so nothing was charged.</Notice>
        ) : b.status === 'hold' ? (
          <Notice tone="warning"><View style={{ gap: space.xs }}>
            <Text variant="caption">Waiting for payment. We hold your gear until {b.hold_expires_at ? lagosWhen(b.hold_expires_at) : 'the hold ends'}.</Text>
            <Text variant="label" tone="lagoon" onPress={() => router.push(`/book/pay?booking=${b.id}`)} accessibilityRole="button">Resume payment</Text>
          </View></Notice>
        ) : null}

        {!ended && b.status !== 'hold' ? <>
          <View style={[styles.now, { backgroundColor: c.lagoon }]}>
            <Text variant="label" style={{ color: c.onLagoon, opacity: 0.85 }}>NOW</Text>
            <Text variant="heading" style={{ color: c.onLagoon }}>{label(stage)}</Text>
            <Text style={{ color: c.onLagoon }}>{stageDetail(b, stage, pickup)}</Text>
          </View>

          {canReceive ? <Button title="I’ve received it: take photos" icon={<Icon name="camera" color={c.onLagoon} />}
            onPress={() => router.push(`/booking/handover?booking=${b.id}&kind=delivery`)} /> : null}
          {canReturn ? <Button title="I’m returning it: take photos" icon={<Icon name="camera" color={c.onLagoon} />}
            onPress={() => router.push(`/booking/handover?booking=${b.id}&kind=collection`)} /> : null}

          {b.rider_name && (b.status === 'out_for_delivery' || stage === 'return_due') ? (
            <View style={[styles.card, styles.row, { backgroundColor: c.surface, borderColor: c.line }]}>
              <View style={[styles.avatar, { backgroundColor: c.lagoonTint }]}><Icon name="truck" color={c.lagoon} /></View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{b.rider_name}</Text>
                <Text variant="caption" tone="slate">Your rider{b.rider_phone ? ` · ${b.rider_phone}` : ''}</Text>
              </View>
              {b.rider_phone ? <>
                <IconButton icon="phone" label={`Call ${b.rider_name}`} onPress={() => Linking.openURL(`tel:${b.rider_phone}`).catch(() => {})} />
                <IconButton icon="whatsapp" label={`WhatsApp ${b.rider_name}`} onPress={() => Linking.openURL(whatsappUrl(b.rider_phone, `Hi ${b.rider_name}, it’s about Deloo booking ${b.ref}`)).catch(() => {})} />
              </> : null}
            </View>
          ) : null}

          <CheckpointTracker steps={timeline(b, stage, label)} />
        </> : null}

        {/* Items */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text variant="label" tone="slate">YOUR GEAR</Text>
          {b.booking_items.map((i) => (
            <View key={i.id} style={styles.row}>
              {i.items?.photos[0] ? (
                <Image source={{ uri: itemPhotoUrl(i.items.photos[0]) }} style={[styles.thumb, { backgroundColor: '#fff' }]} contentFit="contain" />
              ) : <View style={[styles.thumb, styles.center, { backgroundColor: c.lagoonTint }]}><Icon name={categoryIcon(i.items?.category_key ?? '')} color={c.lagoon} /></View>}
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{i.item_name}</Text>
                <Text variant="caption" tone="slate">
                  {naira(i.rental_kobo)} · deposit {naira(i.deposit_kobo)}
                  {['delivered', 'collected', 'inspected', 'closed', 'disputed'].includes(b.status) && i.units && (i.units.tag || i.units.serial)
                    ? ` · ${[i.units.tag, i.units.serial && `S/N ${i.units.serial}`].filter(Boolean).join(' · ')}` : ''}
                </Text>
                {i.items?.in_the_box?.length ? <Text variant="caption" tone="faint" numberOfLines={2}>With {i.items.in_the_box.join(', ')}</Text> : null}
              </View>
            </View>
          ))}
          {b.not_included?.length ? (
            <Text variant="caption" tone="slate">Not included: {b.not_included.map((x) => (typeof x === 'string' ? x : x.label)).join(', ')}.</Text>
          ) : null}
        </View>

        {/* Where */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text variant="label" tone="slate">{pickup ? 'PICKUP' : 'DELIVERY'}</Text>
          <View style={styles.row}>
            <Icon name="pin" color={c.slate} />
            <Text style={{ flex: 1 }}>{pickup ? settings?.pickup_address || 'Our base. We’ll send the address on WhatsApp.' : b.address}</Text>
          </View>
          {!pickup && (b.delivery_slot || b.collection_slot) ? (
            <Text variant="caption" tone="slate">{[b.delivery_slot && `Delivery ${b.delivery_slot}`, b.collection_slot && `Collection ${b.collection_slot}`].filter(Boolean).join(' · ')}</Text>
          ) : null}
          {b.contact_phone ? <Text variant="caption" tone="slate">Rider will call {b.contact_phone}</Text> : null}
        </View>

        {/* Money */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text variant="label" tone="slate">PAYMENT</Text>
          <Money label="Rental" value={naira(b.rental_kobo)} />
          <Money label="Deloo Protection" value={naira(b.protection_kobo)} />
          {b.delivery_kobo ? <Money label="Delivery and collection" value={naira(b.delivery_kobo)} /> : null}
          <Money label="Refundable deposit" value={naira(b.deposit_kobo)} />
          <View style={[styles.divider, { backgroundColor: c.line }]} />
          <Money label="Total" value={naira(b.total_kobo)} strong />
          {paid.map((p) => (
            <Text key={p.id} variant="caption" tone="slate">Paid {naira(p.amount_kobo)}{p.channel ? ` by ${p.channel.replace('_', ' ')}` : ''}{p.paid_at ? ` on ${lagosWhen(p.paid_at)}` : ''}</Text>
          ))}
          {b.refunds.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text variant="caption" style={{ flex: 1 }}>{REFUND_PURPOSE[r.purpose] ?? 'Refund'} {naira(r.amount_kobo)}</Text>
              <Badge label={REFUND_STATUS[r.status] ?? r.status} status={r.status === 'success' ? 'available' : r.status === 'failed' ? 'unavailable' : 'limited'} />
            </View>
          ))}
          {!b.refunds.some((r) => r.purpose === 'deposit') && PAIDISH.includes(b.status) ? (
            <Text variant="caption" tone="slate">Your deposit comes back within 48 hours after we check the gear.</Text>
          ) : null}
        </View>

        <Evidence handovers={b.handovers} jobs={myJobs} />

        <View style={{ gap: space.sm }}>
          {help ? <Button kind="secondary" title="Help on WhatsApp" icon={<Icon name="whatsapp" />} onPress={() => chat(`Hi Deloo, about my booking ${b.ref}`)} /> : null}
          {help && ['delivered', 'out_for_delivery'].includes(b.status) ? (
            <Button kind="quiet" title="Report a problem" onPress={() => chat(`Hi Deloo, there’s a problem with my booking ${b.ref}: `)} />
          ) : null}
          {canCancel ? <Button kind="quiet" title="Cancel booking" onPress={() => router.push(`/booking/cancel?id=${b.id}`)} /> : null}
          {!canCancel && !ended && !['closed', 'inspected'].includes(b.status) ? (
            <Text variant="caption" tone="slate" style={{ textAlign: 'center' }}>Your gear is on its way or with you, so changes are by WhatsApp.</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const PAIDISH = ['confirmed', 'preparing', 'out_for_delivery', 'delivered', 'collected', 'inspected'];

function timeline(b: BookingDetail, stage: Stage, label: (s: Stage) => string): Checkpoint[] {
  const { first, last } = bookingDays(b);
  const at = stage === 'disputed' ? TIMELINE.indexOf('inspected') : TIMELINE.indexOf(stage);
  const time: Partial<Record<Stage, string>> = {
    confirmed: b.confirmed_at ? lagosWhen(b.confirmed_at) : undefined,
    out_for_delivery: dayLabel(first), in_use: dayLabel(first), return_due: dayLabel(last),
  };
  return TIMELINE.map((s, i) => ({
    label: s === 'inspected' && stage === 'disputed' ? 'Being reviewed' : label(s),
    time: time[s],
    state: b.status === 'closed' || i < at ? 'done' : i === at ? 'current' : 'next',
    detail: i === at && s === 'return_due' ? 'Have everything packed, with its cables and batteries.' : undefined,
  }));
}

/** "Ours and yours, out and back": thumbnails per hand-off, plus what's still on the phone. */
function Evidence({ handovers, jobs }: { handovers: Handover[]; jobs: HandoverJob[] }) {
  const c = useColors();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const paths = useMemo(() => handovers.flatMap((h) => h.handover_media.map((m) => m.storage_path)), [handovers]);
  const key = paths.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { signedUrls(paths).then(setUrls); }, [key]);
  const ready = jobs.filter((j) => j.state === 'ready');
  if (!handovers.length && !ready.length) return null;

  const title = (h: Pick<Handover, 'kind' | 'party'>) =>
    `${h.party === 'staff' ? 'Our' : 'Your'} photos · ${{ dispatch: 'before it left', delivery: 'on delivery', collection: 'on return', inspection: 'at the check' }[h.kind]}`;
  const order = ['dispatch', 'delivery', 'collection', 'inspection'];

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Text variant="label" tone="slate">HANDOVER PHOTOS</Text>
      {[...handovers].sort((a, z) => order.indexOf(a.kind) - order.indexOf(z.kind)).map((h) => (
        <View key={h.id} style={{ gap: space.xs }}>
          <Text variant="bodyStrong">{title(h)}</Text>
          {h.confirmed_at ? <Text variant="caption" tone="slate">Confirmed {lagosWhen(h.confirmed_at)}</Text> : null}
          {h.problem_note ? <Text variant="caption" tone="red">Problem noted: {h.problem_note}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {h.handover_media.map((m) => (
              <Pressable key={m.id} accessibilityRole="imagebutton" accessibilityLabel={`${SHOT[m.shot] ?? m.shot} ${m.media_type}`}
                onPress={() => urls[m.storage_path] && Linking.openURL(urls[m.storage_path]).catch(() => {})}>
                {m.media_type === 'photo' && urls[m.storage_path] ? (
                  <Image source={{ uri: urls[m.storage_path] }} style={styles.shot} contentFit="cover" />
                ) : (
                  <View style={[styles.shot, styles.center, { backgroundColor: c.raised }]}><Icon name={m.media_type === 'video' ? 'camera' : 'clock'} color={c.slate} /></View>
                )}
                <Text variant="caption" tone="slate">{SHOT[m.shot] ?? m.shot}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
      {ready.map((j) => (
        <View key={j.id} style={{ gap: space.xs }}>
          <Text variant="bodyStrong">{title({ kind: j.kind, party: 'renter' })}</Text>
          <Text variant="caption" tone="slate">{j.error ? 'Waiting for a connection to upload.' : 'Uploading…'} {waitingText(j.media.filter((m) => !m.uploaded).length)}.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {j.media.filter((m) => !m.uploaded).map((m) => (
              <View key={m.id}>
                {m.mediaType === 'photo' ? <Image source={{ uri: m.uri }} style={[styles.shot, { opacity: 0.6 }]} contentFit="cover" />
                  : <View style={[styles.shot, styles.center, { backgroundColor: c.raised }]}><Icon name="camera" color={c.slate} /></View>}
                <Text variant="caption" tone="slate">{SHOT[m.shot] ?? m.shot}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

function IconButton({ icon, label, onPress }: { icon: 'phone' | 'whatsapp'; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} android_ripple={{ color: c.lagoonTint, borderless: true }}
      style={[styles.iconBtn, { backgroundColor: c.lagoonTint }]}>
      <Icon name={icon} color={c.lagoon} />
    </Pressable>
  );
}

function Money({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={[styles.row, { alignItems: 'baseline' }]}>
      <Text variant={strong ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>{label}</Text>
      <Text variant={strong ? 'heading' : 'bodyStrong'}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  now: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  center: { alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: touch, height: touch, borderRadius: touch / 2, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 52, height: 52, borderRadius: radius.md },
  shot: { width: 84, height: 84, borderRadius: radius.md },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
});
