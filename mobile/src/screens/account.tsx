import { StyleSheet, View } from 'react-native';

import { useSession } from '@/lib/session';
import { space } from '@/theme/tokens';
import { Badge } from '@/ui/chip';
import { Button } from '@/ui/button';
import { Card, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

const TRUST = [
  ['Small gear', 'Mics, small speakers, lights'],
  ['Sound and cameras', 'Full sound systems, projectors, cameras'],
  ['LED walls and production', 'High-value gear, always with a technician'],
] as const;

/** "Me" in both modes: profile, verification tiers, mode switch, sign out. */
export function AccountScreen() {
  const { profile, vendors, mode, setMode, signOut, session } = useSession();
  const vendor = vendors[0];
  return (
    <Screen title={profile?.full_name ?? 'Me'} subtitle={session?.user.email}>
      {vendor ? (
        <Card>
          <Text variant="label" tone="slate">{mode === 'renter' ? 'You also rent out gear' : 'You also rent gear for events'}</Text>
          <Button
            title={mode === 'renter' ? `Switch to ${vendor.name.replace(/\s*\(DEMO\)$/, '')}` : 'Switch to renting'}
            onPress={() => setMode(mode === 'renter' ? 'vendor' : 'renter')}
          />
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">Verification</Text>
        <Text variant="caption" tone="slate">Higher-value gear needs more checks. We’ll ask only when your booking needs it.</Text>
        <View style={styles.tiers}>
          {TRUST.map(([title, desc], i) => {
            const unlocked = (profile?.trust_level ?? 0) > i;
            return (
              <View key={title} style={styles.tier}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{title}</Text>
                  <Text variant="caption" tone="slate">{desc}</Text>
                </View>
                <Badge label={unlocked ? 'Verified' : 'Not yet'} status={unlocked ? 'available' : 'neutral'} />
              </View>
            );
          })}
        </View>
      </Card>

      {vendor ? (
        <Card>
          <Text variant="heading">{vendor.name}</Text>
          <Badge label={vendor.approved_at ? 'Approved: visible to renters' : 'Waiting for Deloo’s check'} status={vendor.approved_at ? 'available' : 'limited'} />
        </Card>
      ) : null}

      <Button kind="quiet" title="Sign out" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiers: { gap: space.md, marginTop: space.sm },
  tier: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
