import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { bagDays, getBookingDraft, prefillDays, useBookingDraft } from '@/lib/booking-draft';
import { isOffline } from '@/lib/bookings';
import { CATEGORY_META, displayName, GROUPS } from '@/lib/catalog';
import { naira, rangeLabel } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { usePlan } from '@/lib/plan';
import { rememberReturn } from '@/lib/return-to';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { BagBar } from '@/ui/bag-bar';
import { Button } from '@/ui/button';
import { Badge, Chip } from '@/ui/chip';
import { addDays, DateRangeCalendar, lagosToday, rentalWindow } from '@/ui/date-range';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Field } from '@/ui/layout';
import { Text } from '@/ui/text';

type Item = {
  id: string; name: string; brand: string; model: string; category_key: string; day_rate_kobo: number;
  technician_required: boolean; photos: string[]; units: { count: number }[];
};

type GroupKey = (typeof GROUPS)[number]['key'];
type Days = { first?: string; last?: string };

const HORIZON = 90;

/** Every word typed appears somewhere in the name, brand, model or category ("sony 85", "rode mic"). */
function matches(i: Item, query: string) {
  const hay = `${i.name} ${i.brand} ${i.model} ${CATEGORY_META[i.category_key]?.label ?? ''} ${CATEGORY_META[i.category_key]?.plural ?? ''}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/**
 * The Gear tab: browse and search the public catalogue (RLS: active gear from approved vendors). With
 * "Your days" set, each card says whether it's free on them (0008 free_units).
 */
export default function Explore() {
  const c = useColors();
  const params = useLocalSearchParams<{ group?: string; category?: string }>();
  const { draft: bag } = useBookingDraft();
  const { draft: plan } = usePlan();
  const [items, setItems] = useState<Item[] | null>(null);
  const [group, setGroup] = useState<GroupKey>('all');
  const [query, setQuery] = useState('');
  // Start from the bag's days, else the plan's.
  const [days, setDays] = useState<Days>(() => prefillDays(getBookingDraft(), plan.answers));
  const [picking, setPicking] = useState(false);
  const [free, setFree] = useState<Map<string, number> | null>(null);
  const [freeError, setFreeError] = useState('');
  const [tellUs, setTellUs] = useState(false);
  // Opened from a Plan home shortcut: start on that group.
  // Shared web links (deloo.space category chips) use ?category=<category key or group>.
  useEffect(() => {
    const want = params.group ?? (params.category ? CATEGORY_META[params.category]?.group ?? params.category : undefined);
    if (want && GROUPS.some((g) => g.key === want)) setGroup(want as GroupKey);
  }, [params.group, params.category]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // The bag got days while this tab had none (it stays mounted): use them.
  const bagSpan = bagDays(bag);
  useEffect(() => {
    if (bagSpan && !days.first && !picking) setDays(bagSpan);
  }, [bagSpan?.first, bagSpan?.last]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('items')
      .select('id, name, brand, model, category_key, day_rate_kobo, technician_required, photos, units(count)')
      .eq('active', true).order('category_key').order('day_rate_kobo', { ascending: false });
    if (err) { setError('Check your connection and try again.'); return; }
    // Cameras first (what most people come for), then lenses, light, sound, grip; dearest first in each.
    const rank = (i: Item) => { const g = GROUPS.findIndex((x) => x.key === CATEGORY_META[i.category_key]?.group); return g < 0 ? 99 : g; };
    setError(''); setItems((data as unknown as Item[]).sort((a, b) => rank(a) - rank(b) || b.day_rate_kobo - a.day_rate_kobo));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Free units on the days, counted once the range is picked (not on the first tap of it). A slower
  // answer for older days never overwrites a newer one.
  const [freeTry, setFreeTry] = useState(0);
  const loadFree = useCallback(() => setFreeTry((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    setFree(null); setFreeError('');
    if (picking || !days.first || !days.last) return;
    const w = rentalWindow(days.first, days.last);
    supabase.rpc('free_units', { p_from: w.startsAt, p_to: w.endsAt }).then(({ data, error: err }) => {
      if (!live) return;
      if (err) { setFreeError(isOffline(err) ? 'You’re offline, so we can’t check your days.' : 'Couldn’t check your days.'); return; }
      setFree(new Map(((data as { item_id: string; free: number }[] | null) ?? []).map((r) => [r.item_id, r.free])));
    });
    return () => { live = false; };
  }, [days.first, days.last, picking, freeTry]);

  const q = query.trim();
  const shown = useMemo(
    () => (items ?? []).filter((i) => (group === 'all' || CATEGORY_META[i.category_key]?.group === group) && (!q || matches(i, q))),
    [items, group, q],
  );
  const groupLabel = GROUPS.find((g) => g.key === group)?.label;
  const dated = !!(days.first && days.last);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">Gear</Text>
        <Text tone="slate">{items ? `${items.length} items, delivered across Lagos` : 'Loading…'}</Text>
        <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Icon name="search" size={18} color={c.faint} />
          <TextInput value={query} onChangeText={(t) => { setQuery(t); setTellUs(false); }} placeholder="Search by name, brand or model"
            placeholderTextColor={c.faint} style={[type.body, styles.searchInput, { color: c.ink }]} accessibilityLabel="Search gear"
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search"><Icon name="close" size={18} color={c.slate} /></Pressable>
          ) : null}
        </View>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          <Chip label={dated ? `Your days: ${rangeLabel(days.first!, days.last!)}` : 'Your days'} selected={dated || picking} onPress={() => setPicking(!picking)} />
          <View style={[styles.divider, { backgroundColor: c.line }]} />
          {GROUPS.map((g) => <Chip key={g.key} label={g.label} selected={group === g.key} onPress={() => setGroup(g.key)} />)}
        </ScrollView>
      </View>
      {error && !items ? (
        <EmptyState icon="warning" title="Couldn’t load the gear" body={error} action="Try again" onAction={load} />
      ) : !items ? (
        <View style={[styles.grid, styles.skeletons]}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={styles.skeleton} />)}</View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: space.md }}
          contentContainerStyle={styles.grid}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} colors={[c.lagoon]} onRefresh={async () => { setRefreshing(true); loadFree(); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={picking ? (
            <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Text variant="bodyStrong">When do you need it?</Text>
              <DateRangeCalendar first={days.first} last={days.last} months={3} maxDate={addDays(lagosToday(), HORIZON)}
                onChange={(a, b) => setDays({ first: a, last: b })} />
              <View style={styles.panelButtons}>
                {dated ? <Button kind="quiet" title="Clear" onPress={() => { setDays({}); setPicking(false); }} /> : null}
                <Button title={dated ? 'Show what’s free' : 'Done'} style={{ flex: 1 }} onPress={() => setPicking(false)} />
              </View>
            </View>
          ) : freeError ? (
            <Notice tone="warning" icon="calendar">
              <Text variant="caption">{freeError} <Text variant="caption" tone="lagoon" onPress={loadFree}>Try again</Text></Text>
            </Notice>
          ) : null}
          ListEmptyComponent={q ? (
            <View style={{ gap: space.md, marginTop: space.lg }}>
              <Text tone="slate" style={{ textAlign: 'center' }}>{`Nothing matches “${q}”${group !== 'all' ? ` in ${groupLabel}` : ''}.`}</Text>
              {group !== 'all' ? <Button kind="quiet" title="Search all gear" onPress={() => setGroup('all')} /> : null}
              {tellUs ? <TellUs need={q} group={group} days={days} onPickDays={() => setPicking(true)} />
                : <Button kind="secondary" title="Can’t find it? Tell us" onPress={() => setTellUs(true)} />}
            </View>
          ) : <Text tone="slate" style={{ textAlign: 'center', marginTop: space.xl }}>Nothing in this group right now.</Text>}
          renderItem={({ item }) => <GearCard item={item} days={days} free={free?.get(item.id)} />}
        />
      )}
      <View style={styles.bagBar}><BagBar /></View>
    </SafeAreaView>
  );
}

function GearCard({ item, days, free }: { item: Item; days: Days; free?: number }) {
  const c = useColors();
  const units = item.units[0]?.count ?? 0;
  // The item page opens on the same days.
  const href = days.first && days.last ? `/item/${item.id}?first=${days.first}&last=${days.last}` : `/item/${item.id}`;
  const status = free === undefined ? undefined : free > 0 ? 'Free on your days' : 'Booked on your days';
  return (
    <Pressable onPress={() => router.push(href as `/item/${string}`)} android_ripple={{ color: c.lagoonTint }}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]} accessibilityRole="button"
      accessibilityLabel={`${displayName(item.name)}, ${naira(item.day_rate_kobo)} a day${status ? `, ${status.toLowerCase()}` : ''}`}>
      {item.photos[0] ? (
        // Light backdrop while the photo loads (no glaring blank box in dark mode); product shots are on white.
        <View style={[styles.art, { backgroundColor: c.raised }]}>
          <Image source={{ uri: itemPhotoUrl(item.photos[0]) }} style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]} contentFit="contain" transition={200} />
        </View>
      ) : (
        <View style={[styles.art, { backgroundColor: c.lagoonTint }]}>
          <Icon name={categoryIcon(item.category_key)} size={40} color={c.lagoon} />
        </View>
      )}
      <View style={{ gap: 2, padding: space.md }}>
        <Text variant="label" numberOfLines={2}>{displayName(item.name)}</Text>
        {/* Brand and model only when the name doesn't already say it. */}
        {item.model && !item.name.includes(item.model) ? <Text variant="caption" tone="slate" numberOfLines={1}>{[item.brand, item.model].filter(Boolean).join(' ')}</Text> : null}
        <Text variant="bodyStrong" style={{ marginTop: space.xs }}>{naira(item.day_rate_kobo)}<Text variant="caption" tone="slate"> /day</Text></Text>
        {units > 1 && free === undefined ? <Text variant="caption" tone="slate">{units} in stock</Text> : null}
        {status ? <View style={{ marginTop: space.xs }}><Badge label={status} status={free! > 0 ? 'available' : 'unavailable'} /></View> : null}
      </View>
    </Pressable>
  );
}

/** What each "kind" chip records in unmet_demand.category_key (public.categories keys). */
const KINDS: { key: string; label: string; group: GroupKey }[] = [
  { key: 'camera', label: 'Camera', group: 'camera' },
  { key: 'lens', label: 'Lens', group: 'lens' },
  { key: 'light', label: 'Light', group: 'light' },
  { key: 'mic', label: 'Audio', group: 'audio' },
  { key: 'grip', label: 'Stand or grip', group: 'grip' },
];

/**
 * "Can't find it? Tell us": gear we don't stock goes to unmet_demand (reason not_stocked), the same
 * table the planner fills, so Ops sees one list of what to buy next. Needs 0018 (rows without a plan).
 */
function TellUs({ need: initial, group, days, onPickDays }: { need: string; group: GroupKey; days: Days; onPickDays: () => void }) {
  const c = useColors();
  const { session } = useSession();
  const [need, setNeed] = useState(initial);
  const [kind, setKind] = useState<string | undefined>(KINDS.find((k) => k.group === group)?.key);
  const [when, setWhen] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const dated = !!(days.first && days.last);

  async function send() {
    if (!session) { rememberReturn('/explore'); router.push('/sign-in'); return; }
    if (need.trim().length < 2) { setError('Tell us what you need.'); return; }
    if (!kind) { setError('Pick what kind of gear it is.'); return; }
    setSending(true); setError('');
    const w = dated ? rentalWindow(days.first!, days.last!) : undefined;
    const { error: err } = await supabase.from('unmet_demand').insert({
      category_key: kind, quantity: 1, reason: 'not_stocked', period: w ? `[${w.startsAt},${w.endsAt})` : null,
      spec: { text: need.trim().slice(0, 300), when: w ? undefined : when.trim().slice(0, 120) || undefined, search: initial.slice(0, 120), source: 'gear_search' },
    });
    setSending(false);
    if (err) { setError(isOffline(err) ? 'You’re offline. Connect and try again.' : 'Couldn’t send that. Try again.'); return; }
    setSent(true);
  }

  if (sent) return <Notice tone="tip" icon="check">Thanks. We read every request, and it helps us decide what to stock next.</Notice>;
  return (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Text variant="bodyStrong">Tell us what you need</Text>
      <Field label="What do you need?" value={need} onChangeText={setNeed} placeholder="e.g. Canon C70, or a teleprompter" maxLength={300} />
      <Text variant="label">What kind of gear?</Text>
      <View style={styles.kinds}>
        {KINDS.map((k) => <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />)}
      </View>
      {dated ? (
        <View style={{ gap: 2 }}>
          <Text variant="label">When?</Text>
          <Text variant="caption" tone="slate">{rangeLabel(days.first!, days.last!)} (your days). <Text variant="caption" tone="lagoon" onPress={onPickDays}>Change</Text></Text>
        </View>
      ) : (
        <Field label="When?" value={when} onChangeText={setWhen} placeholder="e.g. Sat 14 Nov, or not sure yet" maxLength={120} />
      )}
      {error ? <Text variant="caption" tone="red">{error}</Text> : null}
      <Button title={session ? 'Send' : 'Sign in to send'} loading={sending} onPress={send} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.xs },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, minHeight: 44 },
  searchInput: { flex: 1, paddingVertical: space.sm },
  chips: { paddingHorizontal: space.xl, paddingVertical: space.lg, gap: space.sm, alignItems: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 24 },
  grid: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },
  card: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', maxWidth: '50%' },
  art: { width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' },
  skeletons: { flexDirection: 'row', flexWrap: 'wrap' },
  skeleton: { width: '47%', aspectRatio: 0.8, borderRadius: radius.lg },
  panel: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  panelButtons: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bagBar: { paddingHorizontal: space.xl, paddingBottom: space.sm },
});
