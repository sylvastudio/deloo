import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError } from '@/lib/api';
import { CATEGORY_META } from '@/lib/catalog';
import { naira } from '@/lib/format';
import { takePhoto, uploadItemPhoto, type Photo } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Badge, Chip } from '@/ui/chip';
import { Notice } from '@/ui/feedback';
import { categoryIcon, Icon } from '@/ui/icon';
import { Field } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TopBar } from '@/ui/top-bar';

type SpecField = { key: string; label: string; type: 'number' | 'boolean' | 'text'; unit?: string; options?: string[] };
type Suggestion = { category: string | null; brand: string; model: string; name: string; specs: Record<string, string | number | boolean>; confidence: 'high' | 'medium' | 'low'; note: string };
type Step = 'photo' | 'reading' | 'details' | 'price' | 'units';

const TIER_2 = 500_000, TIER_3 = 3_000_000; // naira, same thresholds as items.risk_tier (0007)

/**
 * V6 snap a photo → V7 confirm what the AI thinks it is → V8 price and deposit → V9 how many.
 * The AI only suggests; the vendor confirms every field. Works without AI (manual form).
 */
export default function AddGear() {
  const c = useColors();
  const { vendors } = useSession();
  const vendor = vendors[0];
  const [step, setStep] = useState<Step>('photo');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [hint, setHint] = useState('');
  const [confidence, setConfidence] = useState<Suggestion['confidence'] | null>(null);
  const [schemas, setSchemas] = useState<Record<string, SpecField[]>>({});
  const [category, setCategory] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [rate, setRate] = useState('');
  const [deposit, setDeposit] = useState('');
  const [value, setValue] = useState('');
  const [technician, setTechnician] = useState(false);
  const [count, setCount] = useState(1);
  const [serials, setSerials] = useState<string[]>([]);
  const [market, setMarket] = useState<{ low: number; high: number; n: number } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('categories').select('key, spec_schema').then(({ data }) => {
      setSchemas(Object.fromEntries((data ?? []).map((r) => [r.key, (r.spec_schema as { fields: SpecField[] }).fields])));
    });
  }, []);

  // "Similar gear in Lagos rents for ₦20k–₦28k" from the public catalogue.
  useEffect(() => {
    if (!category) return;
    supabase.from('items').select('day_rate_kobo').eq('category_key', category).eq('active', true).then(({ data }) => {
      const rates = (data ?? []).map((r) => r.day_rate_kobo).sort((a, b) => a - b);
      setMarket(rates.length >= 2 ? { low: rates[Math.floor(rates.length * 0.2)], high: rates[Math.ceil(rates.length * 0.8) - 1], n: rates.length } : null);
    });
  }, [category]);

  const valueNaira = Number(value.replace(/\D/g, '')) || 0;
  const tier = valueNaira >= TIER_3 ? 3 : valueNaira >= TIER_2 ? 2 : 1;
  useEffect(() => { if (tier === 3) setTechnician(true); }, [tier]);

  async function snap(source: 'camera' | 'library') {
    setError('');
    try {
      const p = await takePhoto(source);
      if (!p) return;
      setPhoto(p);
      setStep('reading');
      try {
        const s = await api<Suggestion>('/api/gear/suggest', { image: p.base64 });
        setCategory(s.category); setName(s.name); setBrand(s.brand); setModel(s.model); setConfidence(s.confidence); setHint(s.note);
        setSpecs(Object.fromEntries(Object.entries(s.specs).map(([k, v]) => [k, String(v)])));
      } catch (e) {
        setHint(e instanceof ApiError ? e.message : 'We couldn’t read the photo. Fill it in yourself.');
        setConfidence(null);
      }
      setStep('details');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const fields = useMemo(() => (category ? schemas[category] ?? [] : []), [category, schemas]);

  function next() {
    setError('');
    if (step === 'details') {
      if (!category) return setError('Choose what kind of gear this is.');
      if (!name.trim()) return setError('Give it a name renters will understand.');
      return setStep('price');
    }
    if (step === 'price') {
      if (!(Number(rate.replace(/\D/g, '')) > 0)) return setError('Add a day rate.');
      if (!valueNaira) return setError('Add what it would cost to replace. It sets how much renters are checked.');
      return setStep('units');
    }
    if (step === 'units') save();
  }

  async function save() {
    if (!vendor || !category || !photo) return;
    setSaving(true); setError('');
    try {
      const path = await uploadItemPhoto(vendor.id, photo);
      const typed = Object.fromEntries(fields.flatMap((f) => {
        const v = specs[f.key];
        if (v == null || v === '') return [];
        return [[f.key, f.type === 'number' ? Number(v) : f.type === 'boolean' ? v === 'true' : v]];
      }));
      const { data: item, error: e1 } = await supabase.from('items').insert({
        vendor_id: vendor.id, category_key: category, name: name.trim(), brand: brand.trim(), model: model.trim(), specs: typed,
        day_rate_kobo: Number(rate.replace(/\D/g, '')) * 100, deposit_kobo: (Number(deposit.replace(/\D/g, '')) || 0) * 100,
        replacement_value_kobo: valueNaira * 100, technician_required: technician || tier === 3, photos: [path],
      }).select('id').single();
      if (e1 || !item) throw new Error('Saving didn’t work. Try again.');
      const { error: e2 } = await supabase.from('units').insert(
        Array.from({ length: count }, (_, i) => ({ item_id: item.id, serial: serials[i]?.trim() ?? '', condition: 'Good' })),
      );
      if (e2) throw new Error('The item saved, but not its units. Open it from your gear list to add them.');
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const stepNo = { photo: 1, reading: 1, details: 2, price: 3, units: 4 }[step];
  const footer = step === 'photo' || step === 'reading' ? null : (
    <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.paper }]}>
      {error ? <Text variant="caption" tone="red" accessibilityRole="alert">{error}</Text> : null}
      <Button title={step === 'units' ? `Add ${count} to my gear` : 'Continue'} loading={saving} onPress={next} />
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar steps={{ current: stepNo, total: 4 }} onBack={() => {
        setError('');
        if (step === 'details') setStep('photo'); else if (step === 'price') setStep('details'); else if (step === 'units') setStep('price'); else router.back();
      }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'photo' && <>
          <Text variant="title" accessibilityRole="header">Snap your gear</Text>
          <Text tone="slate">One clear photo of the whole item. We’ll suggest what it is, so you only check the details.</Text>
          <Pressable onPress={() => snap('camera')} accessibilityRole="button" accessibilityLabel="Take a photo"
            style={[styles.snap, { backgroundColor: c.lagoonTint, borderColor: c.lagoon }]} android_ripple={{ color: c.lagoon + '33' }}>
            <View style={[styles.snapIcon, { backgroundColor: c.lagoon }]}><Icon name="camera" size={32} color={c.onLagoon} /></View>
            <Text variant="heading" tone="lagoon">Take a photo</Text>
          </Pressable>
          <Button kind="secondary" title="Choose from your photos" onPress={() => snap('library')} />
          <Notice tone="tip">Good light, the whole item in the frame, logo facing you. Clean gear rents faster.</Notice>
          {error ? <Notice tone="problem">{error}</Notice> : null}
        </>}

        {step === 'reading' && (
          <View style={styles.reading}>
            {photo ? <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" /> : null}
            <ActivityIndicator color={c.lagoon} />
            <Text tone="slate">Looking at your photo…</Text>
          </View>
        )}

        {step === 'details' && <>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.previewSmall} contentFit="cover" accessibilityLabel="Your photo" /> : null}
          <Text variant="title" accessibilityRole="header">{confidence ? 'Is this right?' : 'What is it?'}</Text>
          {confidence ? (
            <View style={{ gap: space.sm }}>
              <Badge label={confidence === 'high' ? 'Read from the label' : confidence === 'medium' ? 'Our best guess' : 'Not sure: please check'} status={confidence === 'high' ? 'available' : 'limited'} />
              {hint ? <Text variant="caption" tone="slate">{hint}</Text> : null}
            </View>
          ) : hint ? <Notice tone="warning">{hint}</Notice> : null}
          <Text variant="label">Kind of gear</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {Object.entries(CATEGORY_META).map(([k, m]) => (
              <Chip key={k} label={m.label} selected={category === k} onPress={() => setCategory(k)} />
            ))}
          </ScrollView>
          <Field label="Name renters will see" value={name} onChangeText={setName} placeholder="e.g. Sony FX3 cinema camera" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Field label="Brand" value={brand} onChangeText={setBrand} placeholder="JBL" /></View>
            <View style={{ flex: 1 }}><Field label="Model" value={model} onChangeText={setModel} placeholder="EON715" autoCapitalize="characters" /></View>
          </View>
          {fields.map((f) => f.type === 'boolean' ? (
            <View key={f.key} style={styles.switchRow}>
              <Text style={{ flex: 1 }}>{f.label}</Text>
              <Switch value={specs[f.key] === 'true'} onValueChange={(v) => setSpecs({ ...specs, [f.key]: String(v) })} trackColor={{ true: c.lagoon }} />
            </View>
          ) : f.options ? (
            <View key={f.key} style={{ gap: space.sm }}>
              <Text variant="label">{f.label}</Text>
              <View style={styles.wrap}>{f.options.map((o) => <Chip key={o} label={o.replace('_', ' ')} selected={specs[f.key] === o} onPress={() => setSpecs({ ...specs, [f.key]: o })} />)}</View>
            </View>
          ) : (
            <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`} value={specs[f.key] ?? ''} keyboardType={f.type === 'number' ? 'decimal-pad' : 'default'}
              onChangeText={(t) => setSpecs({ ...specs, [f.key]: t })} hint={f.key === 'watts' ? 'From the back plate or the manual.' : undefined} />
          ))}
        </>}

        {step === 'price' && <>
          <View style={styles.titleRow}><Icon name={category ? categoryIcon(category) : 'sparkles'} size={28} color={c.lagoon} /><Text variant="title" style={{ flex: 1 }} numberOfLines={2}>{name}</Text></View>
          <Field label="Day rate (₦)" value={rate} onChangeText={(t) => setRate(t.replace(/[^\d,]/g, ''))} keyboardType="number-pad" placeholder="25,000"
            hint={market ? `Similar gear on Deloo rents for ${naira(market.low, true)}–${naira(market.high, true)} a day.` : 'What you’d charge for one day.'} />
          <Field label="Deposit (₦)" value={deposit} onChangeText={(t) => setDeposit(t.replace(/[^\d,]/g, ''))} keyboardType="number-pad" placeholder="50,000"
            hint="Refunded to the renter after a clean return. Covers small damage." />
          <Field label="What it would cost to replace (₦)" value={value} onChangeText={(t) => setValue(t.replace(/[^\d,]/g, ''))} keyboardType="number-pad" placeholder="950,000"
            hint="Only used to decide how much we check renters. Never shown to them." />
          {valueNaira > 0 ? (
            <Notice tone={tier === 3 ? 'warning' : 'tip'} icon="shield">
              {tier === 1 ? 'Renters verify their ID before booking this.' : tier === 2 ? 'Renters verify their ID and address, and pay a larger deposit or bring a guarantor.' : 'High-value gear: it only goes out with your technician, who sets it up and runs it.'}
            </Notice>
          ) : null}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text>Comes with our technician</Text>
              <Text variant="caption" tone="slate">{tier === 3 ? 'Required for gear worth ₦3m or more.' : 'Your staff set it up and run it.'}</Text>
            </View>
            <Switch value={technician || tier === 3} disabled={tier === 3} onValueChange={setTechnician} trackColor={{ true: c.lagoon }} />
          </View>
          <Text variant="caption" tone="slate">Deloo’s commission is taken from each payout and shown on every booking. You set the price renters see.</Text>
        </>}

        {step === 'units' && <>
          <Text variant="title" accessibilityRole="header">How many do you have?</Text>
          <View style={[styles.stepper, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="One fewer" onPress={() => setCount(Math.max(1, count - 1))} style={styles.stepBtn} hitSlop={8}><Icon name="minus" /></Pressable>
            <Text variant="number" accessibilityLiveRegion="polite">{count}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="One more" onPress={() => setCount(Math.min(50, count + 1))} style={styles.stepBtn} hitSlop={8}><Icon name="plus" /></Pressable>
          </View>
          <Text tone="slate">Renters can book them separately. Serial numbers help prove which unit went out{tier >= 2 ? ' and are needed for this value of gear before the pilot' : ''}.</Text>
          {Array.from({ length: Math.min(count, 12) }, (_, i) => (
            <Field key={i} label={`Unit ${i + 1} serial`} value={serials[i] ?? ''} autoCapitalize="characters"
              onChangeText={(t) => { const s = [...serials]; s[i] = t; setSerials(s); }} placeholder="Optional for now" />
          ))}
        </>}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  snap: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.xl, paddingVertical: space.xxl, alignItems: 'center', gap: space.md, overflow: 'hidden' },
  snapIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  reading: { alignItems: 'center', gap: space.lg, paddingTop: space.xl },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  previewSmall: { width: '100%', height: 180, borderRadius: radius.lg },
  row: { flexDirection: 'row', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, minHeight: 72 },
  stepBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
