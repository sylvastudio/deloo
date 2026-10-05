"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string; email?: string } | undefined;

/** Turnstile token from the form (components/turnstile.tsx); Supabase checks it when CAPTCHA is on. */
function captcha(form: FormData) {
  const t = form.get("captcha");
  return typeof t === "string" && t ? t : undefined;
}
const CAPTCHA_FAILED = "Please complete the security check above, then try again.";
const isCaptcha = (e: { message?: string } | null) => !!e?.message && /captcha/i.test(e.message);
/** Supabase couldn't send an email (SMTP problem or rate limit). Never report "sent" when it wasn't. */
function mailError(e: { message?: string; status?: number } | null, what: string): string | null {
  if (!e) return null;
  console.error(`[auth] ${what} email failed:`, e.status, e.message);
  // Per-address cooldown: "For security purposes, you can only request this after 42 seconds."
  const wait = (e.message ?? "").match(/after (\d+) seconds?/i);
  if (wait) return `You just asked for an email. Wait ${wait[1]} seconds, then try again.`;
  if (e.status === 429 || /rate limit/i.test(e.message ?? "")) return "Deloo has sent a lot of emails in the last hour. Wait a few minutes, then try again.";
  return "We couldn't send the email just now. Try again in a few minutes. If it keeps happening, tell your Deloo contact.";
}

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email) return { error: "Add your email address.", email };
  const supabase = await createClient();

  if (form.get("mode") === "magic") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, captchaToken: captcha(form), emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${safeNext(form.get("next"))}` },
    });
    if (isCaptcha(error)) return { error: CAPTCHA_FAILED, email };
    // Unknown address (shouldCreateUser: false) comes back as a 4xx; sending failures as 429/5xx.
    if (error && ((error.status ?? 0) >= 500 || error.status === 429)) return { error: mailError(error, "sign-in link")!, email };
    if (error) return { error: "We couldn't send a link to that address. Check it, or sign in with your password.", email };
    return { notice: `Check ${email} for a sign-in link.`, email };
  }

  if (form.get("mode") === "reset") {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken: captcha(form), redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/reset-password`,
    });
    if (isCaptcha(error)) return { error: CAPTCHA_FAILED, email };
    const failed = mailError(error, "reset");
    if (failed) return { error: failed, email };
    // Same answer whether or not the address has an account, so the form can't be used to find members.
    return { notice: `If ${email} has a Deloo account, we've sent a link to choose a new password. Open it on this device.`, email };
  }

  if (!password) return { error: "Add your password, or get a sign-in link instead.", email };
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captcha(form) } });
  if (isCaptcha(error)) return { error: CAPTCHA_FAILED, email };
  if (error) return { error: "That email and password don't match.", email };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email) return { error: "Add your email address.", email };
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", email };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { captchaToken: captcha(form), emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/onboarding` },
  });
  if (isCaptcha(error)) return { error: CAPTCHA_FAILED, email };
  if (error && ((error.status ?? 0) >= 500 || error.status === 429)) return { error: mailError(error, "confirmation")!, email };
  if (error) return { error: error.message, email };
  if (!data.session) return { notice: `Check ${email} to confirm your address, then continue.`, email };
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
