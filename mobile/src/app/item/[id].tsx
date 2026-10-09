import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORY_META, displayName } from '@/lib/catalog';
import { naira } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { usePlan } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/chip';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

type Item = {
  id: string; name: string; brand: string; model: string; description: string; category_key: string; specs: Record<string, unknown>;
  day_rate_kobo: number; deposit_kobo: number; risk_tier: number; technician_required: boolean; photos: string[];
  vendors: { id: string; name: string; vendor_type: string; areas: string[]; offers_delivery: boolean } | null; units: { count: number }[];
};

/** Big figures for the specs that matter, e.g. "1,300 W · 15″ · Powered". */
function figures(specs: Record<string, unknown>): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const n = (k: string) => (typeof specs[k] === 'number' ? (specs[k] as number) : undefined);
  if (n('watts')) out.push({ value: `${n('watts')!.toLocaleString('en-NG')} W`, label: 'Power' });
  if (n('size_in')) out.push({ value: `${n('size_in')}″`, label: 'Size' });
  if (n('width_ft') && n('height_ft')) out.push({ value: `${n('width_ft')}×${n('height_ft')} ft`, label: 'Screen' });
  if (n('lumens')) out.push({ value: `${n('lumens')!.toLocaleString('en-NG')}`, label: 'Lumens' });
  if (n('channels')) out.push({ value: `${n('channels')}`, label: 'Channels' });
  if (n('kva')) out.push({ value: `${n('kva')} kVA`, label: 'Capacity' });
  if (n('inputs')) out.push({ value: `${n('inputs')}`, label: 'Camera inputs' });
  if (specs.outdoor === true) out.push({ value: 'Outdoor', label: 'Rated' });
  if (specs.wireless === true) out.push({ value: 'Wireless', label: 'Type' });
  return out.slice(0, 3);
}
const TIER_NOTE = ['', 'Needs an ID check to book.', 'Needs ID and address checks, plus a deposit or guarantor.', 'Always comes with the owner’s technician.'];

/** R13 Item detail. */
export default function ItemDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { draft } = usePlan();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [free, setFree] = useState<number | null>(null);
  const starts = typeof draft.answers.startsAt === 'string' && draft.answers.startsAt !== 'unsure' ? draft.answers.startsAt : undefined;
  const ends = typeof draft.answers.endsAt === 'string' && draft.answers.endsAt !== 'unsure' ? draft.answers.endsAt : undefined;

  useEffect(() => {
    supabase.from('items').select('id, name, brand, model, description, category_key, specs, day_rate_kobo, deposit_kobo, risk_tier, technician_required, photos, vendors(id, name, vendor_type, areas, offers_delivery), units(count)')
      .eq('id', id).maybeSingle().then(({ data }) => setItem((data as unknown as Item) ?? null));
    if (starts && ends) {
      supabase.rpc('free_units', { p_from: starts, p_to: ends }).then(({ data }) => {
        const row = (data as { item_id: string; free: number }[] | null)?.find((r) => r.item_id === id);
        setFree(row ? row.free : 0);
      });
    }
  }, [id, starts, ends]);

  if (item === null) return <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar /><EmptyState icon="info" title="This listing isn’t available" body="The owner may have taken it down." /></SafeAreaView>;
  const units = item?.units[0]?.count ?? 0;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content}>
        {!item ? <><Skeleton style={{ height: 220 }} /><Skeleton style={{ height: 28, width: '70%' }} /><Skeleton style={{ height: 80 }} /></> : <>
          {item.photos[0] ? (
            <Image source={{ uri: itemPhotoUrl(item.photos[0]) }} style={styles.photo} contentFit="cover" transition={150} accessibilityLabel={displayName(item.name)} />
          ) : (
            <View style={[styles.photo, styles.art, { backgroundColor: c.lagoonTint }]}><Icon name={categoryIcon(item.category_key)} size={72} color={c.lagoon} /></View>
          )}
          <View style={{ gap: space.xs }}>
            <Text variant="caption" tone="lagoon">{CATEGORY_META[item.category_key]?.label}</Text>
            <Text variant="title">{displayName(item.name)}</Text>
            <Text tone="slate">{[item.brand, item.model].filter(Boolean).join(' ')}</Text>
          </View>
          {figures(item.specs).length ? (
            <View style={styles.figures}>
              {figures(item.specs).map((f) => (
                <View key={f.label} style={[styles.figure, { backgroundColor: c.surface, borderColor: c.line }]}>
                  <Text variant="heading">{f.value}</Text>
                  <Text variant="caption" tone="slate">{f.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.priceRow}>
            <Text variant="number">{naira(item.day_rate_kobo)}</Text><Text tone="slate"> a day</Text>
          </View>
          <Text variant="caption" tone="slate">Refundable deposit {naira(item.deposit_kobo)} · {units} {units === 1 ? 'unit' : 'units'} listed</Text>
          {free !== null ? (
            <Badge label={free === 0 ? 'Not free on your date' : free === 1 ? '1 free on your date' : `${free} free on your date`} status={free === 0 ? 'unavailable' : free <= 1 ? 'limited' : 'available'} />
          ) : null}
          {item.description ? <Text>{item.description}</Text> : null}
          <Notice tone="tip" icon="shield">{TIER_NOTE[item.risk_tier] ?? TIER_NOTE[1]}</Notice>

          {item.vendors ? (
            <Pressable onPress={() => router.push(`/vendor/${item.vendors!.id}`)} accessibilityRole="button" android_ripple={{ color: c.lagoonTint }}
              style={[styles.vendor, { backgroundColor: c.surface, borderColor: c.line }]}>
              <View style={[styles.avatar, { backgroundColor: c.lagoon }]}><Text style={{ color: c.onLagoon, fontSize: 18 }}>{displayName(item.vendors.name)[0]}</Text></View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text variant="bodyStrong">{displayName(item.vendors.name)}</Text><Icon name="shield" size={16} color={c.green} /></View>
                <Text variant="caption" tone="slate">{item.vendors.areas.slice(0, 3).join(', ')}{item.vendors.offers_delivery ? ' · Delivers' : ''}</Text>
              </View>
              <Icon name="chevron" color={c.slate} />
            </Pressable>
          ) : null}
        </>}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line }]}>
        <Button title="Plan an event with this" onPress={() => router.navigate('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.xl },
  art: { alignItems: 'center', justifyContent: 'center' },
  figures: { flexDirection: 'row', gap: space.sm },
  figure: { flex: 1, padding: space.md, borderRadius: radius.md, borderWidth: 1, gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  vendor: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
