"use client";
import Link from "next/link";
import { useState } from "react";
import { addBlock, removeBlock } from "@/app/admin/_actions/inventory";
import { fmtDay } from "@/lib/admin/format";
import { ActionForm, Submit } from "./action-form";

export type Cell =
  | { kind: "free" }
  | { kind: "booked" | "hold"; ref: string; bookingId: string }
  | { kind: "blocked"; reservationId: string; note: string };

export type GridRow = { unitId: string; label: string; sub: string; status: string; cells: Cell[] };

/**
 * Units × days. Booked cells open the booking; for staff who can edit, click two free cells in one row to
 * block that range (a reservation with no booking), or click a block to remove it.
 */
export function AvailabilityGrid({ days, rows, canEdit, today }: { days: string[]; rows: GridRow[]; canEdit: boolean; today: string }) {
  const [sel, setSel] = useState<{ unit: string; a: number; b: number | null } | null>(null);
  const [block, setBlock] = useState<{ unit: string; day: number; reservationId: string; note: string } | null>(null);

  const range = sel && sel.b != null ? [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)] : sel ? [sel.a, sel.a] : null;
  const row = sel ? rows.find((r) => r.unitId === sel.unit) : null;
  const rangeFree = !!(row && range && row.cells.slice(range[0], range[1] + 1).every((c) => c.kind === "free"));

  const clickFree = (unit: string, i: number) => {
    setBlock(null);
    if (!sel || sel.unit !== unit || sel.b != null) setSel({ unit, a: i, b: null });
    else setSel({ ...sel, b: i });
  };

  return (
    <div className="grid gap-3">
      {canEdit && (
        <div className="card grid gap-2" aria-live="polite">
          {block ? (
            <ActionForm action={removeBlock} className="flex flex-wrap items-end gap-2" confirm="Remove this block? The unit becomes bookable on those days.">
              <input type="hidden" name="reservation_id" value={block.reservationId} />
              <p className="small" style={{ margin: 0, flex: "1 1 240px" }}>
                <strong>Blocked</strong> · {rows.find((r) => r.unitId === block.unit)?.label} · {fmtDay(days[block.day])}{block.note ? ` · “${block.note}”` : ""}
              </p>
              <Submit className="btn btn-secondary btn-sm">Remove block</Submit>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setBlock(null)}>Close</button>
            </ActionForm>
          ) : sel && range && row ? (
            <ActionForm key={`${sel.unit}-${range[0]}-${range[1]}`} action={addBlock} className="flex flex-wrap items-end gap-2" resetOnSuccess>
              <input type="hidden" name="unit_id" value={sel.unit} />
              <input type="hidden" name="first" value={days[range[0]]} />
              <input type="hidden" name="last" value={days[range[1]]} />
              <p className="small" style={{ margin: 0, flex: "1 1 220px" }}>
                <strong>{row.label}</strong> · {fmtDay(days[range[0]])}{range[1] !== range[0] ? ` – ${fmtDay(days[range[1]])}` : ""}
                {sel.b == null && <span className="muted"> · click another day in this row to extend</span>}
              </p>
              <label className="field" style={{ flex: "2 1 200px" }}><span className="field-label">Reason</span>
                <input className="control" name="note" required placeholder="Repair, own shoot, cleaning…" /></label>
              <Submit className="btn btn-sm" disabled={!rangeFree}>Block {range[1] - range[0] + 1} day{range[1] === range[0] ? "" : "s"}</Submit>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSel(null)}>Cancel</button>
              {!rangeFree && <p className="error" style={{ flexBasis: "100%" }}>That range crosses a booking or block.</p>}
            </ActionForm>
          ) : (
            <p className="hint">Click a free day, then another day in the same row, to block a range. Click a hatched block to remove it.</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3 small muted">
        <span><span className="st info">Booked</span></span><span><span className="st warn">Hold</span></span>
        <span><span className="st neutral">Blocked (hatched)</span></span><span>Booked cells include the {""}turnaround after the last day.</span>
      </div>
      <div className="grid-wrap">
        <table className="agrid">
          <thead>
            <tr>
              <th className="unit">Unit</th>
              {days.map((d) => {
                const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                return <th key={d} className={dow === 0 || dow === 6 ? "wk" : undefined} title={d}>{d === today ? "Today" : `${["S", "M", "T", "W", "T", "F", "S"][dow]} ${Number(d.slice(8))}`}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.unitId}>
                <th className="unit" scope="row">
                  <div style={{ fontWeight: 500 }}>{r.label}</div>
                  <div className="muted small">{r.sub}{r.status !== "active" ? ` · ${r.status}` : ""}</div>
                </th>
                {r.cells.map((c, i) => {
                  const selected = !!(range && sel?.unit === r.unitId && i >= range[0] && i <= range[1]);
                  if (c.kind === "booked" || c.kind === "hold") {
                    return (
                      <td key={i} className={c.kind}>
                        <Link href={`/admin/bookings/${c.bookingId}`} title={`${c.ref} · ${days[i]}`}>{c.ref.replace(/^DLO-/, "")}</Link>
                      </td>
                    );
                  }
                  if (c.kind === "blocked") {
                    return (
                      <td key={i} className="blocked">
                        <button type="button" title={`Blocked: ${c.note}`} disabled={!canEdit}
                          onClick={() => { setSel(null); setBlock({ unit: r.unitId, day: i, reservationId: c.reservationId, note: c.note }); }}>
                          {c.note.slice(0, 4)}
                        </button>
                      </td>
                    );
                  }
                  const off = r.status !== "active";
                  return (
                    <td key={i} className={selected ? "sel" : off ? "off" : "free"}>
                      <button type="button" aria-label={`${r.label} ${days[i]} free`} aria-pressed={selected} disabled={!canEdit || off}
                        onClick={() => clickFree(r.unitId, i)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
