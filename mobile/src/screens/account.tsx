import Constants from 'expo-constants';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { bookingDays, cachedSettings, isActive, listBookings, loadSettings, stageOf, stageTone, STAGE_LABEL, type Booking } from '@/lib/bookings';
import { rangeLabel, whatsappUrl } from '@/lib/format';
import { useSession, VENDOR_MODE } from '@/lib/session';
import { radius, space, touch } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/chip';
import { Icon, type IconName } from '@/ui/icon';
import { Card, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

const VERSION = Constants.expoConfig?.version ?? '';

/** Deloo's WhatsApp line from app settings (cached, refreshed on mount), plus chat and call actions. */
export function useSupport() {
  const [number, setNumber] = useState(() => cachedSettings()?.support_whatsapp ?? '');
  useEffect(() => { loadSettings().then((s) => setNumber(s.support_whatsapp)).catch(() => {}); }, []);
  const digits = number.replace(/\D/g, '').replace(/^0/, '234');
  return {
    number,
    chat: (text = 'Hi Deloo, I need some help') => number && Linking.openURL(whatsappUrl(number, text)).catch(() => {}),
    call: () => digits && Linking.openURL(`tel:+${digits}`).catch(() => {}),
  };
}

/**
 * The booking the renter most needs to see: the soonest one still going. Reloads when the screen
 * comes back into focus. Never-paid tries (an ended hold) don't count; isActive already drops those.
 */
export function useNextBooking() {
  const [next, setNext] = useState<Booking | null>(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    listBookings().then(({ list }) => {
      const going = list.filter(isActive).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
      if (live) setNext(going[0] ?? null);
    }).catch(() => { /* offline with no cache: just no card */ });
    return () => { live = false; };
  }, []));
  return next;
}

/** "Your next booking": status, dates and what's in it. A hold still waiting for payment opens Pay. */
export function NextBookingCard({ b }: { b: Booking }) {
  const c = useColors();
  const stage = stageOf(b);
  const { first, last } = bookingDays(b);
  const label = b.needs_refund ? 'Payment received' : STAGE_LABEL[stage];
  const items = b.booking_items.map((i) => i.item_name).join(', ');
  return (
    <Pressable
      onPress={() => router.push(b.status === 'hold' ? `/book/pay?booking=${b.id}` : `/booking/${b.id}`)}
      accessibilityRole="button" accessibilityLabel={`Your next booking, ${rangeLabel(first, last)}, ${label}`}
      android_ripple={{ color: c.lagoonTint }}
      style={[styles.next, { backgroundColor: c.surface, borderColor: c.lagoon }]}>
      <View style={[styles.nextIcon, { backgroundColor: c.lagoonTint }]}><Icon name="calendar" color={c.lagoon} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" tone="slate">Your next booking</Text>
        <Text variant="bodyStrong" numberOfLines={1}>{rangeLabel(first, last)}</Text>
        {items ? <Text variant="caption" tone="slate" numberOfLines={1}>{b.ref ? `${b.ref} · ` : ''}{items}</Text> : null}
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          <Badge label={label} status={b.needs_refund ? 'limited' : stageTone(stage)} />
        </View>
      </View>
      <Icon name="chevron" color={c.slate} />
    </Pressable>
  );
}

/** A titled group of rows. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label" tone="slate" accessibilityRole="header">{title}</Text>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>{children}</View>
    </View>
  );
}

/** One tappable line in a Section: icon, label, optional detail, chevron. */
export function Row({ icon, label, detail, onPress, last }: { icon: IconName; label: string; detail?: string; onPress: () => void; last?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityLabel={detail ? `${label}, ${detail}` : label}
      android_ripple={{ color: c.lagoonTint }}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <Icon name={icon} size={20} color={c.lagoon} />
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {detail ? <Text variant="caption" tone="slate">{detail}</Text> : null}
      </View>
      <Icon name="chevron" size={20} color={c.slate} />
    </Pressable>
  );
}

const open = (url: string) => () => Linking.openURL(url).catch(() => {});
const go = (to: Href) => () => router.push(to);

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/**
 * Account tab: who you are, your next booking, help, the legal pages, the waitlists, sign out and
 * delete. No verification tiers here: we ask for ID only when a booking needs it.
 */
