import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { setBookingDraft } from '@/lib/booking-draft';
import { checkFree, isOffline, itemCalendar, plain, type CalendarDay } from '@/lib/bookings';
import { CATEGORY_META, displayName } from '@/lib/catalog';
import { dayLabel, daysText, naira, rangeLabel } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { rememberReturn } from '@/lib/return-to';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/chip';
import { addDays, dayCount, DateRangeCalendar, lagosToday } from '@/ui/date-range';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Stepper } from '@/ui/stepper';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

type Item = {
  id: string; name: string; brand: string; model: string; description: string; category_key: string; specs: Record<string, unknown>;
  day_rate_kobo: number; deposit_kobo: number; photos: string[]; in_the_box: string[] | null; units: { count: number }[];
};

/** Big figures for the specs that matter, e.g. "Full frame · E mount · 4K". */
function figures(specs: Record<string, unknown>): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const s = (k: string) => (typeof specs[k] === 'string' && specs[k] ? (specs[k] as string) : undefined);
  const n = (k: string) => (typeof specs[k] === 'number' ? (specs[k] as number) : undefined);
  if (s('sensor')) out.push({ value: s('sensor')!, label: 'Sensor' });
  if (s('mount')) out.push({ value: s('mount')!, label: 'Mount' });
  if (s('resolution') || s('max_video')) out.push({ value: (s('resolution') ?? s('max_video'))!, label: 'Video' });
  if (s('focal')) out.push({ value: s('focal')!, label: 'Focal length' });
  if (n('watts')) out.push({ value: `${n('watts')!.toLocaleString('en-NG')} W`, label: 'Power' });
  if (n('channels')) out.push({ value: `${n('channels')}`, label: 'Channels' });
  if (n('payload_kg')) out.push({ value: `${n('payload_kg')} kg`, label: 'Payload' });
  if (specs.wireless === true) out.push({ value: 'Wireless', label: 'Type' });
  if (specs.battery === true) out.push({ value: 'Battery', label: 'Power' });
  return out.slice(0, 3);
}

const HORIZON = 90;

