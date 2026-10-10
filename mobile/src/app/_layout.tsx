import {
  AtkinsonHyperlegibleNext_400Regular, AtkinsonHyperlegibleNext_500Medium, AtkinsonHyperlegibleNext_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PlanProvider } from '@/lib/plan';
import { takeReturn } from '@/lib/return-to';
import { SessionProvider, useSession, VENDOR_MODE } from '@/lib/session';
import { palette } from '@/theme/tokens';
import { useIsDark } from '@/theme/use-colors';
import { WebFrame } from '@/ui/web-frame';

SplashScreen.preventAutoHideAsync();

// Web: don't hold the page blank for the fonts; text swaps to them when they arrive.
const WEB = Platform.OS === 'web';

export default function Root() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold,
    AtkinsonHyperlegibleNext_400Regular, AtkinsonHyperlegibleNext_500Medium, AtkinsonHyperlegibleNext_700Bold,
  });
  const dark = useIsDark();
  const p = dark ? palette.dark : palette.light;
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={{ ...base, colors: { ...base.colors, background: p.paper, card: p.surface, text: p.ink, border: p.line, primary: p.lagoon } }}>
        <SessionProvider>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <PlanProvider><WebFrame>{fontsLoaded || WEB ? <Navigator /> : null}</WebFrame></PlanProvider>
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Who sees what (Stack.Protected, docs.expo.dev/router/advanced/authentication):
 * signed out → welcome and sign-in; signed in without a profile → onboarding;
 * otherwise the renter tabs (vendor tabs only in builds with EXPO_PUBLIC_VENDOR_MODE=on).
 * On the web, signed-out visitors can also browse gear.
 */
function Navigator() {
  const { loading, session, profile, mode } = useSession();
  const ready = !!session && !!profile;
  // Web: once signed in, go back to the link the person opened (or the item they tried to book).
  useEffect(() => {
    if (!ready) return;
    const to = takeReturn();
    if (WEB && to && to !== window.location.pathname + window.location.search) setTimeout(() => router.replace(to as Href), 0);
  }, [ready]);
  if (loading) return null;
  SplashScreen.hide();
  // Web: gear can be browsed signed out, so shared links to /explore and /item/… open for anyone.
  // Signed out, the tabs show Explore only (the web tab layout sends everything else to Welcome).
  const browse = WEB && !session;
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !profile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={(ready && mode === 'renter') || browse}>
        <Stack.Screen name="(renter)" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={ready && mode === 'renter'}>
        <Stack.Screen name="plan/details" />
        <Stack.Screen name="plan/ask/[q]" />
        <Stack.Screen name="plan/setup" />
        <Stack.Screen name="plan/swap" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetCornerRadius: 24, sheetGrabberVisible: true }} />
        <Stack.Screen name="plan/share" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.7], sheetCornerRadius: 24, sheetGrabberVisible: true }} />
        <Stack.Screen name="book/review" />
        <Stack.Screen name="book/pay" />
        <Stack.Screen name="book/success" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="booking/[id]" />
        <Stack.Screen name="booking/handover" />
        <Stack.Screen name="booking/cancel" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetCornerRadius: 24, sheetGrabberVisible: true }} />
        {/* deloo://pay?reference=… from Paystack's return page; forwards to the pay screen. */}
        <Stack.Screen name="pay" options={{ animation: 'none' }} />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="coming-soon" />
        <Stack.Screen name="account/edit" />
        <Stack.Screen name="account/help" />
        <Stack.Screen name="account/about" />
        <Stack.Screen name="account/delete" />
      </Stack.Protected>
      <Stack.Protected guard={ready || browse}>
        <Stack.Screen name="item/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={VENDOR_MODE && ready && mode === 'vendor'}>
        <Stack.Screen name="(vendor)" options={{ animation: 'fade' }} />
        <Stack.Screen name="add-gear" />
      </Stack.Protected>
    </Stack>
  );
}
