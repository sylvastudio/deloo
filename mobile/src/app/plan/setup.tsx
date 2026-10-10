import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { answerChips, assumedChips } from '@/lib/answers-text';
import { draftFromPlan, setBookingDraft } from '@/lib/booking-draft';
import { cachedSettings, checkFree, isOffline, loadSettings, plain, type Settings } from '@/lib/bookings';
import { naira } from '@/lib/format';
import { lagosToday } from '@/ui/date-range';
import { lineTitle, needLabel } from '@/lib/line-text';
import { itemPhotoUrl } from '@/lib/photos';
import { usePlan } from '@/lib/plan';
import {
  applyChoices, completeAnswers, PROTECTION_RATE, saveEvent, useNearestFree, usePlanResult, wantedItems, windowAnswers, windowLabel, type ChosenLine,
} from '@/lib/plan-result';
import { fitBudget, resolveAnswers, RULES_VERSION, type Choices, type FitResult } from '@/planner';
import type { Group, Level } from '@/planner/types';
import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge, Chip } from '@/ui/chip';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Segmented } from '@/ui/segmented';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

const GROUPS: [Group, string][] = [['camera', 'Cameras'], ['lens', 'Lenses'], ['light', 'Lighting'], ['audio', 'Audio'], ['grip', 'Grip & support']];
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

