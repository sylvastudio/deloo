import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Text } from './text';

/** Good · Better · Best, and any other 2–4 way switch. */
export function Segmented<T extends string>({
  options, value, onChange, label,
}: { options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.track, { backgroundColor: c.raised }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }}
            onPress={() => { if (!on) { Haptics.selectionAsync().catch(() => {}); onChange(o.value); } }}
            style={[styles.option, on && { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }]}>
            <Text variant="label" tone={on ? 'ink' : 'slate'}>{o.label}</Text>
            {o.hint ? <Text variant="caption" tone={on ? 'lagoon' : 'faint'}>{o.hint}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm, borderRadius: radius.md - 4, minHeight: 48 },
});
