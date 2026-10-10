import { StyleSheet, View } from 'react-native';

import { PAY_METHODS, type PayMethod } from '@/lib/bookings';
import { space } from '@/theme/tokens';
import { Chip } from '@/ui/chip';
import { Text } from '@/ui/text';

/** How the renter wants to pay: one chip each, the chosen one's note underneath. USDT is "coming soon". */
export function PayMethods({ value, onChange }: { value: PayMethod; onChange: (m: PayMethod) => void }) {
  const chosen = PAY_METHODS.find((m) => m.key === value) ?? PAY_METHODS[0];
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Payment method">
        {PAY_METHODS.map((m) => (
          <Chip key={m.key} label={m.soon ? `${m.label} · soon` : m.label} selected={value === m.key} onPress={() => onChange(m.key)} />
        ))}
      </View>
      <Text variant="caption" tone={chosen.soon ? 'red' : 'slate'}>
        {chosen.soon ? 'Paying in USDT is coming soon. Pick card, transfer or USSD for now.' : chosen.note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
