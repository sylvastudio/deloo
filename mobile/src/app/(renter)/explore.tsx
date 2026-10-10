import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORY_META, displayName, GROUPS } from '@/lib/catalog';
import { naira } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Badge, Chip } from '@/ui/chip';
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
    if (err) setError('Couldn’t load gear. Pull down to try again.');
    else { setError(''); setItems(data as unknown as Item[]); }
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
      {!items && !error ? <ActivityIndicator style={{ marginTop: space.xxl }} color={c.lagoon} /> : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: space.md }}
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={refreshing} colors={[c.lagoon]} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<Text tone="slate" style={{ textAlign: 'center', marginTop: space.xl }}>{error || 'Nothing listed here yet.'}</Text>}
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
        <Image source={{ uri: itemPhotoUrl(item.photos[0]) }} style={[styles.art, { backgroundColor: '#fff' }]} contentFit="contain" transition={150} />
      ) : (
        <View style={[styles.art, { backgroundColor: c.lagoonTint }]}>
          <Icon name={categoryIcon(item.category_key)} size={40} color={c.lagoon} />
        </View>
      )}
      <View style={{ gap: 2, padding: space.md }}>
        <Text variant="label" numberOfLines={2}>{displayName(item.name)}</Text>
        <Text variant="caption" tone="slate" numberOfLines={1}>{[item.brand, item.model].filter(Boolean).join(' ')}</Text>
        <Text variant="bodyStrong" style={{ marginTop: space.xs }}>{naira(item.day_rate_kobo)}<Text variant="caption" tone="slate"> /day</Text></Text>
        {units > 1 ? <Text variant="caption" tone="faint">{units} available</Text> : null}
        {item.technician_required ? <View style={{ marginTop: space.xs }}><Badge label="Technician included" /></View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.xs },
  chips: { paddingHorizontal: space.xl, paddingVertical: space.lg, gap: space.sm },
  grid: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },
  card: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', maxWidth: '50%' },
  art: { height: 120, width: '100%', alignItems: 'center', justifyContent: 'center' },
});
