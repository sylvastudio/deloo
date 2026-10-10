import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { asGear, draftKey, getCheckout, loadShelf, saveCheckout, useBookingDraft, type DraftLine, type ShelfItem } from '@/lib/booking-draft';
import { kitGaps } from '@/planner/complements';
import {
  cachedSettings, createHold, GearTaken, getActiveHold, isOffline, itemCalendar, loadSettings, parseTime, plain, quoteBooking, requestCancellation,
  setActiveHold, type ActiveHold, type Delivery, type PayMethod, type Quote, type QuoteLine, type Settings,
} from '@/lib/bookings';
import { WhatsCovered } from '@/ui/coverage-sheet';
import { DEFAULT_SLOT, DeliverySlotPicker, saveDeliverySlot, type DeliverySlot } from '@/ui/delivery-slot';
import { PayMethods } from '@/ui/pay-methods';
import { daysText, lagosTime, naira, rangeLabel, whatsappUrl } from '@/lib/format';
import { useSession } from '@/lib/session';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge, Chip } from '@/ui/chip';
import { addDays, dayCount, DateRangeCalendar, lagosToday } from '@/ui/date-range';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { Field } from '@/ui/layout';
import { Segmented } from '@/ui/segmented';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

const HORIZON = 90;

/**
 * R-30 Review booking. Prices come from quote_booking (server) every time something changes; "Pay"
 * holds the gear with create_hold and moves to R-31. The draft stays saved whatever happens here.
 */
