import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';

import { control, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon } from './icon';

/**
 * A chat composer in the ChatGPT / Claude mould: a rounded surface that grows with the text, a
 * toolbar underneath (mic on the left, a round send arrow on the right that fills in once there's
 * something to send). On the web, Enter sends and Shift+Enter adds a line.
 */
export function Composer({
  value, onChangeText, onSend, placeholder, sendLabel, onMic, inputRef, autoFocus,
}: {
  value: string; onChangeText: (t: string) => void; onSend: () => void; placeholder: string; sendLabel: string;
  onMic?: () => void; inputRef?: React.Ref<TextInput>; autoFocus?: boolean;
}) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const ready = !!value.trim();

  function onKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>) {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      if (ready) onSend();
    }
  }

  return (
    <View style={[styles.box, { backgroundColor: c.surface, borderColor: focused ? c.slate : c.line }]}>
      <TextInput
        ref={inputRef} value={value} onChangeText={onChangeText} multiline autoFocus={autoFocus}
        placeholder={placeholder} placeholderTextColor={c.faint} accessibilityLabel={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyPress={onKeyPress}
        maxFontSizeMultiplier={2}
        style={[type.body, styles.input, { color: c.ink }, Platform.OS === 'web' && styles.noOutline]}
      />
      <View style={styles.bar}>
        {onMic ? (
          <Pressable
            accessibilityRole="button" accessibilityLabel="Describe it by voice" onPress={onMic} hitSlop={6}
            android_ripple={{ color: c.raised, borderless: true }}
            style={({ pressed }) => [styles.round, { backgroundColor: pressed ? c.raised : 'transparent' }]}>
            <Icon name="mic" size={20} color={c.slate} />
          </Pressable>
        ) : <View />}
        <Pressable
          accessibilityRole="button" accessibilityLabel={sendLabel} accessibilityState={{ disabled: !ready }}
          disabled={!ready} onPress={onSend} hitSlop={6}
          style={({ pressed }) => [styles.round, { backgroundColor: ready ? c.ink : c.raised, opacity: pressed ? 0.8 : 1 }]}>
          <Icon name="send" size={18} color={ready ? c.paper : c.faint} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.xl - 2, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm, minHeight: control.composer },
  input: { minHeight: 48, maxHeight: 180, paddingHorizontal: space.xs, paddingTop: 0, paddingBottom: space.xs, textAlignVertical: 'top' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  noOutline: { outlineStyle: 'none', outlineWidth: 0 } as object,
});
