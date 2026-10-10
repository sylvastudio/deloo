import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { getActiveHold, verifyPayment } from '@/lib/bookings';
import { useColors } from '@/theme/use-colors';

/**
 * Paystack hands back here. Native: deloo://pay?reference=… from the return page. Web: Paystack
 * sends the whole tab to app.deloo.space/pay?trxref=…&reference=… (init with return_to: 'web').
 *
 * Usually the pay screen is already open underneath (the in-app browser caught the link), so just go
 * back to it. Otherwise (the app opened cold, or the web page reloaded) go to the pay screen for the
 * hold being paid, which verifies and shows paid or pending. Always `replace`, so the browser's Back
 * button can't land here again and reopen checkout. With no hold on this device (another browser),
 * verify anyway so the server confirms the booking, then show the bookings list.
 */
export default function PayReturn() {
  const c = useColors();
  const params = useLocalSearchParams<{ reference?: string; trxref?: string }>();
  const reference = params.reference ?? params.trxref;
  useEffect(() => {
    if (Platform.OS !== 'web' && router.canGoBack()) { router.back(); return; }
    const hold = getActiveHold();
    if (hold) { router.replace({ pathname: '/book/pay', params: { booking: hold.booking_id, ...(reference ? { reference } : {}) } }); return; }
    if (!reference) { router.replace('/bookings'); return; }
    verifyPayment(reference).catch(() => null).finally(() => router.replace('/bookings'));
  }, [reference]);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.paper }}><ActivityIndicator color={c.lagoon} /></View>;
}
