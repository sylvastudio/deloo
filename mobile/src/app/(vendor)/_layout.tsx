import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useColors } from '@/theme/use-colors';

/** Vendor mode: like Airbnb's hosting tabs. Five is Android's maximum. */
export default function VendorTabs() {
  const c = useColors();
  return (
    <NativeTabs backgroundColor={c.surface} tintColor={c.lagoon} indicatorColor={c.lagoonTint} labelStyle={{ color: c.slate }}>
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max" md="today" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="gear">
        <NativeTabs.Trigger.Label>Gear</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="speaker.wave.2" md="speaker" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="earnings">
        <NativeTabs.Trigger.Label>Earnings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="banknote" md="payments" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
