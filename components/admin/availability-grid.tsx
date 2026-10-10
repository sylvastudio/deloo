"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { addBlock, removeBlock } from "@/app/admin/_actions/inventory";
import { fmtDay } from "@/lib/admin/format";
import { ActionForm, Submit } from "./action-form";
import s from "./ops.module.css";

export type Cell =
  | { kind: "free" }
  | { kind: "booked" | "hold"; ref: string; bookingId: string }
  | { kind: "blocked"; reservationId: string; note: string };

export type GridRow = { unitId: string; label: string; sub: string; status: string; cells: Cell[] };

type Seg = { start: number; len: number; cell: Cell };

/** Consecutive days of the same booking or block become one bar. */
function segments(cells: Cell[]): Seg[] {
  const out: Seg[] = [];
  const key = (c: Cell) => (c.kind === "free" ? null : c.kind === "blocked" ? `b:${c.reservationId}` : `${c.kind}:${c.bookingId}`);
  cells.forEach((c, i) => {
    const prev = out.at(-1);
    const k = key(c);
    if (k && prev && key(prev.cell) === k && prev.start + prev.len === i) prev.len += 1;
    else out.push({ start: i, len: 1, cell: c });
  });
  return out;
}

type Sel = { unit: string; a: number; b: number; done: boolean };

/**
 * Units × days. Bookings and blocks are continuous bars (the ref on the first day; a bar that runs past
 * the window edge is squared off). For staff who can edit: drag across free days in a row, or click a
 * first and a last day, to block them; click a hatched block to remove it.
 */
