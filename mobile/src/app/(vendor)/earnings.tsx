import { naira } from '@/lib/format';
import { Card, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

// N4: payouts after each return checklist, deposits held, commission shown per booking.
export default function Earnings() {
  return (
    <Screen title="Earnings">
      <Card>
        <Text variant="label" tone="slate">Paid out this month</Text>
        <Text variant="number">{naira(0)}</Text>
        <Text variant="caption" tone="slate">You’re paid after each return is checked. Deloo’s commission is shown on every booking.</Text>
      </Card>
    </Screen>
  );
}
