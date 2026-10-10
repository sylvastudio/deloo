import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon, type IconName } from './icon';
import { Text } from './text';

type Tone = 'lagoon' | 'slate' | 'red';

/**
 * An inline text link that is a real button: "Why?", "Swap", "Remove", "Change", "Try again".
 * 44dp tall with 2dp hit slop above and below, so the target reaches 48dp without taking a 48dp row.
 * Use `caption` size only inside a caption-sized sentence; standalone actions stay at `label`.
 */
export function TextAction({
  label, onPress, tone = 'lagoon', size = 'label', icon, disabled, accessibilityLabel, accessibilityHint, expanded, style,
}: {
  label: string; onPress: () => void; tone?: Tone; size?: 'label' | 'caption'; icon?: IconName; disabled?: boolean;
  accessibilityLabel?: string; accessibilityHint?: string; expanded?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const color = c[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...(expanded === undefined ? null : { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 2, bottom: 2, left: space.xs, right: space.xs }}
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }, style]}>
      <View style={styles.row}>
        {icon ? <Icon name={icon} size={size === 'caption' ? 16 : 18} color={color} /> : null}
        <Text variant={size} style={[{ color }, size === 'caption' && styles.medium]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  medium: { fontFamily: fonts.bodyMedium },
});
