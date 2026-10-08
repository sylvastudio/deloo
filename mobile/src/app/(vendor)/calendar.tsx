import { Card, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

// N3: month view per item, long-press and drag to block dates, presets like "every Sunday morning".
export default function Calendar() {
  return (
    <Screen title="Calendar">
      <Card>
        <Text variant="heading">Your availability</Text>
        <Text tone="slate">Soon you’ll see each item’s bookings here and block the days you need it, like Sunday service.</Text>
      </Card>
    </Screen>
  );
}
