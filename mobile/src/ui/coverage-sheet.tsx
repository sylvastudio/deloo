import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';

/** The most a renter pays, as a share of the item's replacement value (founder, 26 Oct 2026). */
export const DAMAGE_CAP = 0.1;
export const DAMAGE_MIN_KOBO = 1_500_000;
export const ROBBERY_SHARE = 0.3;

const SECTIONS: { title: string; icon?: IconName; tone: 'green' | 'red' | 'ink'; lines: string[] }[] = [
  {
    title: 'Accidental damage', icon: 'check', tone: 'green',
    lines: ['A drop, a knock, a fault that isn’t from misuse.', 'You pay the repair cost, but never more than 10% of the item’s value (at least ₦15,000). For a ₦4.9m camera, that’s ₦490,000 at most.'],
  },
  {
    title: 'Robbery or burglary', icon: 'shield', tone: 'ink',
    lines: ['Report it to the police within 24 hours and send us the report.', 'You pay 30% of the item’s value. This applies to verified renters, once in 12 months.'],
  },
  {
    title: 'You pay the full value', icon: 'close', tone: 'red',
    lines: ['Theft with no police report', 'Careless loss, like leaving it in a taxi', 'Gear that isn’t returned', 'Water damage or misuse'],
  },
  { title: 'Missing accessories', tone: 'ink', lines: ['Batteries, chargers, caps and cables are charged at their own price.'] },
  { title: 'Before anything is charged', tone: 'ink', lines: ['We show you the before-and-after photos and you can reply first.'] },
];

/** The most a renter pays if one unit is damaged by accident: 10% of its value, at least ₦15,000. */
export function damageCapKobo(valueKobo: number) {
  return Math.max(DAMAGE_MIN_KOBO, Math.round(valueKobo * DAMAGE_CAP));
}

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
            {SECTIONS.map((s, i) => (
              <View key={s.title} style={[styles.section, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: space.lg }]}>
                <View style={styles.row}>
                  {s.icon ? <Icon name={s.icon} size={18} color={colour[s.tone]} /> : null}
                  <Text variant="bodyStrong" style={{ color: colour[s.tone] }}>{s.title}</Text>
                </View>
                {s.lines.map((l) => <Text key={l} variant="caption">{s.tone === 'red' ? `• ${l}` : l}</Text>)}
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
  section: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
