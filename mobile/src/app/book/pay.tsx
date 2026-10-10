import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  bookingDays, bookingStatus, cachedSettings, clockOffset, getActiveHold, parseTime, getBooking, IN_FLIGHT, isOffline, loadSettings, PAID, PAY_RETURN, plain,
  setActiveHold, startPayment, verifyPayment, type BookingDetail, type PayMethod,
} from '@/lib/bookings';
import { getCheckout, saveCheckout } from '@/lib/booking-draft';
import { payInline, preloadPaystack } from '@/lib/paystack-inline';
import { PayMethods } from '@/ui/pay-methods';
import { daysText, naira, rangeLabel, whatsappUrl } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/chip';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { SlideToConfirm } from '@/ui/slide-to-confirm';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

type Phase = 'loading' | 'ready' | 'opening' | 'checking' | 'pending' | 'unfinished' | 'ended' | 'refund' | 'mismatch' | 'missing' | 'error';

const POLL_MS = 5000;
const POLL_FOR_MS = 10 * 60_000;

/**
 * R-31 Pay and R-32 Payment pending. The hold is already made (Review); this opens Paystack in an
 * in-app browser (on the web: as an overlay on this page), then asks the server (verify) what
 * happened. Review's Pay button lands here with go=1 and Paystack opens straight away. Success is only shown once the booking row says 'confirmed' (the webhook or verify
 * confirms it, never the app).
 */
