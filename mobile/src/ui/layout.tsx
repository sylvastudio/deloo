import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type TextInputProps, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGutter } from '@/theme/gutter';
import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Text } from './text';

/**
 * A full screen with a large title, scrolling content and an optional footer pinned above the
 * keyboard (for the main action). Tabs add their own bottom inset.
 */
export function Screen({
  title, kicker, subtitle, children, footer, scroll = true, edges = ['top'],
}: {
  title?: string; kicker?: string; subtitle?: string; children?: React.ReactNode; footer?: React.ReactNode;
  scroll?: boolean; edges?: ('top' | 'bottom')[];
}) {
  const c = useColors();
  const gutter = useGutter();
  const pad = { paddingHorizontal: gutter };
  const header = (title || kicker) ? (
    <View style={styles.header}>
      {kicker ? <Text variant="label" tone="lagoon">{kicker}</Text> : null}
      {title ? <Text variant="title" accessibilityRole="header">{title}</Text> : null}
      {subtitle ? <Text tone="slate">{subtitle}</Text> : null}
    </View>
  ) : null;
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: c.paper }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={[styles.content, pad]} keyboardShouldPersistTaps="handled">
            {header}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.content, pad]}>{header}{children}</View>
        )}
        {footer ? <View style={[styles.footer, pad, { borderTopColor: c.line, backgroundColor: c.paper }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const c = useColors();
  return <View {...rest} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, style]} />;
}

/** Labelled text input. The border turns lagoon while focused (red when there's an error). */
export function Field({ label, hint, error, ref, onFocus, onBlur, ...rest }: TextInputProps & { label: string; hint?: string; error?: string; ref?: React.Ref<TextInput> }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={c.faint}
        maxFontSizeMultiplier={2}
        accessibilityLabel={rest.accessibilityLabel ?? label}
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          type.body, styles.input,
          { color: c.ink, backgroundColor: c.surface, borderColor: error ? c.red : focused ? c.lagoon : c.line },
          Platform.OS === 'web' && styles.noOutline, // the lagoon border is the focus ring
          rest.style,
        ]}
      />
      {error ? <Text variant="caption" tone="red">{error}</Text> : hint ? <Text variant="caption" tone="slate">{hint}</Text> : null}
    </View>
  );
}

export function Gap({ size = space.lg }: { size?: number }) {
  return <View style={{ height: size }} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingTop: space.lg, paddingBottom: space.xl, gap: space.lg, flexGrow: 1 },
  header: { gap: space.sm, marginBottom: space.sm },
  footer: { paddingTop: space.md, paddingBottom: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  input: { minHeight: 54, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.lg },
  noOutline: { outlineStyle: 'none', outlineWidth: 0 } as object,
});
