import {
  AtkinsonHyperlegibleNext_400Regular, AtkinsonHyperlegibleNext_500Medium, AtkinsonHyperlegibleNext_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PlanProvider } from '@/lib/plan';
import { SessionProvider, useSession } from '@/lib/session';
import { palette } from '@/theme/tokens';
import { useIsDark } from '@/theme/use-colors';

SplashScreen.preventAutoHideAsync();

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
          <PlanProvider>{fontsLoaded ? <Navigator /> : null}</PlanProvider>
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Who sees what (Stack.Protected, docs.expo.dev/router/advanced/authentication):
 * signed out → welcome and sign-in; signed in without a profile → onboarding;
 * otherwise renter or vendor tabs, by mode.
 */
function Navigator() {
  const { loading, session, profile, mode } = useSession();
  if (loading) return null;
  SplashScreen.hide();
  const ready = !!session && !!profile;
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !profile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={ready && mode === 'renter'}>
        <Stack.Screen name="(renter)" options={{ animation: 'fade' }} />
        <Stack.Screen name="plan/details" />
        <Stack.Screen name="plan/ask/[q]" />
        <Stack.Screen name="plan/sizing" options={{ animation: 'fade' }} />
        <Stack.Screen name="plan/setup" />
        <Stack.Screen name="plan/swap" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetCornerRadius: 24, sheetGrabberVisible: true }} />
        <Stack.Screen name="plan/share" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.7], sheetCornerRadius: 24, sheetGrabberVisible: true }} />
        <Stack.Screen name="book/review" />
        <Stack.Screen name="book/pay" />
        <Stack.Screen name="book/success" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="booking/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="coming-soon" />
      </Stack.Protected>
      <Stack.Protected guard={ready && mode === 'vendor'}>
        <Stack.Screen name="(vendor)" options={{ animation: 'fade' }} />
        <Stack.Screen name="add-gear" />
      </Stack.Protected>
    </Stack>
  );
}
