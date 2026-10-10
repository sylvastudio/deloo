import { Tabs } from 'expo-router';

import { fonts } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon, type IconName } from '@/ui/icon';

/**
 * Web build of the vendor tabs (JS bottom tabs instead of NativeTabs). The web app forces renter
 * mode (session.tsx), so this is only here so the route tree builds the same on every platform.
 */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'today', title: 'Today', icon: 'today' },
  { name: 'calendar', title: 'Calendar', icon: 'calendar' },
  { name: 'gear', title: 'Gear', icon: 'camera' },
  { name: 'earnings', title: 'Earnings', icon: 'money' },
  { name: 'account', title: 'Me', icon: 'person' },
];

export default function VendorTabsWeb() {
  const c = useColors();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
      tabBarActiveTintColor: c.lagoon, tabBarInactiveTintColor: c.slate,
      tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
    }}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color, size }) => <Icon name={t.icon} color={color as string} size={size} /> }} />
      ))}
    </Tabs>
  );
}
