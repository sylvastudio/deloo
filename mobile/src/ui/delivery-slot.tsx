import { StyleSheet, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';
import { Chip } from './chip';
import { Text } from './text';

/**
 * Delivery window, chosen on Review. Stored on bookings.delivery_slot as the time ("8–11am"), the same
 * way staff write it in the admin portal, and saved with set_booking_slot (migration 0017) right after
 * the hold is made.
 */
export type DeliverySlot = '8–11am' | '12–3pm' | '4–7pm';
export const DELIVERY_SLOTS: { value: DeliverySlot; name: string; hours: [number, number] }[] = [
  { value: '8–11am', name: 'Morning', hours: [8, 11] },
  { value: '12–3pm', name: 'Afternoon', hours: [12, 15] },
  { value: '4–7pm', name: 'Evening', hours: [16, 19] },
];
export const DEFAULT_SLOT: DeliverySlot = '8–11am';

export const isDeliverySlot = (v: unknown): v is DeliverySlot => DELIVERY_SLOTS.some((s) => s.value === v);

/** "in the morning (8–11am)" for the app's windows; anything staff typed is shown as is. */
export function slotPhrase(slot: string | null | undefined): string {
  const s = (slot ?? '').trim();
  const known = DELIVERY_SLOTS.find((x) => x.value === s);
  return known ? `in the ${known.name.toLowerCase()} (${s})` : s;
}

/** Start and end hour (Lagos) of a slot, when it's one of ours. */
export const slotHours = (slot: string | null | undefined) => DELIVERY_SLOTS.find((x) => x.value === (slot ?? '').trim())?.hours ?? null;

/** Save the renter's window on their own booking (hold or confirmed only). Throws a plain message. */
export async function saveDeliverySlot(bookingId: string, slot: DeliverySlot): Promise<void> {
  const { error } = await supabase.rpc('set_booking_slot', { p_booking: bookingId, p_slot: slot });
  if (error) throw error;
}

/** Morning · Afternoon · Evening chips with the hint underneath. */
export function DeliverySlotPicker({ value, onChange, pickup, disabled }: {
  value: DeliverySlot; onChange: (s: DeliverySlot) => void; pickup?: boolean; disabled?: boolean;
}) {
  return (
    <View style={{ gap: space.sm, opacity: disabled ? 0.6 : 1 }} pointerEvents={disabled ? 'none' : 'auto'}>
      <Text variant="label">{pickup ? 'When will you pick it up?' : 'When should we deliver?'}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {DELIVERY_SLOTS.map((s) => (
          <Chip key={s.value} label={`${s.name} ${s.value}`} selected={value === s.value} onPress={disabled ? undefined : () => onChange(s.value)} />
        ))}
      </View>
      <Text variant="caption" tone="slate">
        {pickup
          ? 'Come any time in that window and bring a valid ID. Return it the morning after your last day.'
          : 'The rider calls before coming. Collection is the morning after your last day.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
