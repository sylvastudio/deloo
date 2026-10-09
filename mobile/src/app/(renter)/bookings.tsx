import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listDemoBookings, STEPS, type DemoBooking } from '@/lib/demo-bookings';
import { naira } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Badge } from '@/ui/chip';
import { EmptyState } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

/** R19 Bookings list. Real bookings join the list in the pilot (N4). */
export default function Bookings() {
  const c = useColors();
  const [list, setList] = useState<DemoBooking[]>([]);
  useFocusEffect(useCallback(() => { setList(listDemoBookings()); }, []));

  return (
    <Screen title="Bookings">
      {list.length === 0 ? (
        <EmptyState icon="calendar" title="No bookings yet" body="When you book a setup, you’ll follow it here: confirmed, on the way, set up, returned, deposit back."
          action="Plan an event" onAction={() => router.navigate('/')} />
      ) : list.map((b) => (
        <Pressable key={b.id} onPress={() => router.push(`/booking/${b.id}`)} accessibilityRole="button" android_ripple={{ color: c.lagoonTint }}
          style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1}>{b.title}</Text>
            <Text variant="caption" tone="slate">{b.startsAt ? DAY.format(new Date(b.startsAt)) : 'Date to confirm'} · {naira(b.totalKobo, true)}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <Badge label={STEPS[b.step]} status={b.step === 0 ? 'limited' : 'available'} />
              <Badge label="Demo" />
            </View>
          </View>
          <Icon name="chevron" color={c.slate} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
});
