import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type TextInputProps, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {header}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.content]}>{header}{children}</View>
        )}
        {footer ? <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.paper }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const c = useColors();
  return <View {...rest} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, style]} />;
}

export function Field({ label, hint, error, ref, ...rest }: TextInputProps & { label: string; hint?: string; error?: string; ref?: React.Ref<TextInput> }) {
  const c = useColors();
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={c.faint}
        {...rest}
        style={[type.body, styles.input, { color: c.ink, backgroundColor: c.surface, borderColor: error ? c.red : c.line }, rest.style]}
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
  content: { padding: space.xl, paddingTop: space.lg, gap: space.lg, flexGrow: 1 },
  header: { gap: space.sm, marginBottom: space.sm },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  input: { minHeight: 54, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.lg },
});
