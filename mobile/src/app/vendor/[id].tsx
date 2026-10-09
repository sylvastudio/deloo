import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { displayName } from '@/lib/catalog';
import { naira } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Badge } from '@/ui/chip';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

type Vendor = { id: string; name: string; vendor_type: string; areas: string[]; offers_delivery: boolean; offers_technician: boolean; approved_at: string | null };
type Item = { id: string; name: string; category_key: string; day_rate_kobo: number };
const KIND: Record<string, string> = { company: 'Rental company', church: 'Church media team', individual: 'Individual owner' };

/** R14 Vendor profile: who they are, what they offer, their gear. */
export default function VendorProfile() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [v, setV] = useState<Vendor | null | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    supabase.from('vendors').select('id, name, vendor_type, areas, offers_delivery, offers_technician, approved_at').eq('id', id).maybeSingle()
      .then(({ data }) => setV((data as Vendor) ?? null));
    supabase.from('items').select('id, name, category_key, day_rate_kobo').eq('vendor_id', id).eq('active', true).order('category_key')
      .then(({ data }) => setItems((data as Item[]) ?? []));
  }, [id]);

  if (v === null) return <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar /><EmptyState icon="info" title="Owner not found" /></SafeAreaView>;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content}>
        {!v ? <Skeleton style={{ height: 120 }} /> : <>
          <View style={styles.head}>
            <View style={[styles.avatar, { backgroundColor: c.lagoon }]}><Text variant="title" style={{ color: c.onLagoon }}>{displayName(v.name)[0]}</Text></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="title">{displayName(v.name)}</Text>
              <Text tone="slate">{KIND[v.vendor_type]}</Text>
            </View>
          </View>
          <View style={styles.badges}>
            {v.approved_at ? <Badge label="Checked by Deloo" status="available" /> : null}
            {v.offers_delivery ? <Badge label="Delivers" /> : null}
            {v.offers_technician ? <Badge label="Sends a technician" /> : null}
            <Badge label="New on Deloo" />
          </View>
          {v.areas.length ? <Text tone="slate">Serves {v.areas.join(', ')}</Text> : null}
          <Text variant="label" tone="slate">THEIR GEAR · {items.length}</Text>
          {items.map((i) => (
            <Pressable key={i.id} onPress={() => router.push(`/item/${i.id}`)} accessibilityRole="button" android_ripple={{ color: c.lagoonTint }}
              style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }]}>
              <View style={[styles.icon, { backgroundColor: c.lagoonTint }]}><Icon name={categoryIcon(i.category_key)} color={c.lagoon} /></View>
              <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{displayName(i.name)}</Text>
              <Text variant="label">{naira(i.day_rate_kobo, true)}</Text>
            </Pressable>
          ))}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
