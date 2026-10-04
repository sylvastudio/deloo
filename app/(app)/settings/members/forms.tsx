"use client";
import { useActionState } from "react";
import { addUnit, inviteVolunteer, type FormState } from "./actions";

export function InviteForm({ units }: { units: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteVolunteer, undefined);
  return (
    <form action={action} className="card grid gap-3" noValidate>
      <h2 className="h2">Invite a volunteer</h2>
      <p className="hint">They get an email link, set a password, and design for their unit with your brand kit. They can&apos;t change the kit.</p>
      <div className="field"><label className="field-label" htmlFor="inv-email">Email</label>
        <input className="control" id="inv-email" name="email" type="email" inputMode="email" autoComplete="off" required /></div>
      <div className="field"><label className="field-label" htmlFor="inv-unit">Branch or department</label>
        <select className="control" id="inv-unit" name="unit" required defaultValue="">
          <option value="" disabled>{units.length ? "Choose one" : "Add a branch or department first"}</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select></div>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.notice && <p className="notice" role="status">{state.notice}</p>}
      <div><button className="btn" type="submit" disabled={pending || !units.length}>{pending ? "Sending…" : "Send invite"}</button></div>
    </form>
  );
}

export function UnitForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addUnit, undefined);
  return (
    <form action={action} className="grid gap-3" noValidate>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="field"><label className="field-label" htmlFor="unit-name">Name</label>
          <input className="control" id="unit-name" name="name" placeholder="e.g. Youth Department" required /></div>
        <div className="field"><label className="field-label" htmlFor="unit-type">Kind</label>
          <select className="control" id="unit-type" name="type" defaultValue="department">
            <option value="branch">Branch</option><option value="department">Department</option><option value="cell">Cell</option>
          </select></div>
        <button className="btn btn-secondary" type="submit" disabled={pending}>Add</button>
      </div>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.notice && <p className="notice" role="status">{state.notice}</p>}
    </form>
  );
}
