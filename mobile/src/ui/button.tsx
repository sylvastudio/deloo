import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { radius, space, touch, type } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Text } from './text';

type Kind = 'primary' | 'accent' | 'secondary' | 'quiet';

export function Button({
  title, kind = 'primary', loading, disabled, onPress, icon, style, ...rest
}: Omit<PressableProps, 'children'> & { title: string; kind?: Kind; loading?: boolean; icon?: React.ReactNode }) {
  const c = useColors();
  const bg = { primary: c.lagoon, accent: c.marigold, secondary: c.surface, quiet: 'transparent' }[kind];
  const fg = { primary: c.onLagoon, accent: c.onMarigold, secondary: c.ink, quiet: c.lagoon }[kind];
  const off = disabled || loading;
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      android_ripple={{ color: kind === 'primary' ? '#ffffff33' : kind === 'accent' ? '#00000022' : c.lagoonTint }}
      onPress={(e) => { Haptics.selectionAsync().catch(() => {}); onPress?.(e); }}
      style={(state) => [
        styles.base,
        { backgroundColor: bg, opacity: off ? 0.5 : state.pressed ? 0.88 : 1 },
        kind === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line },
        typeof style === 'function' ? style(state) : style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={styles.row}>
          {icon}
          <Text style={[type.bodyStrong, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: touch + 6, borderRadius: radius.pill, paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
