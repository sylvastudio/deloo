import { router } from 'expo-router';

import { useSession } from '@/lib/session';
import { Badge } from '@/ui/chip';
import { Button } from '@/ui/button';
import { Card, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' });

/** Vendor home: what needs doing today. Requests, pickups and returns arrive with bookings (N4). */
export default function Today() {
  const { vendors } = useSession();
  const vendor = vendors[0];
  return (
    <Screen kicker={DAY.format(new Date())} title={vendor?.name.replace(/\s*\(DEMO\)$/, '') ?? 'Today'}>
      {!vendor?.approved_at ? (
        <Card>
          <Badge label="Waiting for Deloo’s check" status="limited" />
          <Text tone="slate">We check every owner before their gear goes live. We’ll call you to arrange it. You can list your gear now.</Text>
        </Card>
      ) : null}
      <Card>
        <Text variant="heading">Nothing to do today</Text>
        <Text tone="slate">Booking requests, pickups and returns will show here, with what to check at each handover.</Text>
      </Card>
      <Button kind="secondary" title="See your gear" onPress={() => router.navigate('/gear')} />
    </Screen>
  );
}
