import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORY_META, displayName, GROUPS } from '@/lib/catalog';
import { naira } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Chip } from '@/ui/chip';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Text } from '@/ui/text';

type Item = {
  id: string; name: string; brand: string; model: string; category_key: string; day_rate_kobo: number;
  technician_required: boolean; photos: string[]; units: { count: number }[];
};

type GroupKey = (typeof GROUPS)[number]['key'];

/** Browse the public catalogue (RLS: active gear from approved vendors). */
export default function Explore() {
  const c = useColors();
  const params = useLocalSearchParams<{ group?: string; category?: string }>();
  const [items, setItems] = useState<Item[] | null>(null);
  const [group, setGroup] = useState<GroupKey>('all');
  // Opened from a Plan home shortcut: start on that group.
  // Shared web links (deloo.space category chips) use ?category=<category key or group>.
  useEffect(() => {
    const want = params.group ?? (params.category ? CATEGORY_META[params.category]?.group ?? params.category : undefined);
    if (want && GROUPS.some((g) => g.key === want)) setGroup(want as GroupKey);
  }, [params.group, params.category]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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

  const shown = useMemo(
    () => (items ?? []).filter((i) => group === 'all' || CATEGORY_META[i.category_key]?.group === group),
    [items, group],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">Explore gear</Text>
        <Text tone="slate">{items ? `${items.length} items, delivered across Lagos` : 'Loading…'}</Text>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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
          refreshControl={<RefreshControl refreshing={refreshing} colors={[c.lagoon]} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<Text tone="slate" style={{ textAlign: 'center', marginTop: space.xl }}>Nothing in this group right now.</Text>}
          renderItem={({ item }) => <GearCard item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function GearCard({ item }: { item: Item }) {
  const c = useColors();
  const units = item.units[0]?.count ?? 0;
  return (
    <Pressable onPress={() => router.push(`/item/${item.id}`)} android_ripple={{ color: c.lagoonTint }}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]} accessibilityRole="button" accessibilityLabel={`${displayName(item.name)}, ${naira(item.day_rate_kobo)} a day`}>
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
        {units > 1 ? <Text variant="caption" tone="slate">{units} in stock</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.xs },
  chips: { paddingHorizontal: space.xl, paddingVertical: space.lg, gap: space.sm },
  grid: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },
  card: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', maxWidth: '50%' },
  art: { width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' },
  skeletons: { flexDirection: 'row', flexWrap: 'wrap' },
  skeleton: { width: '47%', aspectRatio: 0.8, borderRadius: radius.lg },
});
