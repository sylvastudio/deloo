"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export function AuthForm({ kind, next }: { kind: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(kind === "login" ? signIn : signUp, undefined);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const magic = kind === "login" && mode === "magic";
  return (
    <form action={action} className="solo-step" noValidate>
      <p className="kicker">{kind === "login" ? "Welcome back" : "Create your account"}</p>
      <h1 className="h1">{kind === "login" ? "Sign in to Deloo" : "Set up Deloo for your organisation"}</h1>
      {kind === "signup" && <p className="hint" style={{ fontSize: 15 }}>You&apos;ll be the admin. Next, Deloo asks four quick questions about your organisation.</p>}
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next ?? "/"} />
      <div className="field">
        <label className="field-label" htmlFor="email">Email</label>
        <input className="control" id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} aria-invalid={!!state?.error && !state.email} />
      </div>
      {!magic && (
        <div className="field">
          <label className="field-label" htmlFor="password">Password</label>
          <input className="control" id="password" name="password" type="password" autoComplete={kind === "login" ? "current-password" : "new-password"} required minLength={8} />
          {kind === "signup" && <p className="hint">At least 8 characters.</p>}
        </div>
      )}
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.notice && <p className="notice" role="status">{state.notice}</p>}
      <div className="actions stack-phone">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Working…" : kind === "signup" ? "Create account" : magic ? "Email me a sign-in link" : "Sign in"}
        </button>
        {kind === "login" && (
          <button type="button" className="btn btn-quiet" onClick={() => setMode(magic ? "password" : "magic")}>
            {magic ? "Use my password" : "Email me a link instead"}
          </button>
        )}
      </div>
      <p className="hint" style={{ fontSize: 14 }}>
        {kind === "login" ? <>New to Deloo? <Link href="/signup">Create an account</Link>. Invited by your HQ? Use the link in your email.</> : <>Already have an account? <Link href="/login">Sign in</Link>.</>}
      </p>
    </form>
  );
}
