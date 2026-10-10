import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { setBookingDraft } from './booking-draft';
import { supabase } from './supabase';

export type Profile = { full_name: string; phone: string; wants_to_rent: boolean; has_gear: boolean; trust_level: number; is_ops: boolean };
export type Vendor = { id: string; name: string; vendor_type: 'company' | 'church' | 'individual'; approved_at: string | null; role: 'owner' | 'staff' };
export type Mode = 'renter' | 'vendor';

type State = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  vendors: Vendor[];
  mode: Mode;
  setMode: (m: Mode) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<State | null>(null);
const MODE_KEY = 'deloo.mode';

export function useSession() {
  const s = use(SessionContext);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}

/** Holds the signed-in session plus the profile and vendor memberships the app routes on. */
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [mode, setModeState] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) as Mode) ?? 'renter');
  const [loading, setLoading] = useState(true);

  // Session, profile and vendors are set together, so the router never sees a session without its
  // profile (which would flash onboarding at someone who already finished it).
  const load = useCallback(async (s: Session | null) => {
    if (!s) { setSession(null); setProfile(null); setVendors([]); return; }
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('profiles').select('full_name, phone, wants_to_rent, has_gear, trust_level, is_ops').eq('id', s.user.id).maybeSingle(),
      supabase.from('vendor_members').select('role, vendors(id, name, vendor_type, approved_at)').eq('user_id', s.user.id),
    ]);
    setProfile(p ?? null);
    setVendors((m ?? []).flatMap((row) => {
      const v = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
      return v ? [{ ...v, role: row.role } as Vendor] : [];
    }));
    setSession(s);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session)).finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Token refreshes don't change who's signed in; skip the reload.
      if (event !== 'TOKEN_REFRESHED') load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const setMode = useCallback((m: Mode) => { localStorage.setItem(MODE_KEY, m); setModeState(m); }, []);
  const refresh = useCallback(async () => { await load((await supabase.auth.getSession()).data.session); }, [load]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Shared phones and browsers: drop this person's plan, basket, address, hold and booking cache.
    // Handover photos still waiting to upload are kept: they're evidence for a booking.
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('deloo.') && k !== 'deloo.handover.queue' && k !== 'deloo.settings') localStorage.removeItem(k);
    } catch { /* storage unavailable */ }
    setBookingDraft(null);
  }, []);

  // Someone without gear can't be in vendor mode; someone with only gear starts there.
  // The web app (app.deloo.space) is for renters only; vendor tools stay in the Android app.
  const effectiveMode: Mode = Platform.OS === 'web' || vendors.length === 0 ? 'renter' : profile && !profile.wants_to_rent ? 'vendor' : mode;

  return (
    <SessionContext value={{ loading, session, profile, vendors, mode: effectiveMode, setMode, refresh, signOut }}>
      {children}
    </SessionContext>
  );
}
