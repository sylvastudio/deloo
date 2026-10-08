import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LAGOS_AREAS } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { Field, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import { Tile } from '@/ui/tile';

type Intent = 'rent' | 'gear' | 'both';
const VENDOR_TYPES = [
  ['company', 'Rental company', 'You rent out equipment as a business.', '🏢'],
  ['church', 'Church or ministry', 'Your church’s gear is free on some days.', '⛪'],
  ['individual', 'Individual owner', 'Videographer, DJ, sound engineer…', '🎧'],
] as const;

/** Name and phone → what brings you here → (if gear) who's renting it out. Same rules as the web (0007 RLS). */
export default function Onboarding() {
  const c = useColors();
  const { session, refresh } = useSession();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [vendorType, setVendorType] = useState<(typeof VENDOR_TYPES)[number][0] | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [technician, setTechnician] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const gear = intent === 'gear' || intent === 'both';
  const steps = gear ? 3 : 2;

  async function finish() {
    if (!session) return;
    setBusy(true); setError('');
    const fields = { full_name: name.trim(), phone: phone.trim(), wants_to_rent: intent !== 'gear', has_gear: gear };
    // Insert, or update if an earlier attempt got this far (not upsert: users may not write `id`).
    let { error: err } = await supabase.from('profiles').insert({ id: session.user.id, ...fields });
    if (err?.code === '23505') ({ error: err } = await supabase.from('profiles').update(fields).eq('id', session.user.id));
    if (!err && gear) {
      const { data: mine } = await supabase.from('vendor_members').select('vendor_id').eq('user_id', session.user.id).limit(1);
      if (!mine?.length) {
        ({ error: err } = await supabase.rpc('create_vendor', {
          vendor_name: vendorName.trim(), kind: vendorType, vendor_areas: areas, vendor_phone: phone.trim(), delivery: false, technician,
        }));
      }
    }
    setBusy(false);
    if (err) return setError('Setup didn’t finish. Check your connection and try again.');
    await refresh(); // the router moves on once the profile exists
  }

  function next() {
    setError('');
    if (step === 1) {
      if (!name.trim()) return setError('Add your name.');
      if (phone.replace(/\D/g, '').length < 10) return setError('Add a phone number we can call or WhatsApp.');
    }
    if (step === 2 && !intent) return setError('Choose one to continue.');
    if (step === 3) {
      if (!vendorName.trim()) return setError('Add the name renters will see.');
      if (!vendorType) return setError('Choose what kind of owner you are.');
    }
    if (step < steps) return setStep(step + 1);
    finish();
  }

  const progress = (
    <View style={[styles.track, { backgroundColor: c.line }]} accessibilityLabel={`Step ${step} of ${steps}`}>
      <View style={[styles.bar, { backgroundColor: c.lagoon, width: `${(step / steps) * 100}%` }]} />
    </View>
  );
  const footer = (
    <View style={{ gap: space.sm }}>
      {error ? <Text variant="caption" tone="red" accessibilityRole="alert">{error}</Text> : null}
      <Button title={step < steps ? 'Continue' : 'Finish'} loading={busy} onPress={next} />
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']} footer={footer}>
      <View style={styles.topRow}>
        {step > 1 ? <Pressable onPress={() => setStep(step - 1)} hitSlop={12}><Text tone="lagoon" variant="label">Back</Text></Pressable> : <View />}
        {progress}
      </View>

      {step === 1 && <>
        <Text variant="title" accessibilityRole="header">What should we call you?</Text>
        <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" autoFocus />
        <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber"
          placeholder="0803 123 4567" hint="For booking updates and on the day of your event." />
      </>}

      {step === 2 && <>
        <Text variant="title" accessibilityRole="header">What brings you here?</Text>
        <Tile emoji="🎤" title="Plan an event" description="Tell us about it and we’ll recommend the sound, screens and power you need." selected={intent === 'rent'} onPress={() => setIntent('rent')} />
        <Tile emoji="📦" title="Rent out my gear" description="List your equipment and get bookings for the days it’s free." selected={intent === 'gear'} onPress={() => setIntent('gear')} />
        <Pressable onPress={() => setIntent('both')} hitSlop={8} accessibilityRole="radio" accessibilityState={{ checked: intent === 'both' }}>
          <Text tone={intent === 'both' ? 'lagoon' : 'slate'} variant="label">{intent === 'both' ? '✓ ' : ''}I do both</Text>
        </Pressable>
      </>}

      {step === 3 && <>
        <Text variant="title" accessibilityRole="header">Who’s renting it out?</Text>
        <Field label="Name renters will see" value={vendorName} onChangeText={setVendorName} placeholder="e.g. Sound City Rentals" autoCapitalize="words" />
        {VENDOR_TYPES.map(([k, title, desc, emoji]) => (
          <Tile key={k} emoji={emoji} title={title} description={desc} selected={vendorType === k} onPress={() => setVendorType(k)} />
        ))}
        <Text variant="label">Areas you serve <Text variant="caption" tone="faint">optional</Text></Text>
        <View style={styles.wrap}>
          {LAGOS_AREAS.map((a) => (
            <Chip key={a} label={a} selected={areas.includes(a)} onPress={() => setAreas(areas.includes(a) ? areas.filter((x) => x !== a) : [...areas, a])} />
          ))}
        </View>
        <Tile multi emoji="🧑‍🔧" title="We send a technician" description="Your staff set up and run the gear. Needed for LED walls and other high-value gear."
          selected={technician} onPress={() => setTechnician(!technician)} />
        <Text variant="caption" tone="slate">Deloo checks every owner before their gear goes live. We’ll call you about it.</Text>
      </>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, minHeight: 32 },
  track: { height: 4, width: 96, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: 4, borderRadius: radius.pill },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