/** R-12 Item detail with R-13 choose dates inline: availability calendar, quantity, then Book. */
export default function ItemDetail() {
  const c = useColors();
  // first/last come back in the link after signing in, so the chosen days aren't lost.
  const { id, first: firstParam, last: lastParam } = useLocalSearchParams<{ id: string; first?: string; last?: string }>();
  const { session } = useSession();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [itemError, setItemError] = useState('');
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [calError, setCalError] = useState<'offline' | 'error' | null>(null);
  const [qty, setQty] = useState(1);
  const [first, setFirst] = useState<string | undefined>(firstParam);
  const [last, setLast] = useState<string | undefined>(lastParam);
  const [checking, setChecking] = useState(false);
  const [bookError, setBookError] = useState('');
  const [resumeId, setResumeId] = useState<string>();
  // "Choose days" scrolls to the calendar (it's below the photos and specs).
  const scroller = useRef<ScrollView>(null);
  const daysY = useRef(0);

  const loadItem = useCallback(async () => {
    setItemError('');
    const { data, error } = await supabase.from('items')
      .select('id, name, brand, model, description, category_key, specs, day_rate_kobo, deposit_kobo, photos, in_the_box, units(count)')
      .eq('id', id).eq('active', true).maybeSingle();
    if (error) { setItemError(isOffline(error) ? 'You’re offline. Connect to see this item.' : 'Couldn’t load this item.'); return; }
    setItem((data as unknown as Item) ?? null);
  }, [id]);

  const loadCalendar = useCallback(async () => {
    setCalError(null);
    const today = lagosToday();
    try { setDays(await itemCalendar(id, addDays(today, 1), addDays(today, HORIZON))); } catch (e) { setCalError(isOffline(e) ? 'offline' : 'error'); }
  }, [id]);

  useEffect(() => { loadItem(); loadCalendar(); }, [loadItem, loadCalendar]);

  const total = days?.[0]?.total ?? item?.units[0]?.count ?? 0;
  // A day is unavailable when fewer units are free than the renter wants; "limited" when some are booked.
  const { unavailable, limited, freeOn } = useMemo(() => {
    const u = new Set<string>(), l = new Set<string>(), f = new Map<string, number>();
    for (const d of days ?? []) {
      f.set(d.day, d.free);
      if (d.free < qty) u.add(d.day);
      else if (d.free < d.total) l.add(d.day);
    }
    return { unavailable: u, limited: l, freeOn: f };
  }, [days, qty]);

  // A range that no longer fits the chosen quantity is cleared.
  useEffect(() => {
    if (!first || !last) return;
    for (let d = first; d <= last; d = addDays(d, 1)) if (unavailable.has(d)) { setFirst(undefined); setLast(undefined); return; }
  }, [unavailable, first, last]);

  const nextFree = useMemo(() => (days ?? []).find((d) => d.free >= qty)?.day, [days, qty]);
  const fewest = first && last ? Math.min(...Array.from({ length: dayCount(first, last) }, (_, i) => freeOn.get(addDays(first, i)) ?? 0)) : undefined;

  if (item === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar fallback="/explore" />
        <EmptyState icon="info" title="This item isn’t available" body="We may have retired it. Have a look at what else we have." action="Explore gear" onAction={() => router.replace('/explore')} />
      </SafeAreaView>
    );
  }

  async function book() {
    if (!item || !first || !last) return;
    const lines = [{ itemId: item.id, name: displayName(item.name), qty }];
    // Web, signed out (browsing from a shared link): straight to sign-in, then straight to Review with
    // these days and this quantity (Review checks availability live when it opens).
    if (!session) {
      setBookingDraft({ lines, first, last, from: { kind: 'item', itemId: item.id } });
      rememberReturn('/book/review');
      router.push('/sign-in');
      return;
    }
    // The calendar may be minutes old: ask the server again so Review never opens on gear that's gone.
    setChecking(true); setBookError(''); setResumeId(undefined);
    try {
      const r = await checkFree(lines, first, last);
      if (!r.ok) { setBookError(r.message); setResumeId(r.resumeBookingId); loadCalendar(); return; }
    } catch (e) {
      setBookError(isOffline(e) ? 'You’re offline. Connect to check these days.' : plain(e, 'Couldn’t check these days. Try again.'));
      return;
    } finally { setChecking(false); }
    setBookingDraft({ lines, first, last, from: { kind: 'item', itemId: item.id } });
    router.push('/book/review');
  }

  const n = first && last ? dayCount(first, last) : 0;
  const inBox = (item?.in_the_box ?? []).filter(Boolean);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar fallback="/explore" />
      <ScrollView ref={scroller} contentContainerStyle={styles.content}>
        {itemError ? (
          <EmptyState icon="warning" title="Couldn’t load this item" body={itemError} action="Try again" onAction={loadItem} />
        ) : !item ? (
          <><Skeleton style={{ height: 220 }} /><Skeleton style={{ height: 28, width: '70%' }} /><Skeleton style={{ height: 80 }} /></>
        ) : <>
          {item.photos[0] ? (
            <Image source={{ uri: itemPhotoUrl(item.photos[0]) }} style={[styles.photo, { backgroundColor: '#fff' }]} contentFit="contain" transition={150} accessibilityLabel={displayName(item.name)} />
          ) : (
            <View style={[styles.photo, styles.art, { backgroundColor: c.lagoonTint }]}><Icon name={categoryIcon(item.category_key)} size={72} color={c.lagoon} /></View>
          )}
          {item.photos.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {item.photos.slice(1).map((p) => <Image key={p} source={{ uri: itemPhotoUrl(p) }} style={[styles.thumb, { backgroundColor: '#fff' }]} contentFit="contain" />)}
            </ScrollView>
          ) : null}

          <View style={{ gap: space.xs }}>
            <Text variant="caption" tone="lagoon">{CATEGORY_META[item.category_key]?.label}</Text>
            <Text variant="title">{displayName(item.name)}</Text>
            {[item.brand, item.model].filter(Boolean).length ? <Text tone="slate">{[item.brand, item.model].filter(Boolean).join(' ')}</Text> : null}
          </View>

          <View style={styles.priceRow}>
            <Text variant="number">{naira(item.day_rate_kobo)}</Text><Text tone="slate"> a day</Text>
          </View>
          <Text variant="caption" tone="slate">Refundable deposit {naira(item.deposit_kobo)}{total > 1 ? ` each · ${total} in stock` : ''}. Back after we check the gear.</Text>

          {figures(item.specs).length ? (
            <View style={styles.figures}>
              {figures(item.specs).map((f) => (
                <View key={f.label} style={[styles.figure, { backgroundColor: c.surface, borderColor: c.line }]}>
                  <Text variant="bodyStrong" numberOfLines={1}>{f.value}</Text>
                  <Text variant="caption" tone="slate">{f.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {item.description ? <Text>{item.description}</Text> : null}

          {inBox.length ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Text variant="bodyStrong">What’s in the box</Text>
              {inBox.map((x) => (
                <View key={x} style={styles.boxRow}><Icon name="check" size={16} color={c.green} /><Text variant="caption" style={{ flex: 1 }}>{x}</Text></View>
              ))}
            </View>
          ) : null}
          <Notice tone="tip" icon="shield">From Deloo’s own kit. We check it, charge it and photograph it before it leaves.</Notice>

          <View style={{ gap: space.md, marginTop: space.sm }} onLayout={(e) => { daysY.current = e.nativeEvent.layout.y; }}>
            <Text variant="heading" accessibilityRole="header">Choose your days</Text>
            {total > 1 ? (
              <View style={styles.qtyRow}>
                <Text style={{ flex: 1 }}>How many?</Text>
                <Stepper value={qty} min={1} max={total} onChange={(v) => { setQty(v); setBookError(''); }} label="units" />
              </View>
            ) : null}
            {calError === 'offline' ? (
              <Notice tone="warning" icon="calendar">
                <Text variant="caption">You’re offline. Days must be checked live. <Text variant="caption" tone="lagoon" onPress={loadCalendar}>Try again</Text></Text>
              </Notice>
            ) : calError ? (
              <Notice tone="problem"><Text variant="caption" tone="red">Couldn’t load the calendar. <Text variant="caption" tone="lagoon" onPress={loadCalendar}>Try again</Text></Text></Notice>
            ) : !days ? (
              <Skeleton style={{ height: 300 }} />
            ) : total === 0 ? (
              <Notice tone="warning">None in stock right now. Check back soon or message us on WhatsApp.</Notice>
            ) : <>
              {nextFree && nextFree !== addDays(lagosToday(), 1) && !first ? (
                <Notice tone="tip" icon="calendar">{`Booked for the next few days. Free from ${dayLabel(nextFree)}.`}</Notice>
              ) : !nextFree ? <Notice tone="warning">{`Fully booked for the next ${HORIZON} days.`}</Notice> : null}
              <DateRangeCalendar
                first={first} last={last} unavailable={unavailable} limited={limited} months={4} maxDate={addDays(lagosToday(), HORIZON)}
                onChange={(a, b) => { setFirst(a); setLast(b); setBookError(''); }}
              />
              <View style={styles.legend}>
                <Legend dot={c.marigold} label="Few left" />
                <Text variant="caption" tone="faint" style={{ textDecorationLine: 'line-through' }}>12</Text><Text variant="caption" tone="slate">Booked</Text>
              </View>
              <Text variant="caption" tone="slate">We deliver from 8am on your first day and collect the morning after your last. Bookings start from tomorrow.</Text>
            </>}
          </View>
        </>}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.paper }]}>
        {item && n ? (
          <View style={{ gap: 2 }}>
            <Text variant="bodyStrong">{rangeLabel(first!, last!)} · {daysText(n)}{qty > 1 ? ` · ${qty} units` : ''}</Text>
            <Text variant="caption" tone="slate">
              {daysText(n)} × {naira(item.day_rate_kobo)}{qty > 1 ? ` × ${qty}` : ''} = {naira(item.day_rate_kobo * n * qty)} rental. Fees and deposit on the next step.
            </Text>
            {fewest !== undefined && fewest <= qty && total > 1 ? <Badge label={fewest === 1 ? 'Last one on these days' : `Only ${fewest} free on these days`} status="limited" /> : null}
          </View>
        ) : (
          <Text variant="caption" tone="slate">{item ? 'Pick your first and last day to see the price.' : ' '}</Text>
        )}
        {bookError ? (
          <Text variant="caption" tone="red">
            {bookError}
            {resumeId ? <Text variant="caption" tone="lagoon" onPress={() => router.push({ pathname: '/book/pay', params: { booking: resumeId } })}> Resume payment →</Text>
              : nextFree ? ` Free from ${dayLabel(nextFree)}, or pick days that aren’t crossed out.` : null}
          </Text>
        ) : null}
        <Button title={n ? 'Book' : 'Choose days'} loading={checking} disabled={!item || !!calError}
          onPress={n ? book : () => scroller.current?.scrollTo({ y: Math.max(0, daysY.current - 16), animated: true })} />
      </View>
    </SafeAreaView>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} /><Text variant="caption" tone="slate">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.xl },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  art: { alignItems: 'center', justifyContent: 'center' },
  figures: { flexDirection: 'row', gap: space.sm },
  figure: { flex: 1, padding: space.md, borderRadius: radius.md, borderWidth: 1, gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  boxRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
