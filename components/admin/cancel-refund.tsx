"use client";
import { useState } from "react";
import { koboFromNaira, naira, nairaInput } from "@/lib/admin/format";

/**
 * The refund field on "Cancel booking", and the confirmation that states what will happen
 * ("Cancel DLO-123 and queue a ₦X refund to Finance?"). Finance roles can change the amount; for
 * everyone else the policy amount is used. Read by ActionForm through data-confirm.
 */
export function CancelRefund({ bookingRef, policyKobo, editable }: { bookingRef: string; policyKobo: number; editable: boolean }) {
  const [value, setValue] = useState(nairaInput(policyKobo));
  const kobo = editable ? koboFromNaira(value) ?? 0 : policyKobo;
  const ask = kobo > 0
    ? `Cancel ${bookingRef} and queue a ${naira(kobo)} refund to Finance? This can’t be undone.`
    : `Cancel ${bookingRef}? No refund is due. This can’t be undone.`;
  return (
    <label className="field">
      <span className="field-label">Refund (₦) <span className="opt">policy: {naira(policyKobo)}</span></span>
      <input className="control" name="refund" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} disabled={!editable} />
      {!editable && <span className="hint">The policy amount goes to Finance’s refund queue automatically.</span>}
      <input type="hidden" data-confirm={ask} />
    </label>
  );
}
