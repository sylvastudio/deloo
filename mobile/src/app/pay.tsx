import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { getActiveHold } from '@/lib/bookings';
import { useColors } from '@/theme/use-colors';

/**
 * deloo://pay?reference=… lands here: Paystack's return page hands back to the app. Usually the pay
 * screen is already open underneath (the in-app browser caught the link), so just go back to it. If
 * the app was opened cold by the link, go to the pay screen for the hold being paid, which checks it.
 */
export default function PayReturn() {
  const c = useColors();
  const { reference } = useLocalSearchParams<{ reference?: string }>();
  useEffect(() => {
    if (router.canGoBack()) { router.back(); return; }
    const hold = getActiveHold();
    if (hold) router.replace({ pathname: '/book/pay', params: { booking: hold.booking_id, ...(reference ? { reference } : {}) } });
    else router.replace('/bookings');
  }, [reference]);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.paper }}><ActivityIndicator color={c.lagoon} /></View>;
}
