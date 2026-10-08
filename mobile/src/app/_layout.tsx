import {
  AtkinsonHyperlegibleNext_400Regular, AtkinsonHyperlegibleNext_500Medium, AtkinsonHyperlegibleNext_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

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
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: p.paper, card: p.surface, text: p.ink, border: p.line, primary: p.lagoon } }}>
      <SessionProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {fontsLoaded ? <Navigator /> : null}
      </SessionProvider>
    </ThemeProvider>
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
      </Stack.Protected>
      <Stack.Protected guard={ready && mode === 'vendor'}>
        <Stack.Screen name="(vendor)" options={{ animation: 'fade' }} />
      </Stack.Protected>
    </Stack>
  );
}