export default function Review() {
  const c = useColors();
  const { draft, update } = useBookingDraft();
  const { profile } = useSession();
  const saved = useMemo(getCheckout, []);
  const [settings, setSettings] = useState<Settings | null>(cachedSettings);
  // What the plan said ("deliver to Ajah") wins over last time's choice.
  const [delivery, setDelivery] = useState<Delivery>(draft?.delivery ?? saved?.delivery ?? 'delivery');
  const [slot, setSlot] = useState<DeliverySlot>(DEFAULT_SLOT);
  const [zoneId, setZoneId] = useState<string | undefined>(saved?.zoneId);
  const [address, setAddress] = useState(saved?.address ?? '');
  const [phone, setPhone] = useState(saved?.phone || profile?.phone || '');
  // A phone we already have is shown as one line with "Change", not an open field.
  const [editPhone, setEditPhone] = useState(!(saved?.phone || profile?.phone));
  const [method, setMethod] = useState<PayMethod>(saved?.method === 'bank_transfer' ? 'bank_transfer' : 'card');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [offline, setOffline] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [taken, setTaken] = useState(false);
  const [pickDays, setPickDays] = useState(!draft?.first);
  const [hold, setHold] = useState<ActiveHold | null>(getActiveHold);
  const [touched, setTouched] = useState(false);
  const seq = useRef(0);

  const key = draft ? draftKey(draft) : '';
  // Saved as they type, so going Back (or a reload) never loses the address or phone.
  useEffect(() => {
    saveCheckout({ delivery, zoneId, address: address.trim(), phone: phone.trim(), method });
  }, [delivery, zoneId, address, phone, method]);
  const held = !!hold && hold.draftKey === key && parseTime(hold.hold_expires_at) > Date.now();

  useEffect(() => {
    loadSettings().then((s) => { setSettings(s); setOffline(false); }).catch((e) => { if (isOffline(e)) setOffline(true); });
  }, []);
  // Settings arrive: pre-select the zone covering the plan's area, else the renter's last one. Never a
  // guess: with neither, nothing is selected and the renter picks (a wrong zone means a wrong price).
  useEffect(() => {
    if (!settings || (zoneId && settings.zones.some((z) => z.id === zoneId))) return;
    const area = draft?.area?.toLowerCase();
    const match = area ? settings.zones.find((z) => z.areas.some((a) => a.toLowerCase() === area)) : undefined;
    setZoneId(match?.id);
  }, [settings, zoneId, draft?.area]);

  // An old unpaid hold for a different basket would block the same gear: let it go (never one being paid).
  useEffect(() => {
    if (key && hold && hold.draftKey !== key && !hold.reference) {
      requestCancellation(hold.booking_id, 'Changed before paying').catch(() => {});
      setActiveHold(null);
      setHold(null);
    }
  }, [hold, key]);

  const runQuote = useCallback(async () => {
    if (!draft?.lines.length || !draft.first || !draft.last) { setQuote(null); return; }
    const mine = ++seq.current;
    setQuoteError('');
    try {
      const q = await quoteBooking(draft.lines, draft.first, draft.last, delivery, zoneId);
      if (mine !== seq.current) return;
      setQuote(q); setOffline(false);
    } catch (e) {
      if (mine !== seq.current) return;
      setOffline(isOffline(e));
      setQuoteError(plain(e, 'Couldn’t price your booking.'));
    }
  }, [draft?.lines, draft?.first, draft?.last, delivery, zoneId]);
  useEffect(() => { runQuote(); }, [runQuote]);

  if (!draft || draft.lines.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar title="Review booking" />
        <EmptyState icon="calendar" title="Your bag is empty" body="Add gear from the Gear tab, then pick your days." action="Browse gear" onAction={() => router.navigate('/explore')} />
      </SafeAreaView>
    );
  }

  // While our own hold is live, the quote counts it as taken: ignore "not free" then.
  const problems = (quote?.problems ?? []).filter((p) => !(held && p === 'not_free'));
  const quoteLines = new Map((quote?.lines ?? []).map((l) => [l.item_id, l]));
  const gone = quote ? draft.lines.filter((l) => !quoteLines.has(l.itemId)) : [];
  const short = (quote?.lines ?? []).filter((l) => !l.ok && !held);
  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const addressOk = delivery === 'pickup' || address.trim().length >= 5;
  const ready = !!quote && problems.length === 0 && phoneOk && addressOk && !offline;
  // What's still missing, said once above the Pay button (the field errors can be off-screen).
  const missing = !draft.first || !draft.last ? 'Choose your days.'
    : problems.includes('starts_too_soon') ? 'Bookings start from tomorrow. Pick new days.'
    : short.length || gone.length ? 'Some gear isn’t free on these days. Change the days or remove it.'
    : delivery === 'delivery' && !zoneId ? 'Choose your delivery area.'
    : !addressOk ? 'Add your delivery address.'
    : !phoneOk ? 'Add a phone number for the rider.' : '';
  const n = draft.first && draft.last ? dayCount(draft.first, draft.last) : 0;
  const help = settings?.support_whatsapp;

  function setLines(lines: DraftLine[]) { setTaken(false); update({ lines }); }
  function setDays(first: string, last: string) { setTaken(false); update({ first, last }); }

  /** Changing anything that went into the hold lets the hold go first. */
  async function releaseHold() {
    if (!hold) return;
    await requestCancellation(hold.booking_id, 'Changed before paying').catch(() => {});
    setActiveHold(null); setHold(null);
    runQuote();
  }

  async function pay() {
    setTouched(true);
    // Straight to Paystack: the pay screen opens checkout as soon as it loads (go=1).
    const toPay = (id: string) => router.push({ pathname: '/book/pay', params: { booking: id, go: '1', method } });
    if (method === 'usdt') { setPayError('Paying in USDT is coming soon. Pick card or bank transfer for now.'); return; }
    saveCheckout({ delivery, zoneId, address: address.trim(), phone: phone.trim(), method });
    // The slot is saved on the booking right after the hold; losing it never blocks paying (staff set it).
    if (held && hold) { saveDeliverySlot(hold.booking_id, slot).catch(() => {}); toPay(hold.booking_id); return; }
    if (!ready || !draft?.first || !draft.last) return;
    setPaying(true); setPayError(''); setTaken(false);
    try {
      const h = await createHold({
        lines: draft.lines, first: draft.first, last: draft.last, delivery, zoneId, address: address.trim(), phone: phone.trim(),
        eventId: draft.eventId, notIncluded: draft.notIncluded,
      });
      const active = { ...h, draftKey: key };
      setActiveHold(active); setHold(active);
      await saveDeliverySlot(h.booking_id, slot).catch(() => {});
      toPay(h.booking_id);
    } catch (e) {
      if (e instanceof GearTaken) { setTaken(true); setPickDays(true); runQuote(); }
      else setPayError(plain(e, 'Couldn’t hold your gear. Try again.'));
    } finally {
      setPaying(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Review booking" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {offline ? <Notice tone="warning">You’re offline. Prices and availability are checked live, so connect to book.</Notice> : null}
        {taken ? (
          <Notice tone="problem">
            <View style={{ gap: space.xs }}>
              <Text variant="bodyStrong" tone="red">Someone just booked this. Pick other days</Text>
              <Text variant="caption">Your list is saved. Change your days below, or take fewer.</Text>
            </View>
          </Notice>
        ) : null}
        {held && hold ? (
          <Notice tone="tip" icon="clock">
            <View style={{ gap: space.xs }}>
              <Text variant="caption">{`We’re holding your gear until ${lagosTime(hold.hold_expires_at)}. Pay to keep it.`}</Text>
              <Text variant="caption" tone="lagoon" onPress={releaseHold} accessibilityRole="button">Change details (lets the hold go)</Text>
            </View>
          </Notice>
        ) : null}

        {/* Days */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: problems.includes('starts_too_soon') || short.length ? c.red : c.line }]}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" tone="slate">YOUR DAYS</Text>
              <Text variant="bodyStrong">{draft.first && draft.last ? `${rangeLabel(draft.first, draft.last)} · ${daysText(n)}` : 'Choose your days'}</Text>
            </View>
            {!held ? <Button kind="quiet" title={pickDays ? 'Done' : 'Change'} onPress={() => setPickDays(!pickDays)} /> : null}
          </View>
          {problems.includes('starts_too_soon') ? <Text variant="caption" tone="red">Bookings start from tomorrow. Pick new days.</Text> : null}
          {pickDays && !held ? <DaysPicker lines={draft.lines} first={draft.first} last={draft.last} onChange={setDays} /> : null}
        </View>

        {/* Items */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text variant="label" tone="slate">YOUR GEAR</Text>
          {draft.lines.map((l) => {
            const q = quoteLines.get(l.itemId);
            return (
              <LineRow key={l.itemId} line={l} q={q} gone={gone.includes(l)} held={held} days={n}
                onRemove={!held ? () => setLines(draft.lines.filter((x) => x.itemId !== l.itemId)) : undefined}
                onFewer={q && !q.ok && q.free > 0 && !held ? () => setLines(draft.lines.map((x) => (x.itemId === l.itemId ? { ...x, qty: q.free } : x))) : undefined}
                onDays={() => setPickDays(true)} />
            );
          })}
          {draft.notIncluded?.length ? (
            <View style={[styles.note, { backgroundColor: c.marigoldTint }]}>
              <Text variant="caption">Not included: {draft.notIncluded.map((x) => `${x.label}${x.reason === 'not_stocked' ? ' (we don’t stock it yet)' : ' (booked on your dates)'}`).join(', ')}.</Text>
            </View>
          ) : null}
          {/* Back to the Gear tab; the bag (this draft) stays as it is. */}
          {!held ? (
            <Pressable onPress={() => router.navigate('/explore')} hitSlop={8} accessibilityRole="link" style={styles.addMore}>
              <Icon name="plus" size={18} color={c.lagoon} /><Text variant="label" tone="lagoon">Add more gear</Text>
            </Pressable>
          ) : null}
        </View>
        {!held ? (
          <KitGaps lines={draft.lines} first={draft.first} last={draft.last}
            onAdd={(add, replaces) => setLines([...draft.lines.filter((x) => x.itemId !== replaces && x.itemId !== add.itemId), add])} />
        ) : null}

        {/* Delivery or pickup */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text variant="label" tone="slate">DELIVERY OR PICKUP</Text>
          <View pointerEvents={held ? 'none' : 'auto'} style={{ gap: space.md, opacity: held ? 0.6 : 1 }}>
            <Segmented label="Delivery or pickup" value={delivery} onChange={setDelivery}
              options={[{ value: 'delivery', label: 'Deliver to me' }, { value: 'pickup', label: 'I’ll pick up' }]} />
            {delivery === 'delivery' ? <>
              {!settings ? <Skeleton style={{ height: 40 }} /> : (
                <View style={styles.chips}>
                  {settings.zones.map((z) => <Chip key={z.id} label={`${z.name} · ${naira(z.price_kobo * 2, true)}`} selected={zoneId === z.id} onPress={() => setZoneId(z.id)} />)}
                </View>
              )}
              {settings?.zones.find((z) => z.id === zoneId) ? (
                <Text variant="caption" tone="slate">{settings.zones.find((z) => z.id === zoneId)!.areas.join(', ')}. We drop it off and collect it.</Text>
              ) : null}
              {!zoneId ? <Text variant="caption" tone={touched ? 'red' : 'slate'}>Choose your area so we can price delivery. The price covers drop-off and collection.</Text> : null}
              <Field label="Delivery address" value={address} onChangeText={setAddress} multiline autoComplete="street-address"
                placeholder="House number, street, area. Add a landmark" style={{ minHeight: 76, paddingTop: space.md, textAlignVertical: 'top' }}
                error={touched && !addressOk ? 'Add the address we should deliver to.' : undefined} />
            </> : (
              <Text variant="caption" tone="slate">
                {settings?.pickup_address ? `Pick up from ${settings.pickup_address}. ` : 'We’ll send our pickup address on WhatsApp. '}
                Bring a valid ID. Return it to the same place the morning after your last day.
              </Text>
            )}
            <DeliverySlotPicker value={slot} onChange={setSlot} pickup={delivery === 'pickup'} disabled={held} />
            {editPhone || !phoneOk ? (
              <Field label="Phone for the rider" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel"
                error={touched && !phoneOk ? 'Add a phone number we can call or WhatsApp.' : undefined} />
            ) : (
              <View style={styles.row}>
                <Text variant="caption" tone="slate" style={{ flex: 1 }}>{`We’ll call or WhatsApp ${phone} about delivery.`}</Text>
                <Pressable onPress={() => setEditPhone(true)} hitSlop={8} accessibilityRole="button"><Text variant="label" tone="lagoon">Change</Text></Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Money */}
        {quoteError && !quote ? (
          <Notice tone="problem"><Text variant="caption" tone="red">{quoteError} <Text variant="caption" tone="lagoon" onPress={runQuote}>Try again</Text></Text></Notice>
        ) : !draft.first ? null : !quote ? (
          <Skeleton style={{ height: 180 }} />
        ) : (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Money label={`Rental · ${daysText(quote.days)}`} value={naira(quote.rental_kobo)} />
            <Money label={`Deloo Protection (${Math.round(quote.protection_rate * 100)}%)`} value={naira(quote.protection_kobo)}
              hint="Damage cover for accidents during your rental. Your deposit is used first." />
            <WhatsCovered />
            <Money label={delivery === 'delivery' ? 'Delivery and collection' : 'Pickup'} value={delivery === 'delivery' ? naira(quote.delivery_kobo) : 'Free'} />
            <View style={[styles.divider, { backgroundColor: c.line }]} />
            <Money label="Refundable deposit" value={naira(quote.deposit_kobo)} hint="We send it back within 48 hours after we check the gear. Card refunds can take a few more working days to show." />
            <View style={[styles.divider, { backgroundColor: c.line }]} />
            <Money label="Total today" value={naira(quote.total_kobo)} strong />
            <Text variant="caption" tone="slate">
              Free cancellation up to 72 hours before your first day. Deloo Protection covers accidental damage, not careless loss or theft without a police report. By paying you agree to{' '}
              <Text variant="caption" tone="lagoon" accessibilityRole="link" onPress={() => Linking.openURL('https://deloo.space/terms').catch(() => {})}>Deloo’s rental terms</Text>.
            </Text>
          </View>
        )}
        {/* How to pay: chosen here, so Pay goes straight to Paystack on that method. */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text variant="label" tone="slate">PAY WITH</Text>
          <PayMethods value={method} onChange={(m) => { setMethod(m); setPayError(''); }} />
          <Text variant="caption" tone="slate">Paystack handles the payment securely. We hold your gear for 30 minutes while you pay.</Text>
        </View>
        {payError ? <Notice tone="problem">{payError}</Notice> : null}
        {help ? (
          <Pressable onPress={() => Linking.openURL(whatsappUrl(help, 'Hi Deloo, I have a question about a booking')).catch(() => {})} accessibilityRole="link" hitSlop={8}>
            <Text variant="label" tone="lagoon">Questions? Chat with us on WhatsApp</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.paper }]}>
        {!held && missing && quote ? <Text variant="caption" tone={touched ? 'red' : 'slate'}>{missing}</Text> : null}
        <Button
          title={held && hold ? `Continue to pay ${naira(hold.total_kobo)}` : quote ? `Pay ${naira(quote.total_kobo)}` : 'Pay'}
          loading={paying} disabled={held ? false : !quote || offline} onPress={pay} />
      </View>
    </SafeAreaView>
  );
}

function LineRow({ line, q, gone, held, days, onRemove, onFewer, onDays }: {
  line: DraftLine; q?: QuoteLine; gone: boolean; held: boolean; days: number; onRemove?: () => void; onFewer?: () => void; onDays: () => void;
}) {
  return (
    <View style={{ gap: 4, paddingVertical: space.xs }}>
      <View style={styles.row}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>{line.qty} × {q?.name ?? line.name}</Text>
        {q ? <Text variant="bodyStrong">{naira(q.rental_kobo)}</Text> : null}
      </View>
      {q ? <Text variant="caption" tone="slate">{naira(q.day_rate_kobo)} a day{line.qty > 1 ? ' each' : ''}{days ? ` × ${daysText(days)}` : ''} · deposit {naira(q.deposit_kobo)}</Text> : null}
      {gone ? <Badge label="No longer available" status="unavailable" />
        : q && !q.ok && !held ? <Badge label={q.free === 0 ? 'Not free on these days' : `Only ${q.free} free on these days`} status="unavailable" /> : null}
      {(gone || (q && !q.ok && !held)) ? (
        <View style={styles.actions}>
          {!gone ? <Button kind="quiet" title="Change days" onPress={onDays} /> : null}
          {onFewer && q ? <Button kind="quiet" title={`Book ${q.free}`} onPress={onFewer} /> : null}
          {onRemove ? <Button kind="quiet" title="Remove" onPress={onRemove} /> : null}
        </View>
      ) : onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${line.name}`}>
          <Text variant="label" tone="slate">Remove</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * "Your camera needs a lens": what the bag is missing to work (planner/complements kitGaps), with a
 * one-tap add. Options are counted on the bag's days, so only free gear is offered.
 */
function KitGaps({ lines, first, last, onAdd }: { lines: DraftLine[]; first?: string; last?: string; onAdd: (line: DraftLine, replaces?: string) => void }) {
  const c = useColors();
  const [shelf, setShelf] = useState<ShelfItem[] | null>(null);
  useEffect(() => {
    let live = true;
    // Suggestions only: if they can't load, the booking goes on without them.
    loadShelf(first, last).then((s) => { if (live) setShelf(s); }).catch(() => {});
    return () => { live = false; };
  }, [first, last]);
  const gaps = useMemo(() => (shelf ? kitGaps(lines, shelf.map(asGear)) : []), [shelf, lines]);
  if (!shelf || !gaps.length) return null;
  const byId = new Map(shelf.map((s) => [s.id, s]));

  return <>{gaps.map((g) => (
    <Notice key={g.key} tone="warning">
      <View style={{ gap: space.sm }}>
        <View style={{ gap: 2 }}>
          <Text variant="bodyStrong">{g.title}</Text>
          <Text variant="caption">{g.body}</Text>
        </View>
        {g.options.length ? g.options.map((o) => {
          const it = byId.get(o.itemId)!;
          return (
            <View key={o.itemId} style={[styles.row, styles.gapOption, { borderTopColor: c.line }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{it.name} · {naira(it.day_rate_kobo)}/day</Text>
                <Text variant="caption" tone="slate">{o.reason}</Text>
              </View>
              <Button kind="secondary" title={g.replaces ? 'Swap' : 'Add'} style={{ paddingHorizontal: space.lg }}
                accessibilityLabel={`${g.replaces ? 'Swap to' : 'Add'} ${it.name}`}
                onPress={() => onAdd({ itemId: it.id, name: it.name, qty: 1 }, g.replaces)} />
            </View>
          );
        }) : <Text variant="caption" tone="slate">None free on your days. Bring your own, or change your days.</Text>}
      </View>
    </Notice>
  ))}</>;
}

/** The calendar for the whole basket: a day is out if any item has fewer units free than needed. */
function DaysPicker({ lines, first, last, onChange }: { lines: DraftLine[]; first?: string; last?: string; onChange: (a: string, b: string) => void }) {
  const [blocked, setBlocked] = useState<{ unavailable: Set<string>; limited: Set<string> } | null>(null);
  const [error, setError] = useState('');
  const sig = lines.map((l) => `${l.itemId}x${l.qty}`).join(',');

  const load = useCallback(async () => {
    setError('');
    const today = lagosToday();
    try {
      const cals = await Promise.all(lines.map((l) => itemCalendar(l.itemId, addDays(today, 1), addDays(today, HORIZON)).then((days) => ({ l, days }))));
      const unavailable = new Set<string>(), limited = new Set<string>();
      for (const { l, days } of cals) for (const d of days) {
        if (d.free < l.qty) unavailable.add(d.day);
        else if (d.free < d.total) limited.add(d.day);
      }
      setBlocked({ unavailable, limited });
    } catch (e) { setError(isOffline(e) ? 'You’re offline. Days are checked live.' : 'Couldn’t load the calendar.'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  useEffect(() => { load(); }, [load]);

  if (error) return <Text variant="caption" tone="red">{error} <Text variant="caption" tone="lagoon" onPress={load}>Try again</Text></Text>;
  if (!blocked) return <Skeleton style={{ height: 280 }} />;
  return (
    <DateRangeCalendar first={first} last={last} unavailable={blocked.unavailable} limited={blocked.limited}
      months={4} maxDate={addDays(lagosToday(), HORIZON)} onChange={onChange} />
  );
}

function Money({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={[styles.row, { alignItems: 'baseline' }]}>
        <Text variant={strong ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>{label}</Text>
        <Text variant={strong ? 'heading' : 'bodyStrong'}>{value}</Text>
      </View>
      {hint ? <Text variant="caption" tone="slate">{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: -space.xl },
  note: { borderRadius: radius.md, padding: space.md },
  addMore: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', paddingTop: space.xs },
  gapOption: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
  footer: { gap: space.sm, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
