import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { Field, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Web: a code was just sent. Kept for 15 minutes so that if the page reloads while the renter fetches
// the code from their email (WhatsApp's in-app browser often does), they land back on "Enter your code".
const SENT_KEY = 'deloo.signin.sent';
function sentTo(): string {
  try {
    const v = JSON.parse(localStorage.getItem(SENT_KEY) ?? 'null') as { email: string; at: number } | null;
    return v && Date.now() - v.at < 15 * 60_000 ? v.email : '';
  } catch { return ''; }
}

/**
 * Email one-time code for the demo (docs/native-app-plan.md §8). Phone OTP replaces it before the pilot.
 * The Supabase "Magic Link" and "Confirm signup" email templates must show {{ .Token }}.
 */
export default function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>(() => (sentTo() ? 'code' : 'email'));
  const [email, setEmail] = useState(sentTo);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<TextInput>(null);

  async function sendCode() {
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) return setError('Enter an email address like you@example.com');
    setError(''); setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) {
      const wait = err.message.match(/after (\d+) seconds?/i);
      return setError(wait ? `Wait ${wait[1]} seconds, then try again.` : err.status === 429 ? 'Too many emails just now. Try again in a few minutes.' : 'We couldn’t send the code. Check your connection and try again.');
    }
    setEmail(e); setStep('code');
    try { localStorage.setItem(SENT_KEY, JSON.stringify({ email: e, at: Date.now() })); } catch { /* private mode */ }
    setTimeout(() => codeRef.current?.focus(), 300);
  }

  async function verify(token = code) {
    if (token.length < 6) return setError('Enter the code from the email.');
    setError(''); setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    // On success the session provider reloads and the router moves on by itself.
    if (err) setError('That code didn’t work. Check it, or send a new one.');
    else { try { localStorage.removeItem(SENT_KEY); } catch { /* ignore */ } }
  }

  if (step === 'email') {
    return (
      <Screen
        edges={['top', 'bottom']}
        kicker="Sign in or sign up"
        title="What’s your email?"
        subtitle="We’ll send you a code. No password to remember."
        footer={<Button title="Send code" loading={busy} onPress={sendCode} />}>
        <Field
          label="Email" value={email} onChangeText={setEmail} error={error || undefined}
          autoFocus keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress"
          returnKeyType="send" onSubmitEditing={sendCode} placeholder="you@example.com"
        />
        <Pressable onPress={() => router.back()} hitSlop={12}><Text tone="lagoon" variant="label">Back</Text></Pressable>
      </Screen>
    );
  }

  return (
    <Screen
      edges={['top', 'bottom']}
      kicker="Check your email"
      title="Enter your code"
      subtitle={`We sent it to ${email}. It can take a minute to arrive.`}
      footer={<Button title="Continue" loading={busy} onPress={() => verify()} />}>
      <Field
        ref={codeRef} label="Code" value={code} error={error || undefined}
        onChangeText={(t) => { const d = t.replace(/\D/g, '').slice(0, 8); setCode(d); if (d.length === 6) verify(d); }}
        keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={8}
        placeholder="123456" style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
      />
      <View style={{ flexDirection: 'row', gap: space.xl }}>
        <Pressable onPress={() => { setCode(''); setError(''); setStep('email'); try { localStorage.removeItem(SENT_KEY); } catch { /* ignore */ } }} hitSlop={12}><Text tone="lagoon" variant="label">Change email</Text></Pressable>
        <Pressable onPress={sendCode} hitSlop={12} disabled={busy}><Text tone="lagoon" variant="label">Send a new code</Text></Pressable>
      </View>
      {Platform.OS === 'web' ? (
        <Text variant="caption" tone="slate">
          Opened this from WhatsApp? Copy the code from your email, then come back to this page. If it keeps reloading, open app.deloo.space in Chrome or Safari.
        </Text>
      ) : null}
    </Screen>
  );
}