export default function Pay() {
  const c = useColors();
  const params = useLocalSearchParams<{ booking?: string; reference?: string; go?: string; method?: PayMethod }>();
  const [method, setMethod] = useState<PayMethod>(() => { const m = params.method ?? getCheckout()?.method; return m === 'bank_transfer' ? m : 'card'; });
  const autoStarted = useRef(false);
  useEffect(() => { if (Platform.OS === 'web') preloadPaystack(); }, []);
  const bookingId = params.booking ?? getActiveHold()?.booking_id;
  const [b, setB] = useState<BookingDetail | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [left, setLeft] = useState(0);
  // Phone clock vs server clock (ms). Asked once; every hold-time check below adds it.
  const skewP = useMemo(() => clockOffset().catch(() => 0), []);
  const [skew, setSkew] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [stillWaiting, setStillWaiting] = useState(false);
  const reference = useRef<string | undefined>(params.reference ?? getActiveHold()?.reference);
  const pollUntil = useRef(0);
  const help = cachedSettings()?.support_whatsapp;
  useEffect(() => { loadSettings().catch(() => {}); }, []);

  const done = useCallback(() => {
    setActiveHold(null);
    // Clear review/pay off the stack, so Back from success goes to the tabs, not an empty Review.
    if (router.canDismiss()) router.dismissAll();
    router.push(`/book/success?booking=${bookingId}`);
  }, [bookingId]);

  /** Reads what the server says after checkout and picks the screen state. */
  const check = useCallback(async (quiet = false) => {
    const ref = reference.current;
    if (!bookingId) return;
    if (!ref) { setPhase('ready'); return; }
    if (!quiet) setPhase('checking');
    try {
      const v = await verifyPayment(ref);
      if (v.booking_status && PAID.includes(v.booking_status)) return done();
      if (v.needs_refund) { setActiveHold(null); return setPhase('refund'); }
      if (v.error === 'amount_mismatch') return setPhase('mismatch');
      if (v.paystack_status && IN_FLIGHT.includes(v.paystack_status)) {
        pollUntil.current = Date.now() + POLL_FOR_MS; setStillWaiting(false);
        return setPhase('pending');
      }
      if (v.booking_status === 'expired' || v.booking_status === 'cancelled') return setPhase('ended');
      setMessage(''); setPhase('unfinished');
    } catch (e) {
      setMessage(isOffline(e) ? 'You’re offline, so we couldn’t check your payment. Connect and tap Check again.' : plain(e, 'We couldn’t check your payment yet.'));
      setPhase('unfinished');
    }
  }, [bookingId, done]);

  // First load: the booking, and if a payment was already started (app closed mid-checkout), check it.
  const load = useCallback(async () => {
    if (!bookingId) { setPhase('missing'); return; }
    try {
      const row = await getBooking(bookingId);
      if (!row) { setPhase('missing'); return; }
      setB(row);
      if (PAID.includes(row.status)) return done();
      if (row.needs_refund) return setPhase('refund');
      const started = row.payments.filter((p) => p.status === 'initialized' || p.status === 'success').sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
      if (!reference.current && started) reference.current = started.reference;
      if (reference.current) return check();
      // The server's status decides: a held booking is payable, whatever this phone's clock says. If
      // the hold really ran out, starting the payment says so (the server refuses it).
      setPhase(row.status === 'hold' ? 'ready' : 'ended');
    } catch (e) {
      setMessage(plain(e, 'Couldn’t load your booking.'));
      setPhase('error');
    }
  }, [bookingId, check, done, skewP]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { skewP.then(setSkew); }, [skewP]);

  // Hold countdown. The end check uses the fresh remaining time, not `left`: on the render where the
  // booking first arrives, `left` still holds the pre-load value (≤ 0) and would end every hold at once.
  const loaded = !!b;
  useEffect(() => {
    if (!loaded) return;
    const until = parseTime(b?.hold_expires_at);
    const tick = () => {
      const ms = until - (Date.now() + skew);
      // Unknown time (unparseable, or no expiry) shows no countdown rather than ending the hold.
      if (!Number.isFinite(ms)) { setLeft(Number.POSITIVE_INFINITY); return; }
      setLeft(ms);
      if (ms <= 0) setPhase((p) => (p === 'ready' || p === 'unfinished' ? 'ended' : p));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, b?.hold_expires_at, skew]);

  // Transfer in flight: watch the booking row every 5 s for a while (the webhook confirms it).
  useEffect(() => {
    if (phase !== 'pending' || !bookingId) return;
    const t = setInterval(async () => {
      if (Date.now() > pollUntil.current) { setStillWaiting(true); clearInterval(t); return; }
      try {
        const s = await bookingStatus(bookingId);
        if (s && PAID.includes(s.status)) { clearInterval(t); done(); }
        else if (s?.needs_refund) { clearInterval(t); setActiveHold(null); setPhase('refund'); }
      } catch { /* offline: keep trying */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [phase, bookingId, done]);

  // Web: the browser's Back button from Paystack can restore this page from the back/forward cache,
  // still showing "Opening Paystack…". Ask the server what happened instead.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onShow = (e: PageTransitionEvent) => { if (e.persisted && reference.current) check(); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [check]);

  // Back in the app (from a banking app, or after the browser was left open): check again quietly.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && (phase === 'unfinished' || phase === 'pending') && reference.current) check(true);
    });
    return () => sub.remove();
  }, [phase, check]);

  async function pay() {
    if (!bookingId) return;
    setPhase('opening'); setMessage('');
    try {
      if (method === 'usdt') { setMessage('Paying in USDT is coming soon. Pick card or bank transfer.'); setPhase('ready'); return; }
      const { authorization_url, reference: ref } = await startPayment(bookingId, method);
      reference.current = ref;
      const active = getActiveHold();
      if (active?.booking_id === bookingId) setActiveHold({ ...active, reference: ref });
      if (Platform.OS === 'web') {
        // Web: Paystack's checkout as an overlay on this page, so the renter never leaves the app and
        // lands on our success screen when it closes. If the overlay can't load, fall back to leaving
        // for Paystack in this tab: it sends the page back to /pay?reference=…, which checks with the
        // server (the active hold, with this reference, is in localStorage).
        try { await payInline(authorization_url); } catch { window.location.assign(authorization_url); return; }
        await check();
        return;
      }
      await WebBrowser.openAuthSessionAsync(authorization_url, PAY_RETURN);
      // Whatever the browser says (paid, closed, switched away), the server decides.
      await check();
    } catch (e) {
      const msg = plain(e, 'Couldn’t open the payment page. Try again.');
      setMessage(msg);
      setPhase(/hold has ended/i.test(msg) ? 'ended' : 'unfinished');
    } finally {
      setAttempt((n) => n + 1);
    }
  }

  // From Review's Pay button: open Paystack once, as soon as the booking is ready. The flag is cleared
  // so a reload or browser Back never reopens checkout by itself.
  useEffect(() => {
    if (!params.go || autoStarted.current || phase !== 'ready' || !b) return;
    autoStarted.current = true;
    router.setParams({ go: undefined });
    pay();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.go, phase, b]);

  function chooseMethod(m: PayMethod) {
    setMethod(m); setMessage('');
    const saved = getCheckout();
    if (saved) saveCheckout({ ...saved, method: m });
  }

  function startOver() {
    setActiveHold(null);
    router.replace('/book/review');
  }

  if (phase === 'missing' || phase === 'error') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title="Pay" />
        {phase === 'missing'
          ? <EmptyState icon="clock" title="Nothing to pay for" body="Your hold may have ended. Check your gear is still free." action="Back to review" onAction={startOver} />
          : <EmptyState icon="warning" title="Couldn’t load your booking" body={message} action="Try again" onAction={() => { setPhase('loading'); load(); }} />}
      </SafeAreaView>
    );
  }

  const known = Number.isFinite(left);
  const mins = known ? Math.max(0, Math.floor(left / 60000)) : 30, secs = known ? Math.max(0, Math.floor((left % 60000) / 1000)) : 0;
  const clock = known ? `${mins}:${String(secs).padStart(2, '0')}` : '30 minutes';
  const days = b ? bookingDays(b) : null;
  // While a transfer is landing, the hold time no longer matters: no red "Hold ended" next to "Waiting".
  const holdBadge = !b || phase === 'refund' || phase === 'pending' ? null
    : left <= 0 ? <Badge label="Hold ended" status="unavailable" />
    : <Badge label={known ? `Held ${clock}` : 'Held'} status={known && mins < 5 ? 'limited' : 'neutral'} />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Pay" right={holdBadge} />
      <ScrollView contentContainerStyle={styles.content}>
        {!b ? <><Skeleton style={{ height: 60, width: '60%' }} /><Skeleton style={{ height: 120 }} /></> : <>
          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="slate">{b.ref ? `Booking ${b.ref}` : 'To pay'}</Text>
            <Text variant="hero">{naira(b.total_kobo)}</Text>
            {days ? <Text tone="slate">{rangeLabel(days.first, days.last)} · {daysText(b.days)}</Text> : null}
          </View>

          <PhaseCard phase={phase} clock={clock} left={left} message={message} stillWaiting={stillWaiting} help={help} bookingRef={b.ref ?? ''} />

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            {b.booking_items.map((i) => <Text key={i.id} variant="caption" tone="slate">• {i.item_name}</Text>)}
            <Text variant="caption" tone="slate">
              {naira(b.rental_kobo)} rental · {naira(b.protection_kobo)} Deloo Protection{b.delivery_kobo ? ` · ${naira(b.delivery_kobo)} delivery and collection` : ''}
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: c.greenTint, borderColor: c.greenTint }]}>
            <View style={styles.row}><Icon name="shield" size={18} color={c.greenInk} /><Text variant="bodyStrong" style={{ color: c.greenInk }}>Deposit {naira(b.deposit_kobo)}</Text></View>
            <Text variant="caption">Refundable. We send it back within 48 hours after we check the gear, to the card or account you paid from.</Text>
          </View>
          {phase === 'ready' || phase === 'unfinished' ? <PayMethods value={method} onChange={chooseMethod} /> : null}
        </>}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line }]}>
        {/* Web (often WhatsApp's in-app browser): a drag fights page scrolling, and Paystack is the confirm step anyway. */}
        {phase === 'ready' && b ? (Platform.OS === 'web'
          ? <Button title={`Pay ${naira(b.total_kobo)}`} disabled={left <= 0 || method === 'usdt'} onPress={pay} />
          : <SlideToConfirm key={attempt} label={`Slide to pay ${naira(b.total_kobo)}`} disabled={left <= 0 || method === 'usdt'} onConfirm={pay} />
        ) : phase === 'opening' || phase === 'checking' || phase === 'loading' ? (
          <Button title={phase === 'checking' ? 'Checking your payment…' : 'Opening Paystack…'} loading disabled />
        ) : phase === 'unfinished' ? (
          <>
            <Button title="Resume payment" onPress={pay} disabled={left <= 0 || method === 'usdt'} />
            {reference.current ? <Button kind="quiet" title="I’ve paid. Check again" onPress={() => check()} /> : null}
          </>
        ) : phase === 'pending' ? (
          <Button kind={stillWaiting ? 'primary' : 'secondary'} title="Check again" onPress={() => check()} />
        ) : phase === 'ended' ? (
          <Button title="Check the gear is still free" onPress={startOver} />
        ) : phase === 'refund' || phase === 'mismatch' ? (
          <>
            {help ? <Button title="Chat on WhatsApp" onPress={() => Linking.openURL(whatsappUrl(help, `Hi Deloo, about my payment for ${b?.ref ?? 'my booking'}`)).catch(() => {})} /> : null}
            <Button kind="quiet" title="See my bookings" onPress={() => { setActiveHold(null); router.replace('/bookings'); }} />
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function PhaseCard({ phase, clock, left, message, stillWaiting, help, bookingRef }: {
  phase: Phase; clock: string; left: number; message: string; stillWaiting: boolean; help?: string; bookingRef: string;
}) {
  const c = useColors();
  if (phase === 'ready' || phase === 'opening') {
    return <Notice tone={left < 5 * 60_000 ? 'warning' : 'tip'} icon="clock">{`We’re holding your gear for ${clock}. Pay before then to keep it.`}</Notice>;
  }
  if (phase === 'checking') {
    return (
      <View style={[styles.card, styles.row, { backgroundColor: c.surface, borderColor: c.line }]}>
        <ActivityIndicator color={c.lagoon} /><Text>Checking your payment with Paystack…</Text>
      </View>
    );
  }
  if (phase === 'pending') {
    return (
      <View style={[styles.card, { backgroundColor: c.lagoonTint, borderColor: c.lagoonTint }]}>
        <View style={styles.row}>{!stillWaiting ? <ActivityIndicator color={c.lagoon} /> : <Icon name="clock" color={c.lagoon} />}<Text variant="bodyStrong">Waiting for your transfer</Text></View>
        <Text variant="caption">
          {stillWaiting
            ? `Still waiting. If you’ve paid, tap Check again or send your receipt on WhatsApp${bookingRef ? ` with ${bookingRef}` : ''}.`
            : 'Transfers usually land in under 10 minutes. You can leave this screen; your booking will show as confirmed once it arrives.'}
        </Text>
        {left <= 0 ? <Text variant="caption">Your hold time is up, but if the money lands and the gear is still free we’ll confirm it.</Text> : null}
        {stillWaiting && help ? (
          <Text variant="label" tone="lagoon" onPress={() => Linking.openURL(whatsappUrl(help, `Hi Deloo, I’ve paid for ${bookingRef || 'my booking'} by transfer`)).catch(() => {})}>Send receipt on WhatsApp</Text>
        ) : null}
      </View>
    );
  }
  if (phase === 'unfinished') {
    return (
      <Notice tone="warning">
        <View style={{ gap: 2 }}>
          <Text variant="bodyStrong">Payment not finished</Text>
          <Text variant="caption">{message || `Nothing was taken. Your gear is still held for ${clock}. Resume to pay by card or bank transfer.`}</Text>
        </View>
      </Notice>
    );
  }
  if (phase === 'ended') {
    return (
      <Notice tone="problem">
        <View style={{ gap: 2 }}>
          <Text variant="bodyStrong" tone="red">Your hold ended</Text>
          <Text variant="caption">{message || 'Nothing was charged. Your list is saved; check the gear is still free and try again.'}</Text>
        </View>
      </Notice>
    );
  }
  if (phase === 'refund') {
    return (
      <Notice tone="problem">
        <View style={{ gap: 2 }}>
          <Text variant="bodyStrong" tone="red">We received your payment but the gear was taken</Text>
          <Text variant="caption">Your money is safe. We’ll call you shortly to offer other gear or refund you in full.</Text>
        </View>
      </Notice>
    );
  }
  if (phase === 'mismatch') {
    return <Notice tone="warning">The amount we received doesn’t match your total. We’ve kept your hold longer and will call you to sort it out.</Notice>;
  }
  return null;
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
