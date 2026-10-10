import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon } from './icon';
import { Text } from './text';

/** Lagos is UTC+1 all year (no daylight saving), so a Lagos day is a fixed UTC window. */
export function lagosToday(): string {
  return new Date(Date.now() + 3.6e6).toISOString().slice(0, 10);
}
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** A whole-day rental window: from midnight on the first day to midnight after the last (Lagos). */
export function rentalWindow(first: string, last: string): { startsAt: string; endsAt: string } {
  return { startsAt: `${first}T00:00:00+01:00`, endsAt: `${addDays(last, 1)}T00:00:00+01:00` };
}
/** The first and last rental day of a window made by `rentalWindow`. */
export function windowDays(startsAt?: string, endsAt?: string): { first?: string; last?: string } {
  if (!startsAt || !endsAt) return {};
  const lagos = (iso: string, shiftMs = 0) => new Date(Date.parse(iso) + 3.6e6 - shiftMs).toISOString().slice(0, 10);
  return { first: lagos(startsAt), last: lagos(endsAt, 1) };
}
export const dayCount = (first: string, last: string) => Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 864e5) + 1;

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Month calendar for choosing rental days: tap the first day, then the last. Days before `minDate`
 * and days in `unavailable` (YYYY-MM-DD, e.g. the item is booked) can't be picked, and a range can't
 * cross an unavailable day. `limited` days show a dot (some units left). Days after `maxDate` (beyond
 * what availability was checked for) can't be picked either.
 */
export function DateRangeCalendar({ first, last, onChange, unavailable, limited, minDate = addDays(lagosToday(), 1), maxDate, months = 3 }: {
  first?: string; last?: string; onChange: (first: string, last: string) => void;
  unavailable?: Set<string>; limited?: Set<string>; minDate?: string; maxDate?: string; months?: number;
}) {
  const c = useColors();
  const [month, setMonth] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const start = minDate.slice(0, 8) + '01';
  const monthStart = useMemo(() => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + month);
    return d.toISOString().slice(0, 10);
  }, [start, month]);
  const cells = useMemo(() => {
    const d = new Date(`${monthStart}T00:00:00Z`);
    const lead = (d.getUTCDay() + 6) % 7; // Monday first
    const inMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: inMonth }, (_, i) => addDays(monthStart, i))] as (string | null)[];
  }, [monthStart]);

  const lo = picking ?? first;
  const hi = picking ? undefined : last;
  const blocked = (d: string) => d < minDate || (!!maxDate && d > maxDate) || !!unavailable?.has(d);
  /** A range is only valid if no day inside it is unavailable. */
  const clear = (a: string, b: string) => { for (let d = a; d <= b; d = addDays(d, 1)) if (blocked(d)) return false; return true; };

  function tap(d: string) {
    Haptics.selectionAsync().catch(() => {});
    if (picking && d >= picking && clear(picking, d)) { setPicking(null); onChange(picking, d); return; }
    setPicking(d);
    onChange(d, d);
  }

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.head}>
        <Pressable onPress={() => setMonth(month - 1)} disabled={month === 0} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous month" style={{ opacity: month === 0 ? 0.3 : 1 }}>
          <Icon name="back" />
        </Pressable>
        <Text variant="heading">{MONTH.format(new Date(`${monthStart}T00:00:00Z`))}</Text>
        <Pressable onPress={() => setMonth(month + 1)} disabled={month >= months - 1} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next month" style={{ opacity: month >= months - 1 ? 0.3 : 1 }}>
          <Icon name="chevron" />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEK.map((w, i) => <Text key={i} variant="caption" tone="faint" style={styles.week}>{w}</Text>)}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.cell} />;
          const off = blocked(d);
          const inRange = !!lo && d >= lo && d <= (hi ?? lo);
          const edge = d === lo || d === hi;
          return (
            <Pressable key={d} disabled={off} onPress={() => tap(d)} style={styles.cell}
              accessibilityRole="button" accessibilityState={{ disabled: off, selected: inRange }}
              accessibilityLabel={`${d}${unavailable?.has(d) ? ', booked' : limited?.has(d) ? ', few left' : ''}`}>
              <View style={[styles.day, inRange && { backgroundColor: edge ? c.lagoon : c.lagoonTint }]}>
                <Text variant="label" style={{ color: edge ? c.onLagoon : off ? c.faint : c.ink, textDecorationLine: unavailable?.has(d) ? 'line-through' : 'none' }}>
                  {Number(d.slice(8))}
                </Text>
                {limited?.has(d) && !off ? <View style={[styles.dot, { backgroundColor: edge ? c.onLagoon : c.marigold }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" tone="slate">{picking ? 'Now tap the last day you need it (or the same day for one day).' : 'Tap your first day, then your last.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { width: `${100 / 7}%`, textAlign: 'center', paddingBottom: space.xs },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: { flex: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', bottom: 6, width: 5, height: 5, borderRadius: 3 },
});
