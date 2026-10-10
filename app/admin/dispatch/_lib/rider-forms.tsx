"use client";
import { unstable_rethrow } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { assignRider } from "@/app/admin/_actions/dispatch";
import { ActionForm, unreachable } from "@/components/admin/action-form";
import type { ActionResult } from "@/lib/admin/action-result";
import s from "@/components/admin/ops.module.css";

export type RiderOption = { id: string; name: string; phone: string };

function Options({ riders }: { riders: RiderOption[] }) {
  return (
    <>
      <option value="" disabled>Rider…</option>
      {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      <option value="none">No rider</option>
    </>
  );
}

/** Rider picker on one dispatch row: saves as soon as a rider is picked. */
export function RiderSelect({ bookingId, riders, current, label }: { bookingId: string; riders: RiderOption[]; current: string; label: string }) {
  return (
    <ActionForm action={assignRider} className={s.rowForm}>
      <input type="hidden" name="booking_id" value={bookingId} />
      <select className="control" name="rider" defaultValue={current} aria-label={`Rider for ${label}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        <Options riders={riders} />
      </select>
    </ActionForm>
  );
}

function BulkSubmit() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-secondary btn-sm" disabled={pending} aria-busy={pending}>{pending ? "Saving…" : "Assign to ticked"}</button>;
}

/**
 * Bulk assign: the row checkboxes live in the table and join this form through their `form` attribute
 * (form={id}), so the table stays server-rendered.
 */
export function BulkRider({ id, riders }: { id: string; riders: RiderOption[] }) {
  const [state, action] = useActionState(async (prev: ActionResult, form: FormData): Promise<ActionResult> => {
    try {
      return await assignRider(prev, form);
    } catch (e) {
      unstable_rethrow(e);
      return { error: unreachable() };
    }
  }, undefined);
  return (
    <form id={id} action={action} className="flex flex-wrap items-center gap-2">
      <select className="control" name="rider" defaultValue="" required aria-label="Rider for the ticked bookings">
        <Options riders={riders} />
      </select>
      <BulkSubmit />
      {state?.error && <span className="error" role="alert">{state.error}</span>}
      <span role="status" aria-live="polite" className={state?.ok ? "hint" : "sr-only"}>{state?.ok ?? ""}</span>
    </form>
  );
}
