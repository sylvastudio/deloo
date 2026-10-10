"use client";
import { useActionState, useState } from "react";
import { Turnstile } from "@/components/turnstile";
import { signIn, type AuthState } from "./actions";

/** Staff sign-in for the admin portal. Renters sign in inside the app (app.deloo.space or the APK). */
export function AuthForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  const [mode, setMode] = useState<"password" | "magic" | "reset">("password");
  const magic = mode === "magic", reset = mode === "reset";
  return (
    <form action={action} className="solo-step" noValidate>
      <p className="kicker">Deloo team</p>
      <h1 className="h1">{reset ? "Choose a new password" : "Sign in to Deloo"}</h1>
      {linkError && !state && <p className="notice" role="status">That email link has expired or was already used. Each link works once. Request a new one below.</p>}
      {reset && <p className="hint" style={{ fontSize: 15 }}>We&apos;ll email you a link. Open it on this device to set a new password.</p>}
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next ?? "/admin"} />
      <div className="field">
        <label className="field-label" htmlFor="email">Email</label>
        <input className="control" id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} aria-invalid={!!state?.error && !state.email} />
      </div>
      {!magic && !reset && (
        <div className="field">
          <label className="field-label" htmlFor="password">Password</label>
          <input className="control" id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
        </div>
      )}
      <Turnstile resetSignal={state} />
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.notice && <p className="notice" role="status">{state.notice}</p>}
      <div className="actions stack-phone">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Working…" : reset ? "Email me a reset link" : magic ? "Email me a sign-in link" : "Sign in"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setMode(mode === "password" ? "magic" : "password")}>
          {mode === "password" ? "Email me a link instead" : "Use my password"}
        </button>
        {mode === "password" && (
          <button type="button" className="btn btn-quiet" onClick={() => setMode("reset")}>Forgot password?</button>
        )}
      </div>
      <p className="hint" style={{ fontSize: 14 }}>
        This sign-in is for the Deloo team. Renting gear? <a href="https://app.deloo.space">Open the Deloo app</a>.
      </p>
    </form>
  );
}
