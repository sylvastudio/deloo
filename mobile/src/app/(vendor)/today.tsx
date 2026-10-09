import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { displayName } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/chip';
import { EmptyState } from '@/ui/feedback';
import { Card, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import { CheckpointTracker } from '@/ui/tracker';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' });

/** V1 Today, with V17 approval status as a checklist until Deloo approves the owner. */
export default function Today() {
  const { vendors } = useSession();
  const vendor = vendors[0];
  const [items, setItems] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    if (!vendor) return;
    supabase.from('items').select('id', { count: 'exact', head: true }).eq('vendor_id', vendor.id).then(({ count }) => setItems(count ?? 0));
  }, [vendor]));

  const approved = !!vendor?.approved_at;
  const listed = (items ?? 0) > 0;

  return (
    <Screen kicker={DAY.format(new Date())} title={vendor ? displayName(vendor.name) : 'Today'}>
      {!approved ? (
        <Card>
          <View style={styles.head}><Text variant="heading" style={{ flex: 1 }}>Getting you approved</Text><Badge label="In progress" status="limited" /></View>
          <Text variant="caption" tone="slate">Renters see your gear once Deloo has checked you. Most owners are approved within 2 days.</Text>
          <CheckpointTracker steps={[
            { label: 'Your details', state: 'done' },
            { label: 'List your first item', detail: listed ? undefined : 'A photo is enough to start.', state: listed ? 'done' : 'current' },
            { label: 'A quick call from Deloo', detail: 'We confirm who you are and see your gear (photos or a visit).', state: listed ? 'current' : 'next' },
            { label: 'Add your payout account', detail: 'Coming soon in the app.', state: 'next' },
          ]} />
          {!listed ? <Button title="Add your first item" onPress={() => router.push('/add-gear')} /> : null}
        </Card>
      ) : null}
      <EmptyState icon="calendar" title="Nothing to do today"
        body="Booking requests, pickups and returns will show here, with what to check at each handover." />
      {listed ? <Button kind="secondary" title="See your gear" onPress={() => router.navigate('/gear')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
