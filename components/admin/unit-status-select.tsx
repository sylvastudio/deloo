"use client";
import { useState } from "react";
import { UNIT_STATUS_LABEL as LABEL, UNIT_STATUSES, type UnitStatus } from "@/lib/admin/status";

/**
 * Unit status with a warning when a unit that still has upcoming bookings leaves `active` (PRD §5.6):
 * those bookings keep their reservation and need a swap.
 */
export function UnitStatusSelect({ current, futureBookings, canRetire, disabled }: {
  current: UnitStatus; futureBookings: number; canRetire: boolean; disabled?: boolean;
}) {
  const [v, setV] = useState<UnitStatus>(current);
  const locked = (s: UnitStatus) => !canRetire && s !== current && (s === "retired" || s === "lost" || current === "retired" || current === "lost");
  return (
    <div className="grid gap-1">
      <select className="control" name="status" value={v} onChange={(e) => setV(e.target.value as UnitStatus)} disabled={disabled} aria-label="Unit status">
        {UNIT_STATUSES.map((s) => <option key={s} value={s} disabled={locked(s)}>{LABEL[s]}{locked(s) ? " (owner/admin)" : ""}</option>)}
      </select>
      {v !== current && (v === "retired" || v === "lost") && (
        // Asked by ActionForm before saving.
        <input type="hidden" data-confirm={v === "lost"
          ? "Mark this unit as lost? It can’t be booked again, and it counts as a write-off."
          : "Retire this unit? It can’t be booked again."} />
      )}
      {current === "active" && v !== "active" && futureBookings > 0 && (
        <p className="callout warn" role="alert">
          {futureBookings} upcoming booking{futureBookings === 1 ? " uses" : "s use"} this unit. They stay booked on it: open each booking and swap to a free unit, or call the renter.
        </p>
      )}
    </div>
  );
}
