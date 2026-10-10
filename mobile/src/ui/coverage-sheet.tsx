import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';

const SECTIONS: { title: string; icon: IconName; tone: 'green' | 'red' | 'ink'; lines: string[] }[] = [
  { title: 'Covered', icon: 'check', tone: 'green', lines: ['Accidental damage during your rental: a drop, a knock, a fault that isn’t from misuse.'] },
  {
    title: 'Not covered', icon: 'close', tone: 'red',
    lines: ['Careless loss, like leaving it in a taxi', 'Theft without a police report', 'Water damage', 'Missing accessories: batteries, chargers, caps, cables'],
  },
  { title: 'What you pay', icon: 'money', tone: 'ink', lines: ['Protection pays most of the repair or replacement cost of accidental damage, up to a limit.', 'We show you before-and-after photos and you can reply before anything is charged.'] },
  {
    title: 'How claims work', icon: 'camera', tone: 'ink',
    lines: ['If gear is stolen, report it to the police and send us the report.', 'Careless loss, or theft without a police report, is charged at the gear’s replacement value.'],
  },
];

/** "What's covered": Deloo Protection in plain words, as a bottom sheet. */
export function CoverageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const colour = { green: c.greenInk, red: c.red, ink: c.ink };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.wrap}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: c.paper, paddingBottom: space.lg + insets.bottom }]} accessibilityViewIsModal>
          <View style={[styles.grabber, { backgroundColor: c.line }]} />
          <ScrollView contentContainerStyle={{ gap: space.lg }}>
            <View style={{ gap: space.xs }}>
              <Text variant="heading" accessibilityRole="header">What’s covered</Text>
              <Text variant="caption" tone="slate">Deloo Protection (damage cover) is part of every booking: 10–20% of the rental, depending on the gear (cameras 20%, lenses and lights 15%, audio and stands 10%).</Text>
            </View>
            {SECTIONS.map((s) => (
              <View key={s.title} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
                <View style={styles.row}>
                  <Icon name={s.icon} size={18} color={colour[s.tone]} />
                  <Text variant="bodyStrong" style={{ color: colour[s.tone] }}>{s.title}</Text>
                </View>
                {s.lines.map((l) => <Text key={l} variant="caption">{s.lines.length > 1 && s.title === 'Not covered' ? `• ${l}` : l}</Text>)}
              </View>
            ))}
          </ScrollView>
          <Button title="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** A tappable "What’s covered" line that opens the sheet. Drop it anywhere a price mentions Protection. */
export function WhatsCovered({ label = 'What’s covered?' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
        <Text variant="label" tone="lagoon">{label}</Text>
      </Pressable>
      <CoverageSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: '#00000066' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.xl, paddingTop: space.sm, gap: space.lg },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: space.xs },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
