import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { TextAction } from './text-action';

/**
 * One photo the renter has to take (ID front, back, selfie): an empty frame with "Take photo", or the
 * photo with "Retake". The web also offers "Choose a photo" for computers without a camera.
 */
export function PhotoSlot({
  label, uri, icon = 'camera', portrait, onTake, disabled,
}: { label: string; uri?: string; icon?: IconName; portrait?: boolean; onTake: (source: 'camera' | 'library') => void; disabled?: boolean }) {
  const c = useColors();
  const frame = [styles.frame, { aspectRatio: portrait ? 3 / 4 : 1.586, borderColor: c.line, backgroundColor: c.raised }];
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{label}</Text>
      {uri ? (
        <Pressable onPress={() => onTake('camera')} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}, taken. Retake`}>
          <Image source={{ uri }} style={frame} contentFit="cover" />
        </Pressable>
      ) : (
        <Pressable onPress={() => onTake('camera')} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Take ${label.toLowerCase()}`}
          style={[frame, styles.empty, { borderStyle: 'dashed' }]}>
          <Icon name={icon} size={28} color={c.slate} />
          <Text variant="caption" tone="slate">Tap to take the photo</Text>
        </Pressable>
      )}
      <View style={styles.actions}>
        <Button kind={uri ? 'secondary' : 'primary'} title={uri ? 'Retake' : 'Take photo'} disabled={disabled} onPress={() => onTake('camera')} style={{ flex: 1 }} />
        {Platform.OS === 'web' ? <TextAction label="Choose a photo" disabled={disabled} onPress={() => onTake('library')} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
});