export function AvailabilityGrid({ days, rows, canEdit, today }: { days: string[]; rows: GridRow[]; canEdit: boolean; today: string }) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [block, setBlock] = useState<{ unit: string; first: number; last: number; reservationId: string; note: string } | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setSel((cur) => (cur && cur.a !== cur.b ? { ...cur, done: true } : cur));
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, []);

  const range = sel ? [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)] as const : null;
  const row = sel ? rows.find((r) => r.unitId === sel.unit) : null;
  const rangeFree = !!(row && range && row.cells.slice(range[0], range[1] + 1).every((c) => c.kind === "free"));

  const down = (unit: string, i: number, e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    // Let pointerenter fire on the other cells while dragging (buttons capture touch pointers).
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setBlock(null);
    // Second click in the same row after a single-day pick: that's the end of the range.
    if (sel && sel.unit === unit && !sel.done && sel.a === sel.b && sel.a !== i) {
      setSel({ ...sel, b: i, done: true });
      return;
    }
    dragging.current = true;
    setSel({ unit, a: i, b: i, done: false });
  };
  const enter = (unit: string, i: number) => {
    if (dragging.current) setSel((cur) => (cur && cur.unit === unit ? { ...cur, b: i } : cur));
  };

  const dayCount = range ? range[1] - range[0] + 1 : 0;

  return (
    <div className="grid gap-3">
      {canEdit && (
        <div className="card grid gap-2" aria-live="polite">
          {block ? (
            <ActionForm action={removeBlock} className="flex flex-wrap items-end gap-2" confirm="Remove this block? The unit becomes bookable on those days.">
              <input type="hidden" name="reservation_id" value={block.reservationId} />
              <p className="small grow">
                <strong>Blocked</strong> · {rows.find((r) => r.unitId === block.unit)?.label} · {fmtDay(days[block.first])}
                {block.last !== block.first ? ` – ${fmtDay(days[block.last])}` : ""}{block.note ? ` · “${block.note}”` : ""}
              </p>
              <Submit className="btn btn-secondary btn-sm">Remove block</Submit>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setBlock(null)}>Close</button>
            </ActionForm>
          ) : sel && range && row ? (
            <ActionForm key={`${sel.unit}-${range[0]}-${range[1]}`} action={addBlock} className="flex flex-wrap items-end gap-2" resetOnSuccess>
              <input type="hidden" name="unit_id" value={sel.unit} />
              <input type="hidden" name="first" value={days[range[0]]} />
              <input type="hidden" name="last" value={days[range[1]]} />
              <p className="small grow">
                <strong>{row.label}</strong> · {fmtDay(days[range[0]])}{range[1] !== range[0] ? ` – ${fmtDay(days[range[1]])}` : ""}
                {!sel.done && range[0] === range[1] && <span className="muted"> · drag, or click a last day in this row, to extend</span>}
              </p>
              <label className="field grow"><span className="field-label">Reason</span>
                <input className="control" name="note" required placeholder="Repair, own shoot, cleaning…" /></label>
              <Submit className="btn btn-sm" disabled={!rangeFree}>Block {dayCount} day{dayCount === 1 ? "" : "s"}</Submit>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSel(null)}>Cancel</button>
              {!rangeFree && <p className="error">That range crosses a booking or block.</p>}
            </ActionForm>
          ) : (
            <p className="hint">Drag across free days in a row (or click the first day, then the last) to block them. Click a grey block to remove it.</p>
          )}
        </div>
      )}
      <div className={s.legend}>
        <span><span className={`${s.swatch} ${s.barBooked}`} />Booked (includes turnaround)</span>
        <span><span className={`${s.swatch} ${s.barHold}`} />Hold, unpaid</span>
        <span><span className={`${s.swatch} ${s.barBlock}`} />Blocked</span>
        <span><span className={`${s.swatch} ${s.todayCol}`} />Today</span>
      </div>
      <div className="grid-wrap">
        <table className={s.agrid}>
          <thead>
            <tr>
              <th className={s.unitCol}>Unit</th>
              {days.map((d) => {
                const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                const cls = [dow === 0 || dow === 6 ? s.wk : "", d === today ? s.todayCol : ""].filter(Boolean).join(" ") || undefined;
                return <th key={d} className={cls} title={d}>{d === today ? "Today" : <>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow]}<br />{Number(d.slice(8))}</>}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.unitId}>
                <th className={s.unitCol} scope="row">
                  <div><strong>{r.label}</strong></div>
                  <div className="muted small">{r.sub}{r.status !== "active" ? ` · ${r.status}` : ""}</div>
                </th>
                {segments(r.cells).map((g) => {
                  const c = g.cell;
                  const span = days.slice(g.start, g.start + g.len);
                  const hasToday = span.includes(today);
                  // A bar touching the window edge may run on past it: square that end off.
                  const contL = g.start === 0;
                  const contR = g.start + g.len === days.length;
                  if (c.kind === "booked" || c.kind === "hold") {
                    const title = `${c.ref} · ${fmtDay(span[0])}${g.len > 1 ? ` – ${fmtDay(span[g.len - 1])}` : ""}${c.kind === "hold" ? " · unpaid hold" : ""}`;
                    return (
                      <td key={g.start} colSpan={g.len} className={`${s.barCell}${hasToday ? ` ${s.todayCol}` : ""}`}>
                        <Link href={`/admin/bookings/${c.bookingId}`} title={title}
                          className={[s.bar, c.kind === "hold" ? s.barHold : s.barBooked, contL ? s.contL : "", contR ? s.contR : ""].join(" ")}>
                          {g.len > 1 ? c.ref : c.ref.replace(/^DLO-/, "")}
                        </Link>
                      </td>
                    );
                  }
                  if (c.kind === "blocked") {
                    return (
                      <td key={g.start} colSpan={g.len} className={`${s.barCell}${hasToday ? ` ${s.todayCol}` : ""}`}>
                        <button type="button" title={`Blocked: ${c.note}`} disabled={!canEdit}
                          className={[s.bar, s.barBlock, contL ? s.contL : "", contR ? s.contR : ""].join(" ")}
                          onClick={() => { setSel(null); setBlock({ unit: r.unitId, first: g.start, last: g.start + g.len - 1, reservationId: c.reservationId, note: c.note }); }}>
                          {c.note}
                        </button>
                      </td>
                    );
                  }
                  const i = g.start;
                  const selected = !!(range && sel?.unit === r.unitId && i >= range[0] && i <= range[1]);
                  const off = r.status !== "active";
                  const cls = [selected ? s.sel : off ? s.off : s.free, days[i] === today ? s.todayCol : ""].join(" ");
                  return (
                    <td key={i} className={cls}>
                      <button type="button" className={s.cellBtn} aria-label={`${r.label} ${days[i]} free`} aria-pressed={selected} disabled={!canEdit || off}
                        onPointerDown={(e) => down(r.unitId, i, e)} onPointerEnter={() => enter(r.unitId, i)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBlock(null); setSel((cur) => cur && cur.unit === r.unitId && !cur.done && cur.a !== i ? { ...cur, b: i, done: true } : { unit: r.unitId, a: i, b: i, done: false }); } }} />
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
