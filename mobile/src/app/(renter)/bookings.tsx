import { router } from 'expo-router';

import { Button } from '@/ui/button';
import { Card, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

// Booking trackers arrive in N4 (docs/native-app-plan.md §4.4).
export default function Bookings() {
  return (
    <Screen title="Bookings">
      <Card>
        <Text variant="heading">No bookings yet</Text>
        <Text tone="slate">When you book a setup, you’ll follow it here: confirmed, on the way, set up, collected, deposit back.</Text>
      </Card>
      <Button kind="secondary" title="Plan an event" onPress={() => router.navigate('/')} />
    </Screen>
  );
}
