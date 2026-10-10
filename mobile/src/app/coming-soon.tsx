import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { Notice } from '@/ui/feedback';
import type { IconName } from '@/ui/icon';
import { Field } from '@/ui/layout';
import { Text } from '@/ui/text';
import { Tile } from '@/ui/tile';
import { TopBar } from '@/ui/top-bar';

type Vertical = 'gear' | 'ad_space' | 'crew' | 'studio';
const VERTICALS: { key: Vertical; title: string; body: string; icon: IconName }[] = [
  { key: 'gear', title: 'Rent out your gear', body: 'Own cameras, lights or audio? List them on Deloo and earn when they’d sit idle.', icon: 'camera' },
  { key: 'ad_space', title: 'Ad space', body: 'Billboards, LED screens, mall and campus displays by the day or week.', icon: 'led_wall' },
  { key: 'crew', title: 'Media crew by the hour', body: 'Photographers, camera operators, livestream operators, sound engineers.', icon: 'camera_cat' },
  { key: 'studio', title: 'Studios', body: 'Podcast, photo and video studios by the hour.', icon: 'mic_cat' },
];

/** R29: interest lists for what's next. Waitlist rows tell us which to build first (PRD §4.9). */
export default function ComingSoon() {
  const c = useColors();
  const { city } = useLocalSearchParams<{ city?: string }>();
  const { profile, session } = useSession();
  const [vertical, setVertical] = useState<Vertical | null>(city ? null : 'gear');
  const [role, setRole] = useState<'buyer' | 'supplier'>('buyer');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function join() {
    setBusy(true); setError('');
    const contact = profile?.phone || session?.user.email || '';
    const { error: err } = await supabase.from('waitlist').insert({
      vertical: vertical ?? 'gear', name: profile?.full_name ?? 'Deloo user', contact, role: vertical === 'gear' ? 'supplier' : role,
      details: city ? `City: ${details.trim()}` : details.trim(),
    });
    setBusy(false);
    if (err) return setError('That didn’t send. Check your connection and try again.');
    setDone([...done, city ? 'city' : vertical ?? '']);
    setDetails('');
  }

  const joined = done.includes(city ? 'city' : vertical ?? '');

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={city ? 'Your city' : 'Coming soon'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {city ? <>
          <Text variant="title" accessibilityRole="header">We’re only in Lagos for now</Text>
          <Text tone="slate">Tell us your city. When enough people ask, we start there, and you’ll hear first.</Text>
          <Field label="Your city" value={details} onChangeText={setDetails} placeholder="e.g. Abuja, Port Harcourt, Ibadan" autoCapitalize="words" />
        </> : <>
          <Text variant="title" accessibilityRole="header">What’s next on Deloo</Text>
          <Text tone="slate">Join the list for what you need. We build what most people ask for first.</Text>
          {VERTICALS.map((v) => (
            <Tile key={v.key} icon={v.icon} title={v.title} description={v.body} selected={vertical === v.key} onPress={() => setVertical(v.key)} />
          ))}
          {vertical === 'gear' ? null : <View style={styles.wrap}>
            <Chip label="I want to book this" selected={role === 'buyer'} onPress={() => setRole('buyer')} />
            <Chip label="I can offer this" selected={role === 'supplier'} onPress={() => setRole('supplier')} />
          </View>}
          <Field label="Anything we should know?" value={details} onChangeText={setDetails} multiline placeholder={vertical === 'gear' ? 'e.g. Sony A7 III, two Godox lights, a RODE mic' : role === 'supplier' ? 'e.g. I have a podcast studio in Yaba' : 'e.g. A studio in Lekki for 3 hours'} hint="Optional." />
        </>}
        {joined ? <Notice tone="tip" icon="check">You’re on the list. We’ll tell you on WhatsApp.</Notice> : null}
        {error ? <Notice tone="problem">{error}</Notice> : null}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line }]}>
        <Button title={joined ? 'Added' : 'Join the list'} loading={busy} disabled={joined || (!!city && !details.trim())} onPress={join} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
