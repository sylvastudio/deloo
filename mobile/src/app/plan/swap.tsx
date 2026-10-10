import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { naira } from '@/lib/format';
import { lineTitle, needLabel } from '@/lib/line-text';
import { usePlan } from '@/lib/plan';
import { applyChoices, usePlanResult } from '@/lib/plan-result';
import type { AlternativeKind, Offer } from '@/planner/types';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/chip';
import { Notice, Skeleton } from '@/ui/feedback';
import { Text } from '@/ui/text';

const KIND: Record<AlternativeKind, string> = {
  other_vendor: 'Same thing, another listing', equivalent: 'Similar item', different_approach: 'A different way to do it', nearby_date: 'On other days',
};

const perDay = (offers: Offer[]) => offers.map((o) => `${naira(o.dayRateKobo, true)}/day`).join(' + ');

/** R8 Swap sheet: alternatives in PRD §4.3 order, each with a one-line trade-off and the price change. */
export default function Swap() {
  const c = useColors();
  const { line: key } = useLocalSearchParams<{ line: string }>();
  const { draft, update } = usePlan();
  const { matches } = usePlanResult(draft);
  const result = useMemo(() => (matches ? applyChoices(matches[draft.level], draft) : null), [matches, draft]);
  const l = result?.lines.find((x) => x.line.key === key);

  function choose(index?: number) {
    const swaps = { ...draft.swaps };
    if (index === undefined) delete swaps[key]; else swaps[key] = String(index);
    update({ swaps, removed: draft.removed.filter((k) => k !== key) });
    router.back();
  }
  function remove() {
    update({ removed: [...draft.removed.filter((k) => k !== key), key] });
    router.back();
  }

  if (!l) return <View style={styles.content}><Skeleton style={{ height: 24, width: '50%' }} /><Skeleton style={{ height: 64 }} /><Skeleton style={{ height: 64 }} /></View>;
  const current = l.swappedTo ? undefined : l.offers;

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: c.surface }}>
      <Text variant="heading" accessibilityRole="header">Swap {needLabel(l.line)}</Text>
      <Text variant="caption" tone="slate">{l.line.reason}</Text>

      {l.removed ? (
        <Button title="Add it back" onPress={() => choose(undefined)} />
      ) : (
        <Option
          title={lineTitle(l.line, l.offers)} sub={l.offers.length ? perDay(l.offers) : l.shortReason === 'not_stocked' ? 'We don’t have this yet' : 'Booked on your dates'}
          label={current ? 'Current choice' : 'Original choice'} selected={!!current} onPress={() => choose(undefined)}
          status={l.status}
        />
      )}

      {l.alternatives.length ? <Text variant="label" tone="slate">OTHER OPTIONS</Text> : (
        <Notice tone="tip">Nothing similar in our stock right now. We’ve noted your request so we know what to get next.</Notice>
      )}
      {l.alternatives.map((alt, i) => (
        <Option key={i} label={KIND[alt.kind]} title={alt.offers.length ? lineTitle(l.line, alt.offers) : alt.trade}
          sub={alt.offers.length ? `${perDay(alt.offers)} · ${alt.trade}` : undefined}
          price={alt.priceDeltaKobo} incomplete={!alt.complete}
          selected={draft.swaps[key] === String(i)} disabled={alt.kind === 'nearby_date'}
          onPress={() => (alt.kind === 'nearby_date' ? (router.back(), router.push('/plan/ask/when?edit=1')) : choose(i))} />
      ))}

      {!l.removed ? <>
        {l.line.essential ? <Notice tone="warning">Without this, {l.line.category === 'lens' ? 'the camera has no lens' : 'the shoot may not work as planned'}.</Notice> : null}
        <Button kind="quiet" title="Remove from setup" onPress={remove} />
      </> : null}
    </ScrollView>
  );
}

function Option({ label, title, sub, price, selected, onPress, status, incomplete, disabled }: {
  label: string; title: string; sub?: string; price?: number | null; selected?: boolean; onPress: () => void;
  status?: string; incomplete?: boolean; disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: !!selected }} android_ripple={{ color: c.lagoonTint }}
      style={[styles.option, { borderColor: selected ? c.lagoon : c.line, backgroundColor: selected ? c.lagoonTint : c.paper }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="lagoon">{label}</Text>
        <Text variant="bodyStrong">{title}</Text>
        {sub ? <Text variant="caption" tone="slate">{sub}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          {status === 'unavailable' ? <Badge label="Not available" status="unavailable" /> : null}
          {incomplete ? <Badge label="Covers part of it" status="limited" /> : null}
          {disabled ? <Badge label="Change the date" /> : null}
        </View>
      </View>
      {price != null ? <Text variant="label" tone={price > 0 ? 'ink' : 'lagoon'}>{price === 0 ? 'Same price' : `${price > 0 ? '+' : '−'}${naira(Math.abs(price), true)}`}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, overflow: 'hidden' },
});
