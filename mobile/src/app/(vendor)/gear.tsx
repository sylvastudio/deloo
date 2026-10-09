import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { displayName } from '@/lib/catalog';
import { naira } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Badge } from '@/ui/chip';
import { categoryIcon, Icon } from '@/ui/icon';
import { Text } from '@/ui/text';

type Row = { id: string; name: string; category_key: string; day_rate_kobo: number; active: boolean; risk_tier: number; units: { count: number }[] };

/** The vendor's listings. Adding gear (snap a photo → AI suggests the model) arrives in N3. */
export default function Gear() {
  const c = useColors();
  const { vendors } = useSession();
  const vendor = vendors[0];
  const [rows, setRows] = useState<Row[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!vendor) return;
    const { data } = await supabase.from('items').select('id, name, category_key, day_rate_kobo, active, risk_tier, units(count)')
      .eq('vendor_id', vendor.id).order('category_key');
    setRows((data ?? []) as unknown as Row[]);
  }, [vendor]);
  useEffect(() => { load(); }, [load]);

  const totalUnits = (rows ?? []).reduce((n, r) => n + (r.units[0]?.count ?? 0), 0);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
      {!rows ? <ActivityIndicator style={{ marginTop: space.xxxl }} color={c.lagoon} /> : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} colors={[c.lagoon]} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text variant="title" accessibilityRole="header">Your gear</Text>
              <Text tone="slate">{rows.length} listings · {totalUnits} units</Text>
            </View>
          }
          ListEmptyComponent={<Text tone="slate">No gear listed yet. Adding gear from a photo is coming next.</Text>}
          renderItem={({ item }) => {
            const units = item.units[0]?.count ?? 0;
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }]}>
                <View style={[styles.icon, { backgroundColor: c.lagoonTint }]}><Icon name={categoryIcon(item.category_key)} size={24} color={c.lagoon} /></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{displayName(item.name)}</Text>
                  <Text variant="caption" tone="slate">{units} {units === 1 ? 'unit' : 'units'} · {naira(item.day_rate_kobo)}/day</Text>
                </View>
                {!item.active ? <Badge label="Hidden" /> : item.risk_tier === 3 ? <Badge label="Tier 3" status="limited" /> : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.xl, gap: space.sm },
  header: { gap: space.xs, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
