import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { bagCount, useBookingDraft } from '@/lib/booking-draft';
import { dayLabel } from '@/lib/format';
import { rememberReturn } from '@/lib/return-to';
import { useSession } from '@/lib/session';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon } from './icon';
import { Text } from './text';

const WEEKDAY_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Mon 12 – Wed 14" in one month, "Fri 30 Oct – Mon 2 Nov" across two, "Tue 14 Oct" for one day. */
export function bagRange(first: string, last: string) {
  if (first === last) return dayLabel(first);
  if (first.slice(0, 7) !== last.slice(0, 7)) return `${dayLabel(first)} – ${dayLabel(last)}`;
  const f = (ymd: string) => WEEKDAY_DAY.format(new Date(`${ymd}T00:00:00Z`));
  return `${f(first)} – ${f(last)}`;
}

/**
 * The bag, always one tap from Review: "3 items · Mon 12 – Wed 14 · Review". Shown on the Gear tab and
 * the item page while the bag has gear. Signed out (web), Review is behind sign-in, so it goes there first.
 */
export function BagBar() {
  const c = useColors();
  const { draft } = useBookingDraft();
  const { session } = useSession();
  const n = bagCount(draft);
  if (!draft || n === 0) return null;
  const days = draft.first && draft.last ? bagRange(draft.first, draft.last) : 'Choose days';
  const label = `${n} ${n === 1 ? 'item' : 'items'} · ${days}`;

  function open() {
    if (!session) { rememberReturn('/book/review'); router.push('/sign-in'); return; }
    router.push('/book/review');
  }

  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Your bag: ${label}. Review`}
      style={({ pressed }) => [styles.bar, { backgroundColor: c.ink, opacity: pressed ? 0.9 : 1 }]}>
      <Icon name="calendar" size={18} color={c.paper} />
      <Text variant="label" numberOfLines={1} style={{ flex: 1, color: c.paper }}>{label}</Text>
      <View style={styles.cta}>
        <Text variant="label" style={{ color: c.paper }}>Review</Text>
        <Icon name="chevron" size={16} color={c.paper} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.pill },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
