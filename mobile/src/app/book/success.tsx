import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDemoBooking } from '@/lib/demo-bookings';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/chip';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';

const TIME = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });

/** R18 Success: what happens next, with a time. */
export default function Success() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const b = id ? getDemoBooking(id) : undefined;
  const owners = b?.parts.length ?? 1;
  const by = TIME.format(new Date(Date.now() + 2 * 3.6e6)).toLowerCase();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Animated.View entering={ZoomIn.springify().reduceMotion(ReduceMotion.System)} style={[styles.badge, { backgroundColor: c.lagoon }]}>
          <Icon name="check" size={44} color={c.onLagoon} />
        </Animated.View>
        <Text variant="title" style={{ textAlign: 'center' }}>Request sent 🎉</Text>
        <Text tone="slate" style={{ textAlign: 'center' }}>
          {owners === 1 ? 'The owner has' : `${owners} owners have`} until {by} to confirm. Your money is safe with Deloo until they do. If anyone can’t, we find a replacement or refund you.
        </Text>
        <Badge label="Demo booking" status="limited" />
      </View>
      <View style={styles.footer}>
        <Button title="Track booking" onPress={() => router.replace(`/booking/${id}`)} />
        <Button kind="quiet" title="Back to Plan" onPress={() => router.dismissTo('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingHorizontal: space.xxl },
  badge: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: space.xl, gap: space.sm },
});
