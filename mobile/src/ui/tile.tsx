import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Text } from './text';

/** A big tappable answer card: one choice in a question, a mode, an event type. */
export function Tile({
  title, description, emoji, selected, onPress, multi,
}: { title: string; description?: string; emoji?: string; selected?: boolean; onPress: () => void; multi?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: !!selected }}
      android_ripple={{ color: c.lagoonTint }}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: selected ? c.lagoonTint : c.surface, borderColor: selected ? c.lagoon : c.line },
        pressed && !selected && { backgroundColor: c.raised },
      ]}>
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <View style={styles.copy}>
        <Text variant="bodyStrong">{title}</Text>
        {description ? <Text variant="caption" tone="slate">{description}</Text> : null}
      </View>
      <View style={[styles.mark, { borderColor: selected ? c.lagoon : c.line, backgroundColor: selected ? c.lagoon : 'transparent', borderRadius: multi ? 6 : 12 }]}>
        {selected ? <Text style={{ color: c.onLagoon, fontSize: 13, lineHeight: 16 }}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, overflow: 'hidden', minHeight: 72 },
  emoji: { fontSize: 28, lineHeight: 34 },
  copy: { flex: 1, gap: 2 },
  mark: { width: 24, height: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