export function AccountScreen() {
  const c = useColors();
  const { profile, session, signOut, vendors, mode, setMode } = useSession();
  // Only in builds with the vendor flag on (and never on the web): the way back and forth between modes.
  const vendor = VENDOR_MODE && Platform.OS !== 'web' ? vendors[0] : undefined;
  const next = useNextBooking();
  const support = useSupport();
  const [confirmOut, setConfirmOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const name = profile?.full_name ?? '';

  return (
    <Screen>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: c.lagoonTint }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text variant="heading" tone="lagoon">{initials(name)}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" accessibilityRole="header" numberOfLines={1}>{name || 'Your account'}</Text>
          {profile?.phone ? <Text variant="caption" tone="slate">{profile.phone}</Text> : null}
          {session?.user.email ? <Text variant="caption" tone="slate" numberOfLines={1}>{session.user.email}</Text> : null}
        </View>
        <Pressable onPress={go('/account/edit')} accessibilityRole="button" accessibilityLabel="Edit name and phone" hitSlop={8} style={styles.edit}>
          <Text variant="label" tone="lagoon">Edit</Text>
        </Pressable>
      </View>
      <View style={styles.verify}>
        <Icon name="shield" size={18} color={c.slate} />
        <Text variant="caption" tone="slate" style={{ flex: 1 }}>We’ll ask for ID only if a booking needs it.</Text>
      </View>

      {next && mode === 'renter' ? <NextBookingCard b={next} /> : null}

      {vendor ? (
        <Button kind="secondary" title={mode === 'renter' ? `Switch to ${vendor.name}` : 'Switch to renting'}
          onPress={() => setMode(mode === 'renter' ? 'vendor' : 'renter')} />
      ) : null}

      <Section title="Your details">
        <Row icon="person" label="Name and phone" detail={[name, profile?.phone].filter(Boolean).join(' · ') || undefined} onPress={go('/account/edit')} last />
      </Section>

      <Section title="Help">
        {support.number ? <Row icon="whatsapp" label="Chat on WhatsApp" detail="Usually the fastest way to reach us" onPress={() => support.chat()} /> : null}
        {support.number ? <Row icon="phone" label="Call us" onPress={support.call} /> : null}
        <Row icon="info" label="Common questions" detail="Deposits, protection, late returns, cancelling" onPress={go('/account/help')} last />
      </Section>

      <Section title="About">
        <Row icon="sparkles" label="About Deloo" onPress={go('/account/about')} />
        <Row icon="shield" label="Rental terms" onPress={open('https://deloo.space/terms')} />
        <Row icon="info" label="Privacy" onPress={open('https://deloo.space/privacy')} last />
      </Section>

      <Section title="More from Deloo">
        <Row icon="camera" label="Own gear? Join the waitlist" detail="Rent out your kit on Deloo, coming soon" onPress={go('/coming-soon')} />
        <Row icon="pin" label="Not in Lagos?" detail="Tell us your city" onPress={go('/coming-soon?city=1')} last />
      </Section>

      {confirmOut ? (
        <Card>
          <Text variant="bodyStrong">Sign out of Deloo?</Text>
          <Text variant="caption" tone="slate">Your plan and basket on this phone are cleared. Your bookings stay safe in your account.</Text>
          <View style={styles.confirmRow}>
            <Button kind="secondary" title="Stay" style={{ flex: 1 }} onPress={() => setConfirmOut(false)} />
            <Button title="Sign out" style={{ flex: 1 }} loading={leaving} onPress={async () => { setLeaving(true); await signOut(); }} />
          </View>
        </Card>
      ) : (
        <Button kind="secondary" title="Sign out" onPress={() => setConfirmOut(true)} />
      )}

      <View style={[styles.danger, { borderTopColor: c.line }]}>
        <Pressable onPress={go('/account/delete')} accessibilityRole="button" hitSlop={8} style={styles.deleteBtn}>
          <Text variant="label" tone="red">Delete account</Text>
        </Pressable>
        {VERSION ? <Text variant="caption" tone="faint">Deloo {VERSION}</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  edit: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.sm },
  verify: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: -space.sm },
  next: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, overflow: 'hidden' },
  nextIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: touch + 8 },
  confirmRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  danger: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.lg, paddingTop: space.lg, alignItems: 'center', gap: space.md },
  deleteBtn: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.lg },
});
