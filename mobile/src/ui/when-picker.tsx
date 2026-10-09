import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { space } from '@/theme/tokens';
import { Chip } from './chip';
import { Notice } from './feedback';
import { Text } from './text';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const TIMES = [6, 7, 8, 9, 10, 12, 14, 15, 16, 17, 18, 19];
const DURATIONS = [[4, '4 hours'], [8, '8 hours'], [12, '12 hours'], [24, 'Full day'], [48, '2 days'], [72, '3 days']] as const;

/** Lagos is UTC+1 all year (no daylight saving), so local dates map to a fixed offset. */
function lagosDate(daysFromToday: number) {
  const now = new Date(Date.now() + 60 * 60 * 1000); // shift to Lagos wall-clock
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromToday));
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
const iso = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00+01:00`;
const label = (h: number) => (h === 12 ? '12 noon' : h < 12 ? `${h}am` : `${h - 12}pm`);

/**
 * R3g: day chips for the next five weeks, a start time (setup included) and how long they need the gear.
 * No calendar widget: on a small phone, chips are faster and need no extra package.
 */
export function WhenPicker({ startsAt, endsAt, onChange }: { startsAt?: string; endsAt?: string; onChange: (startsAt: string, endsAt: string) => void }) {
  const days = useMemo(() => Array.from({ length: 35 }, (_, i) => lagosDate(i + 1)), []);
  const [date, setDate] = useState(startsAt?.slice(0, 10));
  const [hour, setHour] = useState(startsAt ? Number(startsAt.slice(11, 13)) : undefined);
  const [hours, setHours] = useState(startsAt && endsAt ? Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 3.6e6) : undefined);

  function emit(d = date, h = hour, len = hours) {
    if (!d || h === undefined || !len) return;
    const start = iso(d, h);
    onChange(start, new Date(Date.parse(start) + len * 3.6e6).toISOString());
  }
  const short = date && (Date.parse(`${date}T00:00:00+01:00`) - Date.now()) < 36 * 3.6e6;

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Text variant="label">Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {days.map((d) => (
            <Chip key={d} label={DAY.format(new Date(`${d}T12:00:00+01:00`))} selected={date === d} onPress={() => { setDate(d); emit(d); }} />
          ))}
        </ScrollView>
      </View>
      <View style={{ gap: space.sm }}>
        <Text variant="label">Setup starts</Text>
        <View style={styles.wrap}>
          {TIMES.map((h) => <Chip key={h} label={label(h)} selected={hour === h} onPress={() => { setHour(h); emit(date, h); }} />)}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Text variant="label">You need the gear for</Text>
        <View style={styles.wrap}>
          {DURATIONS.map(([h, l]) => <Chip key={h} label={l} selected={hours === h} onPress={() => { setHours(h); emit(date, hour, h); }} />)}
        </View>
      </View>
      {short ? <Notice tone="warning">Short notice: fewer owners can confirm in time. We’ll show what can.</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingRight: space.xl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
