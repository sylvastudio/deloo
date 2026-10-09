import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { displayName } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

type Unit = { id: string };
type Item = { id: string; name: string; category_key: string; units: Unit[] };
type Res = { id: string; unit_id: string; booking_id: string | null; period: string; note: string };

const DAYS = 14;
const WD = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow', timeZone: 'Africa/Lagos' });
const DD = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'Africa/Lagos' });
const LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

/** Lagos midnight for day i from today (UTC+1, no daylight saving). */
function dayStart(i: number) {
  const now = new Date(Date.now() + 3.6e6);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i) - 3.6e6);
}
/** Parses a Postgres tstzrange like ["2026-10-11 05:00:00+00","2026-10-11 14:00:00+00"). */
function bounds(period: string): [number, number] {
  const m = period.match(/^[[(]"?([^",]+)"?,"?([^")]+)"?[\])]$/);
  // Postgres writes "+00"; ISO needs "+00:00" (Hermes won't parse the short form).
  const iso = (t: string) => t.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  return m ? [Date.parse(iso(m[1])), Date.parse(iso(m[2]))] : [0, 0];
}

/**
 * V3 Calendar with V4 block dates: each item across the next two weeks. Tap a free day to block it for
 * your own use (all units), tap a blocked day to free it. Booked days can't be blocked.
 */
export default function Calendar() {
  const c = useColors();
  const { vendors } = useSession();
  const vendor = vendors[0];
  const [items, setItems] = useState<Item[] | null>(null);
  const [res, setRes] = useState<Res[]>([]);
  const [error, setError] = useState('');
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => dayStart(i)), []);

  const load = useCallback(async () => {
    if (!vendor) return;
    const { data: its } = await supabase.from('items').select('id, name, category_key, units(id)').eq('vendor_id', vendor.id).order('category_key');
    const list = (its ?? []) as Item[];
    const unitIds = list.flatMap((i) => i.units.map((u) => u.id));
    const { data: rs } = unitIds.length
      ? await supabase.from('reservations').select('id, unit_id, booking_id, period, note').eq('live', true).in('unit_id', unitIds)
      : { data: [] };
    setItems(list); setRes((rs ?? []) as Res[]);
  }, [vendor]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function state(item: Item, day: Date) {
    const from = day.getTime(), to = from + 864e5;
    const units = new Set(item.units.map((u) => u.id));
    const hits = res.filter((r) => units.has(r.unit_id)).filter((r) => { const [a, b] = bounds(r.period); return a < to && b > from; });
    const booked = hits.some((r) => r.booking_id);
    const blockedUnits = new Set(hits.filter((r) => !r.booking_id).map((r) => r.unit_id));
    return { booked, blocked: blockedUnits.size > 0, allBlocked: blockedUnits.size >= item.units.length && item.units.length > 0, hits };
  }

  async function toggle(item: Item, day: Date) {
    setError('');
    const s = state(item, day);
    if (s.booked) return setError(`${displayName(item.name)} is booked on ${LONG.format(day)}. Open the booking from Today to change it.`);
    Haptics.selectionAsync();
    if (s.blocked) {
      const ids = s.hits.filter((r) => !r.booking_id).map((r) => r.id);
      const { error: e } = await supabase.from('reservations').delete().in('id', ids);
      if (e) setError('Couldn’t free that day. Try again.');
    } else {
      const from = day.toISOString(), to = new Date(day.getTime() + 864e5).toISOString();
      const { error: e } = await supabase.from('reservations').insert(item.units.map((u) => ({ unit_id: u.id, period: `[${from},${to})`, note: 'Blocked by owner' })));
      if (e) setError(e.message.includes('overlap') ? 'Part of that day is already taken.' : 'Couldn’t block that day. Try again.');
    }
    load();
  }

  return (
    <Screen title="Calendar" subtitle="Tap a day to block it for your own use. Renters won’t see it as free.">
      {error ? <Notice tone="problem">{error}</Notice> : null}
      {!items ? <><Skeleton style={{ height: 64 }} /><Skeleton style={{ height: 64 }} /></> : items.length === 0 ? (
        <EmptyState icon="calendar" title="No gear yet" body="Add an item and its calendar shows here." action="Add gear" onAction={() => router.push('/add-gear')} />
      ) : <>
        <View style={styles.legend}>
          <Legend color={c.surface} border={c.line} label="Free" />
          <Legend color={c.lagoon} label="Booked" />
          <Legend color={c.marigold} label="Blocked by you" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ gap: space.md }}>
            <View style={styles.row}>
              <View style={styles.label} />
              {days.map((d) => (
                <View key={d.toISOString()} style={styles.dayHead}>
                  <Text variant="caption" tone="slate">{WD.format(d)}</Text>
                  <Text variant="label">{DD.format(d)}</Text>
                </View>
              ))}
            </View>
            {items.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.label}>
                  <Icon name={categoryIcon(item.category_key)} size={18} color={c.lagoon} />
                  <Text variant="caption" numberOfLines={2} style={{ flex: 1 }}>{displayName(item.name)}</Text>
                </View>
                {days.map((d) => {
                  const s = state(item, d);
                  const bg = s.booked ? c.lagoon : s.allBlocked ? c.marigold : s.blocked ? c.marigoldTint : c.surface;
                  return (
                    <Pressable key={d.toISOString()} onPress={() => toggle(item, d)} hitSlop={2}
                      accessibilityRole="button" accessibilityLabel={`${displayName(item.name)}, ${LONG.format(d)}, ${s.booked ? 'booked' : s.blocked ? 'blocked' : 'free'}`}
                      style={[styles.cell, { backgroundColor: bg, borderColor: c.line }]} />
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </>}
    </Screen>
  );
}

function Legend({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color, borderWidth: border ? 1 : 0, borderColor: border }} />
      <Text variant="caption" tone="slate">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { width: 120, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: space.sm },
  dayHead: { width: 36, alignItems: 'center' },
  cell: { width: 36, height: 40, borderRadius: radius.sm, borderWidth: 1 },
});
