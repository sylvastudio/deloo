import { Platform } from 'react-native';

/**
 * Web only: where to go after signing in. A shared link (app.deloo.space/booking/…) opened while
 * signed out lands on Welcome (Stack.Protected); the address it was opened at is kept for this tab
 * (sessionStorage) and the root navigator goes back there once the person is signed in.
 * Native deep links are left to expo-router as before.
 */
const KEY = 'deloo.returnTo';
const SKIP = /^\/(welcome|sign-in|onboarding)?$/;

export function rememberReturn(path: string) {
  if (Platform.OS !== 'web' || SKIP.test(path.split('?')[0])) return;
  try { sessionStorage.setItem(KEY, path); } catch { /* private mode: no return */ }
}

export function takeReturn(): string | null {
  if (Platform.OS !== 'web') return null;
  try { const v = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return v; } catch { return null; }
}

// The address the web app was opened at, before any guard redirects it. Opening the bare root is a
// fresh start, so an older target from this tab is dropped.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  if (window.location.pathname === '/') { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }
  else rememberReturn(window.location.pathname + window.location.search);
}
