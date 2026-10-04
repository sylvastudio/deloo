"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SetPassword() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (password.length < 8) return setError("Use at least 8 characters.");
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (error) return setError("Couldn't save that password. Try another.");
    router.push("/");
  }
  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="field"><label className="field-label" htmlFor="pw">New password</label>
        <input className="control" id="pw" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions stack-phone"><button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save and continue"}</button></div>
    </form>
  );
}
