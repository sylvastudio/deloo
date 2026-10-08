"use client";
import { useActionState } from "react";
import { saveProfile, type SaveState } from "./actions";

export function ProfileForm({ fullName, phone, wantsToRent }: { fullName: string; phone: string; wantsToRent: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProfile, undefined);
  return (
    <form action={action} className="grid gap-3" noValidate>
      <div className="field"><label className="field-label" htmlFor="full_name">Your name</label>
        <input className="control" id="full_name" name="full_name" autoComplete="name" defaultValue={fullName} /></div>
      <div className="field"><label className="field-label" htmlFor="phone">Phone number</label>
        <input className="control" id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={phone} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="wants_to_rent" defaultChecked={wantsToRent} /> I rent equipment for events</label>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.notice && <p className="hint" role="status">{state.notice}</p>}
      <div className="actions stack-phone"><button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
    </form>
  );
}