/** R6 Your setup (with R7 Why? inline and R9 Nothing available as an honest card). */
export default function Setup() {
  const c = useColors();
  const { draft, update, answer } = usePlan();
  const { setups, matches, datesKnown, error, retry } = usePlanResult(draft);
  const [open, setOpen] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [bookError, setBookError] = useState('');
  const [resumeId, setResumeId] = useState<string>();
  const [settings, setSettings] = useState<Settings | null>(cachedSettings);
  useEffect(() => { loadSettings().then(setSettings).catch(() => {}); }, []);
  const level = draft.level;
  const setup = setups.find((s) => s.level === level) ?? setups[1];
  const result = useMemo(() => (matches ? applyChoices(matches[level], draft) : null), [matches, level, draft]);
  const chips = [...answerChips(draft.answers, draft.aiKeys), ...assumedChips(draft.answers, resolveAnswers(completeAnswers(draft.answers)))];
  const when = typeof draft.answers.startsAt === 'string' && draft.answers.startsAt !== 'unsure' ? DAY.format(new Date(draft.answers.startsAt)) : null;
  // A saved plan whose date has come and gone: treat it as having no date (bookings start tomorrow).
  const first = result ? draftFromPlan(result, draft).first : undefined;
  const datePassed = !!first && first <= lagosToday();
  const hasDate = datesKnown && !datePassed;
  // Delivery and collection, both ways (as quote_booking prices it): the plan's area, or the cheapest.
  const area = typeof draft.answers.area === 'string' ? draft.answers.area.toLowerCase() : '';
  const zone = settings?.zones.find((z) => z.areas.some((a) => a.toLowerCase() === area));
  const deliveryFrom = zone ? zone.price_kobo * 2 : settings?.zones.length ? Math.min(...settings.zones.map((z) => z.price_kobo)) * 2 : null;
  const live = result?.lines.filter((l) => !l.removed && l.chosen.length) ?? [];

  // Save the event once (and record anything we couldn't supply) so Ops sees real demand.
  useEffect(() => {
    if (!matches || draft.eventId) return;
    saveEvent(draft, matches, RULES_VERSION).then((id) => { if (id) update({ eventId: id }); }).catch(() => { /* retried on next visit */ });
  }, [matches, draft, update]);

  const levels = (['good', 'better', 'best'] as Level[]).map((l) => ({
    value: l, label: l[0].toUpperCase() + l.slice(1),
    hint: matches ? naira(applyChoices(matches[l], { swaps: l === level ? draft.swaps : {}, removed: l === level ? draft.removed : [] }).totalKobo, true) : undefined,
  }));
  const missing = result?.lines.filter((l) => !l.removed && l.chosen.reduce((n, o) => n + o.units, 0) < l.line.qty) ?? [];
  // Say plainly which gaps are "we don't have this yet" and which are "booked on your dates".
  const notStocked = missing.filter((l) => !l.swappedTo && l.shortReason === 'not_stocked');
  const booked = missing.filter((l) => !notStocked.includes(l));

  // "Free if you shift a day": only when something is booked on these dates (not when we don't stock it).
  const wants = useMemo(() => (result && hasDate && booked.length && !notStocked.length ? wantedItems(result.lines) : null), [result, hasDate, booked.length, notStocked.length]);
  const shift = useNearestFree(wants, first, result?.match.days ?? 1);

  // "Fit my budget": the plan's own lines and alternatives only; Review re-quotes on the server.
  const [fitAsk, setFitAsk] = useState(false);
  const [fitText, setFitText] = useState('');
  const [fit, setFit] = useState<{ result: FitResult; before: Choices } | null>(null);
  const budgetKobo = draft.answers.budgetKobo;
  function runFit(kobo: number) {
    if (!matches || !(kobo > 0)) return;
    const before: Choices = { level, swaps: draft.swaps, removed: draft.removed };
    const r = fitBudget(matches, before, kobo);
    setFit({ result: r, before });
    setFitAsk(false);
    if (kobo !== budgetKobo) answer({ budgetKobo: kobo });
    if (r.changes.length) update({ level: r.level, swaps: r.swaps, removed: r.removed });
  }
  const typed = Math.round(Number(fitText.replace(/[^\d.]/g, '')) * (/k\s*$/i.test(fitText.trim()) ? 1000 : /m\s*$/i.test(fitText.trim()) ? 1e6 : 1)) * 100;

  const setRemoved = (key: string, removed: boolean) => {
    setBookError('');
    update({ removed: removed ? [...draft.removed.filter((k) => k !== key), key] : draft.removed.filter((k) => k !== key) });
  };

  // Ask the server before Review: the plan's stock count may be minutes old.
  async function book() {
    if (!result) return;
    const d = draftFromPlan(result, draft);
    if (!d.first || !d.last || !hasDate) { router.push('/plan/ask/when?edit=1'); return; }
    setChecking(true); setBookError(''); setResumeId(undefined);
    try {
      const r = await checkFree(d.lines, d.first, d.last);
      if (!r.ok) {
        setBookError(r.resumeBookingId || r.tooSoon ? r.message : `${r.message} Swap or remove it below, or try other days.`);
        setResumeId(r.resumeBookingId); retry(); return;
      }
    } catch (e) {
      setBookError(isOffline(e) ? 'You’re offline. Connect to check what’s free.' : plain(e, 'Couldn’t check what’s free. Try again.'));
      return;
    } finally { setChecking(false); }
    setBookingDraft(d);
    router.push('/book/review');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Your setup" right={
        <Pressable accessibilityRole="button" accessibilityLabel="Share to WhatsApp" hitSlop={8} onPress={() => router.push('/plan/share')}><Icon name="share" /></Pressable>
      } />
      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {chips.map((ch) => (
            <Pressable key={ch.key} onPress={() => router.push(`/plan/ask/${ch.q}?edit=1`)} accessibilityRole="button" accessibilityLabel={`${ch.label}. Change`}
              style={[styles.answer, { borderColor: c.line, backgroundColor: c.surface }]}>
              <Text variant="caption">{ch.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Segmented label="Setup level" value={level} options={levels} onChange={(l) => update({ level: l, swaps: {}, removed: [] })} />

        {error ? (
          <EmptyState icon="warning" title="Couldn’t check the gear" body={error} action="Try again" onAction={retry} />
        ) : !result ? (
          <View style={{ gap: space.md }}>
            <Skeleton style={{ height: 44, width: '60%' }} /><Skeleton style={{ height: 72 }} /><Skeleton style={{ height: 72 }} /><Skeleton style={{ height: 72 }} />
          </View>
        ) : <>
          <View style={{ gap: 2 }} accessible accessibilityLabel={`Total ${naira(result.totalKobo)}`}>
            <Text variant="hero">{naira(result.totalKobo)}</Text>
            <Text variant="caption" tone="slate">
              {naira(result.rentalKobo)} rental{result.match.days > 1 ? ` for ${result.match.days} days` : ''} · {naira(result.depositKobo)} refundable deposit · {naira(result.protectionKobo)} Deloo Protection ({Math.round(PROTECTION_RATE * 100)}%)
            </Text>
            <Text variant="caption" tone="slate">
              {deliveryFrom ? `Plus delivery and collection ${zone ? `to ${zone.name}` : 'from'} ${naira(deliveryFrom)}, or free pickup.` : 'Plus delivery, or free pickup.'}
            </Text>
          </View>

          <View style={styles.fitRow}>
            <Chip label={budgetKobo ? `Fit my budget · ${naira(budgetKobo, true)}` : 'Fit my budget'}
              onPress={() => (budgetKobo && !fitAsk ? runFit(budgetKobo) : setFitAsk(!fitAsk))} />
            {budgetKobo && !fitAsk ? <Pressable onPress={() => setFitAsk(true)} hitSlop={8} accessibilityRole="button"><Text variant="label" tone="lagoon">Change amount</Text></Pressable> : null}
          </View>
          {fitAsk ? (
            <View style={[styles.fitAsk, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Text variant="label">Most you want to spend on rental</Text>
              <View style={styles.fitRow}>
                <View style={[styles.amount, { borderColor: c.line, backgroundColor: c.paper }]}>
                  <Text variant="bodyStrong">₦</Text>
                  <TextInput value={fitText} onChangeText={setFitText} keyboardType="numeric" placeholder="100,000" placeholderTextColor={c.faint} autoFocus
                    style={[type.body, { flex: 1, color: c.ink, paddingVertical: 0 }]} accessibilityLabel="Budget in naira" returnKeyType="done" onSubmitEditing={() => runFit(typed)} />
                </View>
                <Button title="Fit" disabled={!(typed >= 100_000)} onPress={() => runFit(typed)} />
              </View>
            </View>
          ) : null}
          {fit && fit.result.level === level ? (
            <Notice tone={fit.result.fits ? 'tip' : 'warning'} icon={fit.result.fits ? 'check' : 'warning'}>
              <View style={{ gap: 4 }}>
                <Text variant="caption" style={{ fontWeight: '600' }}>
                  {!fit.result.changes.length && fit.result.fits ? `Already within ${naira(fit.result.budgetKobo, true)}. Nothing to change.`
                    : fit.result.fits ? `Rental is now ${naira(fit.result.rentalKobo, true)}, within your ${naira(fit.result.budgetKobo, true)}.`
                    : `The leanest we can do is ${naira(fit.result.rentalKobo, true)} rental, ${naira(fit.result.rentalKobo - fit.result.budgetKobo, true)} over your ${naira(fit.result.budgetKobo, true)}.`}
                </Text>
                {fit.result.changes.map((ch) => <Text key={ch} variant="caption">{ch}</Text>)}
                {fit.result.changes.length ? (
                  <Text variant="label" tone="lagoon" onPress={() => { update(fit.before); setFit(null); }} accessibilityRole="button">Undo</Text>
                ) : null}
              </View>
            </Notice>
          ) : null}

          {shift ? (
            <Pressable accessibilityRole="button" onPress={() => answer(windowAnswers(shift))}
              style={[styles.honest, { backgroundColor: c.lagoonTint, flexDirection: 'row', alignItems: 'center', gap: space.md }]}>
              <Icon name="calendar" color={c.lagoon} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>Everything is free {windowLabel(shift)}. <Text variant="bodyStrong" tone="lagoon">Switch?</Text></Text>
            </Pressable>
          ) : null}

          {!hasDate ? (
            <Notice tone="warning" icon="calendar">
              <Text variant="caption">{datePassed ? 'Your shoot date has passed. Pick a new one and we’ll check what’s free.' : 'Add your date and we’ll check what’s actually free.'} <Text variant="caption" tone="lagoon" onPress={() => router.push('/plan/ask/when?edit=1')}>{datePassed ? 'Change date →' : 'Add date →'}</Text></Text>
            </Notice>
          ) : null}

          {notStocked.length ? (
            <View style={[styles.honest, { backgroundColor: c.marigoldTint }]}>
              <Text variant="bodyStrong">We don’t have {notStocked.length === 1 ? 'this' : 'these'} yet</Text>
              <Text variant="caption">
                {notStocked.map((l) => needLabel(l.line)).join(', ')}. We’ve noted your request so we know what to get next. Swap it below or remove it.
              </Text>
            </View>
          ) : null}
          {booked.length ? (
            <View style={[styles.honest, { backgroundColor: c.redTint }]}>
              <Text variant="bodyStrong">{booked.length === 1 ? 'One thing is booked' : `${booked.length} things are booked`}{when ? ` on ${when}` : ' on your dates'}</Text>
              <Text variant="caption">
                {booked.map((l) => needLabel(l.line)).join(', ')}. Swap it below, try {level === 'best' ? 'Better' : 'another level'}, or pick other days.
              </Text>
              <Pressable onPress={() => router.push('/plan/ask/when?edit=1')} hitSlop={8}><Text variant="label" tone="lagoon">Try other days →</Text></Pressable>
            </View>
          ) : null}

          {setup.assumptions.length ? (
            <Notice tone="tip" icon="info">
              <View style={{ gap: 2 }}>{setup.assumptions.map((s) => <Text key={s} variant="caption">{s}</Text>)}</View>
            </Notice>
          ) : null}

          {GROUPS.map(([g, label]) => {
            const lines = result.lines.filter((l) => l.line.group === g);
            if (!lines.length) return null;
            return (
              <View key={g} style={{ gap: space.sm }}>
                <Text variant="label" tone="slate">{label.toUpperCase()}</Text>
                {lines.map((l) => <LineCard key={l.line.key} l={l} open={open === l.line.key} onToggle={() => setOpen(open === l.line.key ? null : l.line.key)} onRemove={(r) => setRemoved(l.line.key, r)} />)}
              </View>
            );
          })}

          {result.match.totals.technicianNote ? <Notice tone="tip" icon="wrench">{result.match.totals.technicianNote}</Notice> : null}
          {setup.notes.map((n) => <Notice key={n} tone="tip">{n}</Notice>)}
          <Text variant="caption" tone="faint">Sized with Deloo’s planning rules ({RULES_VERSION}). Prices are per day.</Text>
        </>}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.paper }]}>
        {bookError ? (
          <Text variant="caption" tone="red">
            {bookError}
            {resumeId ? <Text variant="caption" tone="lagoon" onPress={() => router.push({ pathname: '/book/pay', params: { booking: resumeId } })}> Resume payment →</Text> : null}
          </Text>
        ) : result && hasDate && !live.length ? <Text variant="caption" tone="slate">Everything is removed. Add something back to book.</Text> : null}
        <View style={styles.footerRow}>
          <Button kind="secondary" title="Share" style={{ flex: 1 }} onPress={() => router.push('/plan/share')} />
          <Button title={hasDate ? 'Book this setup' : datePassed ? 'Change your date' : 'Add your date'} style={{ flex: 2 }} loading={checking}
            disabled={!result || (hasDate && !live.length)} onPress={book} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function LineCard({ l, open, onToggle, onRemove }: { l: ChosenLine; open: boolean; onToggle: () => void; onRemove: (removed: boolean) => void }) {
  const c = useColors();
  const units = l.chosen.reduce((n, o) => n + o.units, 0);
  const status = l.removed ? null : units === 0 ? 'unavailable' : units < l.line.qty ? 'limited' : l.status;
  const price = l.chosen.reduce((s, o) => s + o.rentalKobo, 0);
  return (
    <View style={[styles.line, { backgroundColor: c.surface, borderColor: status === 'unavailable' ? c.red : c.line, opacity: l.removed ? 0.55 : 1 }]}>
      <View style={styles.lineTop}>
        {l.chosen[0]?.photo ? (
          <Image source={{ uri: itemPhotoUrl(l.chosen[0].photo) }} style={[styles.lineIcon, { backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }]}
            contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.lineIcon, { backgroundColor: c.lagoonTint }]}><Icon name={categoryIcon(l.line.category)} color={c.lagoon} /></View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{l.removed ? `Removed: ${needLabel(l.line)}` : lineTitle(l.line, l.chosen)}</Text>
          {l.chosen.length ? <Text variant="caption" tone="slate" numberOfLines={1}>{l.chosen.map((o) => `${naira(o.dayRateKobo, true)}/day`).join(' + ')}</Text> : null}
          <View style={styles.badges}>
            {status === 'available' ? <Badge label="Available" status="available" />
              : status === 'limited' ? <Badge label={units < l.line.qty ? `Only ${units} of ${l.line.qty} free` : 'Last one'} status="limited" />
              : status === 'unavailable' ? <Badge label={l.shortReason === 'not_stocked' && !l.swappedTo ? 'We don’t have this yet' : 'Booked on your dates'} status="unavailable" /> : null}
            {l.technicianRequired && !l.removed ? <Badge label="With technician" /> : null}
            {l.swappedTo ? <Badge label="Swapped" /> : null}
          </View>
        </View>
        {price ? <Text variant="bodyStrong">{naira(price, true)}</Text> : null}
      </View>
      {open ? <Text variant="caption" style={[styles.why, { backgroundColor: c.lagoonTint }]}>{l.line.reason}</Text> : null}
      {l.removed && l.line.essential ? (
        <Text variant="caption" tone="red">
          {l.line.category === 'camera' ? 'Without a camera, the lenses and gimbal have nothing to go on. Remove those too, or add it back.'
            : l.line.category === 'lens' ? 'Without a lens, the camera can’t shoot. Add it back unless you have your own.'
            : 'The shoot may not work as planned without this. Add it back unless you have your own.'}
        </Text>
      ) : null}
      <View style={styles.lineActions}>
        <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Text variant="label" tone="lagoon">{open ? 'Hide why' : 'Why?'}</Text>
        </Pressable>
        {!l.removed && (l.alternatives.length || l.swappedTo) ? (
          <Pressable onPress={() => router.push(`/plan/swap?line=${encodeURIComponent(l.line.key)}`)} hitSlop={8} accessibilityRole="button">
            <Text variant="label" tone="lagoon">{l.swappedTo ? 'Change' : 'Swap'}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => onRemove(!l.removed)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${l.removed ? 'Add back' : 'Remove'} ${needLabel(l.line)}`}>
          <Text variant="label" tone={l.removed ? 'lagoon' : 'slate'}>{l.removed ? 'Add back' : 'Remove'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  answer: { paddingHorizontal: space.md, minHeight: 32, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
  honest: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  line: { borderRadius: radius.lg, borderWidth: 1, padding: space.md, gap: space.sm },
  lineTop: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  lineIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  why: { padding: space.md, borderRadius: radius.md },
  lineActions: { flexDirection: 'row', gap: space.xl, paddingLeft: 56 },
  footer: { gap: space.sm, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  footerRow: { flexDirection: 'row', gap: space.md },
  fitRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fitAsk: { borderRadius: radius.lg, borderWidth: 1, padding: space.md, gap: space.sm },
  amount: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48 },
});
