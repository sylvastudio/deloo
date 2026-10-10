import { Redirect, router, Tabs, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Pressable } from 'react-native';

import { startHandoverSync } from '@/lib/handover';
import { rememberReturn } from '@/lib/return-to';
import { useSession } from '@/lib/session';
import { fonts } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Icon, type IconName } from '@/ui/icon';
import { Text } from '@/ui/text';

/**
 * Web build of the renter tabs (_layout.tsx uses NativeTabs, which has no proper web bar): the JS
 * bottom tab bar from expo-router, same four tabs. Signed out (the web lets people browse gear from a
 * shared link), only Explore shows, with a Sign in button; the other tabs go to Welcome.
 */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Plan', icon: 'sparkles' },
  { name: 'explore', title: 'Explore', icon: 'search' },
  { name: 'bookings', title: 'Bookings', icon: 'calendar' },
  { name: 'me', title: 'Me', icon: 'person' },
];

export default function RenterTabsWeb() {
  const c = useColors();
  const { session } = useSession();
  const segments = useSegments();
  const signedIn = !!session;
  useEffect(() => (signedIn ? startHandoverSync() : undefined), [signedIn]);

  const tab = segments[segments.length - 1] as string | undefined;
  if (!signedIn && tab !== 'explore') {
    if (tab && tab !== '(renter)' && tab !== 'index') rememberReturn(`/${tab}`);
    return <Redirect href="/welcome" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: !signedIn,
        headerTitle: () => <Text variant="bodyStrong">Deloo</Text>,
        headerStyle: { backgroundColor: c.paper },
        headerShadowVisible: false,
        headerRight: () => (
          <Pressable accessibilityRole="button" onPress={() => router.push('/welcome')} hitSlop={8} style={{ paddingHorizontal: 16 }}>
            <Text variant="label" tone="lagoon">Sign in</Text>
          </Pressable>
        ),
        tabBarStyle: signedIn ? { backgroundColor: c.surface, borderTopColor: c.line } : { display: 'none' },
        tabBarActiveTintColor: c.lagoon,
        tabBarInactiveTintColor: c.slate,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color, size }) => <Icon name={t.icon} color={color as string} size={size} /> }} />
      ))}
    </Tabs>
  );
}
