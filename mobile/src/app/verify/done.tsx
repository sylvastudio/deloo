import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { safeReturn } from '@/lib/return-to';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';

/**
 * verify/done: sent. "Back to my booking" pops to Review (or wherever the flow started), which reads
 * the gate again on focus, so Pay unlocks.
 */
export default function VerifyDone() {
  const c = useColors();
  const params = useLocalSearchParams<{ return?: string }>();
  const ret = safeReturn(params.return, '/me');
  const toBooking = ret.startsWith('/book') || ret.startsWith('/booking');

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={styles.body}>
        <View style={[styles.mark, { borderColor: c.line, backgroundColor: c.surface }]}>
          <Icon name="check" size={28} color={c.lagoon} />
        </View>
        <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>Sent. Thanks!</Text>
        <Text tone="slate" style={{ textAlign: 'center' }}>
          We usually check within 2 hours (8am to 8pm).{toBooking ? ' You can pay for your booking now.' : ' You can book cameras now. We’ll confirm before your gear leaves us.'}
        </Text>
      </View>
      <View style={styles.footer}>
        <Button title={toBooking ? 'Back to my booking' : 'Done'} onPress={() => router.dismissTo(ret as Href)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.xl },
  mark: { width: 64, height: 64, borderRadius: 32, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.lg, paddingTop: space.md },
});
