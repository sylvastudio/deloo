import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { answerChips } from '@/lib/answers-text';
import { DELIVERY_KOBO, highestTier, lockedTechnician, partsFromResult, setPendingBooking } from '@/lib/booking-draft';
import type { DemoVendorPart } from '@/lib/demo-bookings';
import { naira } from '@/lib/format';
import { usePlan } from '@/lib/plan';
import { applyChoices, usePlanResult } from '@/lib/plan-result';
import { useSession } from '@/lib/session';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge, Chip } from '@/ui/chip';
import { Notice, Skeleton } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

const TIER_NAME = ['', 'small gear', 'sound systems and cameras', 'LED walls and full production'];

/** R15 Review booking (with the R16 verification gate inline). One booking per owner. */
export default function Review() {
  const c = useColors();
  const { draft } = usePlan();
  const { profile } = useSession();
  const { matches } = usePlanResult(draft);
  const result = useMemo(() => (matches ? applyChoices(matches[draft.level], draft) : null), [matches, draft]);
  const [parts, setParts] = useState<DemoVendorPart[] | null>(null);
  useEffect(() => { if (result && !parts) setParts(partsFromResult(result)); }, [result, parts]);

  const tier = result ? highestTier(result) : 1;
  const verified = (profile?.trust_level ?? 0) >= tier;
  const [demoVerified, setDemoVerified] = useState(false);
  const deliveryKobo = (parts ?? []).filter((p) => p.delivery === 'delivery').length * DELIVERY_KOBO;
  const total = result ? result.totalKobo + deliveryKobo : 0;
  const missing = result?.lines.filter((l) => !l.removed && l.chosen.reduce((n, o) => n + o.units, 0) < l.line.qty).length ?? 0;

  function setPart(id: string, patch: Partial<DemoVendorPart>) {
    setParts((ps) => ps?.map((p) => (p.vendorId === id ? { ...p, ...patch } : p)) ?? null);
  }
  function toPay() {
    if (!result || !parts) return;
    setPendingBooking({
      title: answerChips(draft.answers).slice(0, 2).map((x) => x.label).join(' · ') || 'Your event',
      startsAt: typeof draft.answers.startsAt === 'string' ? draft.answers.startsAt : undefined,
      endsAt: typeof draft.answers.endsAt === 'string' ? draft.answers.endsAt : undefined,
      area: typeof draft.answers.area === 'string' ? draft.answers.area : undefined,
      parts, deliveryKobo, protectionKobo: result.protectionKobo, totalKobo: total, holdUntil: Date.now() + 30 * 60_000,
    });
    router.push('/book/pay');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Review booking" />
      <ScrollView contentContainerStyle={styles.content}>
        <Badge label="Demo: no real money moves" status="limited" />
        {!result || !parts ? <><Skeleton style={{ height: 120 }} /><Skeleton style={{ height: 120 }} /></> : <>
          {missing ? <Notice tone="warning">{missing === 1 ? 'One item isn’t free' : `${missing} items aren’t free`}. You’ll book what is, and can find the rest later.</Notice> : null}
          {parts.map((p) => {
            const locked = lockedTechnician(result, p.vendorId);
            return (
              <View key={p.vendorId} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
                <View style={styles.vendorRow}>
                  <Icon name="shield" size={18} color={c.green} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>{p.vendorName}</Text>
                  <Text variant="label">{naira(p.rentalKobo, true)}</Text>
                </View>
                {p.items.map((it) => <Text key={it.title} variant="caption" tone="slate">• {it.title}</Text>)}
                <View style={styles.chips}>
                  <Chip label="Delivery" selected={p.delivery === 'delivery'} onPress={() => setPart(p.vendorId, { delivery: 'delivery' })} />
                  <Chip label="I’ll pick up" selected={p.delivery === 'pickup'} onPress={() => setPart(p.vendorId, { delivery: 'pickup' })} />
                </View>
                {p.delivery === 'delivery' ? <Text variant="caption" tone="slate">Delivery about {naira(DELIVERY_KOBO)}, confirmed by the owner.</Text> : null}
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text>Technician to set up and run it</Text>
                    <Text variant="caption" tone="slate">{locked ? 'Required: this gear always comes with the owner’s technician.' : 'The owner’s staff. Price confirmed by the owner.'}</Text>
                  </View>
                  <Switch value={p.technician || locked} disabled={locked} onValueChange={(v) => setPart(p.vendorId, { technician: v })} trackColor={{ true: c.lagoon }} />
                </View>
              </View>
            );
          })}

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Row label="Rental" value={naira(result.rentalKobo)} />
            {deliveryKobo ? <Row label="Delivery" value={naira(deliveryKobo)} /> : null}
            <Row label="Deloo Protection" value={naira(result.protectionKobo)} hint="Covers repairs beyond the deposit, up to a limit." />
            <Row label="Refundable deposit" value={naira(result.depositKobo)} hint="Back within 24 hours of a clean return." />
            <View style={[styles.divider, { backgroundColor: c.line }]} />
            <Row label="Total today" value={naira(total)} strong />
            <Text variant="caption" tone="slate">Free cancellation until 72 hours before your event.</Text>
          </View>

          {!verified && !demoVerified ? (
            <View style={[styles.card, { backgroundColor: c.marigoldTint, borderColor: c.marigoldTint }]}>
              <Text variant="bodyStrong">Verify your identity first</Text>
              <Text variant="caption">To rent {TIER_NAME[tier]}, we check your NIN or BVN and take a quick selfie. It takes about 2 minutes and protects you and the owner.</Text>
              <Button kind="secondary" title="Continue in demo (skip check)" onPress={() => setDemoVerified(true)} />
            </View>
          ) : null}
        </>}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line }]}>
        <Button title="Continue to pay" disabled={!result || !parts || (!verified && !demoVerified) || total === 0} onPress={toPay} />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.row}>
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
  vendorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
