import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { addNote, inspectReturn, setBookingStatus, swapUnit, updateDelivery } from "@/app/admin/_actions/booking";
import { addRefund } from "@/app/admin/_actions/money";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { BookingMessages } from "@/components/admin/booking-messages";
import { CancelRefund } from "@/components/admin/cancel-refund";
import { EvidenceCompare } from "@/components/admin/evidence-compare";
import { EvidenceGallery } from "@/components/admin/evidence-gallery";
import { HandoverCapture } from "@/components/admin/handover-capture";
import s from "@/components/admin/ops.module.css";
import { Chip, Empty, ErrorBox, PageHead, Section, StatusChip } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { evidenceCoverage, loadEvidence, namesFor, riderOwns } from "@/lib/admin/data";
import { fmtDateTime, fmtRental, fmtTime, lagosDay, naira, nairaInput } from "@/lib/admin/format";
import { nextAction, type NextActionCtx } from "@/lib/admin/next-action";
import { can, maskPhone, maskText } from "@/lib/admin/roles";
import {
  canInspect, EVIDENCE_FOR, HANDOVER_KINDS, HANDOVER_LABEL, movesFor, MOVES, REFUND_PURPOSE_LABEL, STATUS_LABEL,
  type BookingStatus, type HandoverKind,
} from "@/lib/admin/status";
import { one, type BookingItemRow, type BookingRow, type PaymentRow, type RefundRow } from "@/lib/admin/types";
import { bookingMessages, mapsLink, telLink, waLink } from "@/lib/admin/whatsapp";
import { createClient } from "@/lib/supabase/server";
import { CopyRef } from "./copy-ref";

export const metadata = { title: "Booking" };

/** The stage stepper: Paid → Prepared → Out → Delivered → Collected → Inspected → Closed. */
const STAGES = ["Paid", "Prepared", "Out", "Delivered", "Collected", "Inspected", "Closed"];
const STAGE_INDEX: Partial<Record<BookingStatus, number>> = {
  confirmed: 0, preparing: 1, out_for_delivery: 2, out: 2, delivered: 3, collected: 4, returned: 4, inspected: 5, disputed: 5, closed: 6,
};

function StageStepper({ status }: { status: BookingStatus }) {
  const dead = status === "cancelled" || status === "expired";
  const at = STAGE_INDEX[status] ?? -1;
  return (
    <ol className={s.stepper} aria-label="Stage">
      {STAGES.map((label, i) => {
        const bad = status === "disputed" && i === 5;
        const cls = dead ? s.stepOff : bad ? s.stepBad : i <= at ? s.done : i === at + 1 ? s.now : "";
        return (
          <li key={label} className={`${s.step} ${cls}`} aria-current={i === at ? "step" : undefined}>
            {bad ? "Disputed" : label}
          </li>
        );
      })}
    </ol>
  );
}

type Event = { at: string; text: ReactNode; who?: string; tone?: "bad" | "good" };

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await pageStaff();
  if (!can(staff.role, "bookings.view") && staff.role !== "rider") notFound();
  const db = await createClient();

  const { data: bData, error: bErr } = await db.from("bookings").select("*").eq("id", id).maybeSingle();
  if (bErr) return <div className="adm-page"><ErrorBox what="this booking" error={bErr.message} /></div>;
  if (!bData) notFound();
  const b = bData as BookingRow;
  // Riders only see their own jobs.
  if (!riderOwns(staff, b)) notFound();

  // The audit log is readable by admin, finance and the owner only (RLS audit_select).
  const canAudit = staff.role === "owner" || staff.role === "admin" || staff.role === "finance";
  const seeMoney = can(staff.role, "payments.view");
  const [itemsRes, profileRes, paymentsRes, refundsRes, notesRes, zonesRes, ridersRes, resvRes, auditRes, quoteRes] = await Promise.all([
    db.from("booking_items").select("id, booking_id, item_id, unit_id, item_name, day_rate_kobo, days, rental_kobo, deposit_kobo, kind, units(tag, serial)").eq("booking_id", id).order("created_at"),
    db.from("profiles").select("id, full_name, phone, blocked").eq("id", b.renter_id).maybeSingle(),
    db.from("payments").select("id, booking_id, purpose, reference, amount_kobo, fees_kobo, channel, status, flags, paystack_id, paid_at, created_at").eq("booking_id", id).order("created_at"),
    db.from("refunds").select("id, booking_id, payment_id, purpose, amount_kobo, method, status, provider_ref, reason, requested_by, processed_by, processed_at, created_at").eq("booking_id", id).order("created_at"),
    db.from("booking_notes").select("id, author_id, body, created_at").eq("booking_id", id).order("created_at", { ascending: false }),
    db.from("delivery_zones").select("id, name, price_kobo, active").order("sort"),
    db.from("staff_members").select("user_id, display_name, phone").eq("role", "rider").eq("active", true),
    db.from("reservations").select("id, unit_id, booking_item_id, period, live").eq("booking_id", id).eq("live", true),
    canAudit ? db.from("audit_log").select("id, actor_id, before, after, at").eq("entity", "bookings").eq("entity_id", id).order("at") : Promise.resolve({ data: [], error: null }),
    ["hold", "confirmed", "preparing", "out_for_delivery", "delivered"].includes(b.status) ? db.rpc("quote_cancellation", { p_booking: id }) : Promise.resolve({ data: null }),
  ]);

  const items = (itemsRes.data ?? []) as (BookingItemRow & { units: { tag: string; serial: string } | { tag: string; serial: string }[] | null })[];
  // No deposits since 0019; older bookings still show theirs.
  const hasDeposit = Number(b.deposit_kobo) > 0 || items.some((i) => Number(i.deposit_kobo) > 0);
  const profile = profileRes.data as { full_name: string; phone: string; blocked: boolean } | null;
  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  const refunds = (refundsRes.data ?? []) as RefundRow[];
  const notes = (notesRes.data ?? []) as { id: string; author_id: string | null; body: string; created_at: string }[];
  const zones = (zonesRes.data ?? []) as { id: string; name: string; price_kobo: number; active: boolean }[];
  const riders = (ridersRes.data ?? []) as { user_id: string; display_name: string; phone: string }[];
  const reservations = (resvRes.data ?? []) as { id: string; unit_id: string; booking_item_id: string | null; period: string }[];
  const audit = (auditRes.data ?? []) as { id: number; actor_id: string | null; before: { status?: string } | null; after: { status?: string; needs_refund?: boolean } | null; at: string }[];
  const refundQuote = Number((quoteRes.data as { refund_kobo?: number } | null)?.refund_kobo ?? 0);

  const unitLabel = (i: (typeof items)[number]) => {
    const u = one(i.units);
    return `${i.item_name}${u?.tag ? ` · ${u.tag}` : u?.serial ? ` · ${u.serial}` : ""}`;
  };
  const rentalLines = items.filter((i) => i.kind === "rental");
  const unitLabels = new Map(rentalLines.filter((i) => i.unit_id).map((i) => [i.unit_id as string, unitLabel(i)]));

  // Free active units of the same item for a swap: none of their live reservations overlap this booking's period.
  const canSwap = can(staff.role, "units.swap") && ["hold", "confirmed", "preparing"].includes(b.status);
  const loadSwapOptions = async () => {
    const out = new Map<string, { id: string; label: string }[]>();
    if (!canSwap || !rentalLines.length) return out;
    const itemIds = [...new Set(rentalLines.map((i) => i.item_id))];
    const period = reservations[0]?.period;
    const { data: units } = await db.from("units").select("id, item_id, tag, serial").in("item_id", itemIds).eq("status", "active");
    const busy = new Set<string>();
    if (period && units?.length) {
      const { data: clash } = await db.from("reservations").select("unit_id, booking_id").in("unit_id", units.map((u) => u.id)).eq("live", true).overlaps("period", period);
      for (const r of clash ?? []) busy.add(r.unit_id as string);
    }
    for (const it of itemIds) {
      out.set(it, (units ?? []).filter((u) => u.item_id === it && !busy.has(u.id as string))
        .map((u) => ({ id: u.id as string, label: [u.tag, u.serial].filter(Boolean).join(" · ") || (u.id as string).slice(0, 8) })));
    }
    return out;
  };

  const moves = movesFor(b.status, staff.role);
  const inspecting = b.status === "collected" && canInspect(staff.role);
  // Evidence kinds to check: the moves on offer, plus inspection photos for the Inspect return panel.
  const kinds = [...new Set([...moves.map((m) => EVIDENCE_FOR[m.to]).filter((k): k is HandoverKind => !!k), ...(inspecting ? ["inspection" as const] : [])])];
  const [swapOptions, evidence, names, coverageList] = await Promise.all([
    loadSwapOptions(),
    loadEvidence(db, [id]),
    namesFor(db, [...notes.map((n) => n.author_id), ...audit.map((a) => a.actor_id), ...refunds.map((r) => r.processed_by)]),
    Promise.all(kinds.map(async (k) => [k, await evidenceCoverage(db, id, k)] as const)),
  ]);
  const coverage = new Map(coverageList);
  const inspectCov = coverage.get("inspection");

  // What closing leaves behind: an unrefunded deposit (older bookings) or refunds still open.
  const depositQueued = refunds.some((r) => r.purpose === "deposit" && r.status !== "failed");
  const openRefunds = refunds.filter((r) => r.status === "queued" || r.status === "processing").length;
  const ref = b.ref ?? id.slice(0, 8);
  const closeConfirm = [
    `Close ${ref}? The rental is marked finished and leaves the live lists.`,
    hasDeposit && !depositQueued ? `The ${naira(b.deposit_kobo)} deposit hasn’t been queued for refund yet: add it under Money first if it’s owed.` : "",
    openRefunds ? `${openRefunds} refund${openRefunds === 1 ? " is" : "s are"} still open in the Finance queue.` : "",
  ].filter(Boolean).join(" ");
  const inspectUnits = [...new Map(rentalLines.filter((i) => i.unit_id).map((i) => [i.unit_id as string, unitLabel(i)])).entries()];

  const renterName = profile?.full_name ?? "Unknown renter";
  const phone = b.contact_phone || profile?.phone || "";
  const pii = can(staff.role, "pii.view");
  const messages = bookingMessages(b, renterName);
  const zone = zones.find((z) => z.id === b.delivery_zone_id);
  const editDelivery = can(staff.role, "bookings.edit");

  // Next action, from the same data the page already has.
  const unitIds = [...unitLabels.keys()];
  const ctxCoverage: NextActionCtx["coverage"] = {};
  for (const k of HANDOVER_KINDS) {
    const covered = new Set<string>();
    for (const h of evidence.data) if (h.kind === k && h.party === "staff") for (const m of h.media) if (m.media_type === "photo" && m.unit_id) covered.add(m.unit_id);
    ctxCoverage[k] = { covered: unitIds.filter((u) => covered.has(u)).length, total: unitIds.length };
  }
  const collectedAt = audit.filter((a) => a.after?.status === "collected").map((a) => a.at).at(-1)
    ?? evidence.data.filter((h) => h.kind === "collection" && h.party === "staff").map((h) => h.created_at).sort().at(-1) ?? null;
  const na = nextAction(b, {
    units: { total: rentalLines.length, assigned: rentalLines.filter((i) => i.unit_id).length },
    coverage: ctxCoverage,
    refunds: refunds.map((r) => ({ status: r.status, amount_kobo: r.amount_kobo, purpose: r.purpose, created_at: r.created_at })),
    paymentMismatch: payments.some((p) => p.status === "mismatch" || (p.flags ?? []).includes("duplicate")),
    renterProblem: evidence.data.some((h) => h.party === "renter" && h.kind === "delivery" && h.result === "issue"),
    collectedAt,
  });
  const primaryMove = na.move ? moves.find((m) => m.to === na.move) : undefined;
  const otherMoves = moves.filter((m) => m !== primaryMove);

  /** One status move: a plain confirm button, or an expander when it needs a note or a photo override. */
  const renderMove = (m: (typeof MOVES)[number], primary: boolean) => {
    const kind = EVIDENCE_FOR[m.to];
    const cov = kind ? coverage.get(kind) : undefined;
    const missingEvidence = !!cov && !cov.complete;
    const simple = !m.note && !missingEvidence;
    const label = primary ? na.label : m.label;
    const btn = primary ? "btn" : "btn btn-secondary btn-sm";
    if (simple) {
      return (
        <ActionForm key={m.to} action={setBookingStatus} confirm={`${m.label}? ${ref} moves to “${STATUS_LABEL[m.to]}”.`}>
          <input type="hidden" name="booking_id" value={id} />
          <input type="hidden" name="to" value={m.to} />
          <Submit className={btn}>{label}</Submit>
        </ActionForm>
      );
    }
    return (
      <details key={m.to} className={s.moveCard}>
        <summary className={btn}>{label}…</summary>
        <ActionForm action={setBookingStatus} className="grid gap-2"
          confirm={m.to === "cancelled" ? undefined : m.to === "closed" ? closeConfirm : m.to === "disputed" ? `Mark ${ref} as disputed? Finance and ops then settle the claim.` : `${m.label}? ${ref} moves to “${STATUS_LABEL[m.to]}”.`}>
          <input type="hidden" name="booking_id" value={id} />
          <input type="hidden" name="to" value={m.to} />
          {missingEvidence && cov && (
            <div className="warn-box">
              {cov.units.length === 0 ? "No units are assigned." : <>No {kind} photos yet for {cov.missing.length} of {cov.units.length} unit{cov.units.length === 1 ? "" : "s"}. Add them in <a href="#evidence">Handover evidence</a>.</>}
              {staff.role !== "rider" && cov.units.length > 0 && (
                <div className="grid gap-1">
                  <label className="switch"><input type="checkbox" name="override" /> Continue without the photos</label>
                  <textarea className="control" name="override_note" rows={2} aria-label="Why continue without the photos"
                    placeholder="Why? (saved in Notes) e.g. renter collected at base, photos on the rider’s phone" />
                </div>
              )}
            </div>
          )}
          {m.note && (
            <label className="field">
              <span className="field-label">Note {m.note === "optional" && <span className="opt">optional</span>}</span>
              <textarea className="control" name="note" rows={2} required={m.note === "required"} minLength={m.note === "required" ? 3 : undefined}
                placeholder={m.to === "cancelled" ? "Why? (shown in the audit trail)" : m.to === "disputed" ? "What’s wrong, on which unit?" : ""} />
            </label>
          )}
          {m.to === "cancelled" && <CancelRefund bookingRef={ref} policyKobo={refundQuote} editable={can(staff.role, "refunds.process")} />}
          {m.to === "closed" && <p className="hint">{closeConfirm}</p>}
          <Submit className={m.danger ? "btn btn-secondary" : "btn"}>Confirm: {m.label}</Submit>
        </ActionForm>
      </details>
    );
  };

  const gear = rentalLines.map((i) => i.item_name);
  const gearSummary = gear.length === 0 ? "No gear" : gear.length <= 2 ? gear.join(" + ") : `${gear[0]} + ${gear.length - 1} more`;
  const firstName = renterName.split(" ")[0];
  const actsHere = staff.role !== "readonly";

  // Activity: status changes (audit, admin/finance/owner only), payments, refunds, handovers and notes, newest first.
  const events: Event[] = [
    { at: b.created_at, text: "Hold placed" },
    ...(b.confirmed_at ? [{ at: b.confirmed_at, text: "Payment confirmed", tone: "good" as const }] : []),
    ...(b.cancelled_at ? [{ at: b.cancelled_at, text: `Cancelled${b.cancel_reason ? `: ${b.cancel_reason}` : ""}`, tone: "bad" as const }] : []),
    ...(canAudit ? audit.filter((a) => a.before?.status !== a.after?.status).map((a) => ({
      at: a.at,
      text: <>{STATUS_LABEL[(a.before?.status ?? "") as BookingStatus] ?? a.before?.status} → <strong>{STATUS_LABEL[(a.after?.status ?? "") as BookingStatus] ?? a.after?.status}</strong></>,
      who: a.actor_id ? names.get(a.actor_id) ?? "Staff" : "System",
    })) : []),
    ...(seeMoney ? payments.filter((p) => p.paid_at).map((p) => ({
      at: p.paid_at as string, text: `Payment ${naira(p.amount_kobo)} ${p.status}${p.channel ? ` (${p.channel})` : ""}`, tone: p.status === "success" ? "good" as const : "bad" as const,
    })) : []),
    ...(seeMoney ? refunds.flatMap((r) => [
      { at: r.created_at, text: `Refund ${naira(r.amount_kobo)} queued: ${REFUND_PURPOSE_LABEL[r.purpose] ?? r.purpose}${r.reason ? `, ${r.reason}` : ""}` },
      ...(r.processed_at ? [{ at: r.processed_at, text: `Refund ${naira(r.amount_kobo)} ${r.status}`, who: names.get(r.processed_by ?? ""), tone: r.status === "failed" ? "bad" as const : "good" as const }] : []),
    ]) : []),
    ...evidence.data.map((h) => ({
      at: h.created_at,
      text: <>{HANDOVER_LABEL[h.kind] ?? h.kind} handover · {h.media.length} file{h.media.length === 1 ? "" : "s"}{h.result === "issue" ? <> · <strong>problem</strong>{h.problem_note ? `: ${h.problem_note}` : ""}</> : ""}</>,
      who: h.performer, tone: h.result === "issue" ? "bad" as const : undefined,
    })),
    ...notes.map((n) => ({ at: n.created_at, text: <span className={s.prewrap}>{n.body}</span>, who: names.get(n.author_id ?? "") ?? "System" })),
  ].sort((a, z) => z.at.localeCompare(a.at));

  return (
    <div className="adm-page">
      <PageHead
        crumbs={staff.role === "rider" ? [{ href: "/admin/jobs", label: "Jobs" }] : [{ href: "/admin/bookings", label: "Bookings" }]}
        title={<>{renterName} · {gearSummary}</>}
        actions={<><CopyRef value={ref} /><StatusChip status={b.status} />{b.needs_refund && <Chip tone="bad">Needs refund</Chip>}</>}
      />

      <div className="card grid gap-3">
        <StageStepper status={b.status} />
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 small">
          <span><span className="muted">Days </span>{fmtRental(b.starts_at, b.ends_at)} ({b.days})</span>
          <span><span className="muted">{b.delivery === "pickup" ? "Pickup at base" : "Delivery"} </span>{b.delivery_slot || ""}</span>
          {seeMoney && <span><span className="muted">Total </span><strong className="num">{naira(b.total_kobo)}</strong></span>}
          {b.status === "hold" && b.hold_expires_at && <span className="muted">Hold until {fmtDateTime(b.hold_expires_at)}</span>}
          {b.cancel_reason && <span className="muted">Cancel reason: {b.cancel_reason}</span>}
        </div>

        <div className={s.nextBar}>
          <div className={s.grow}>
            <p className="kicker">Next</p>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={na.severity}>{na.label}</Chip>
              {na.due && na.severity !== "info" && <span className="muted small">due {lagosDay(na.due) === lagosDay() ? fmtTime(na.due) : fmtDateTime(na.due)}</span>}
            </div>
          </div>
          {actsHere && (primaryMove ? renderMove(primaryMove, true) : na.anchor && <a className="btn" href={na.anchor}>{na.label}</a>)}
          {otherMoves.length > 0 && (
            <details className={s.more}>
              <summary className="btn btn-secondary btn-sm">More actions</summary>
              <div className={s.moreBody}>{otherMoves.map((m) => renderMove(m, false))}</div>
            </details>
          )}
        </div>
        {moves.length === 0 && !inspecting && actsHere && !na.anchor && <p className="hint">No status moves available to your role from here.</p>}
      </div>

      <div className="split">
        <div className="grid gap-4">
          {inspecting && (
            <Section title="Inspect return" id="inspect">
              {inspectUnits.length === 0 ? <p className="warn-box">No units are assigned to this booking.</p> : (
                <ActionForm action={inspectReturn} className="grid gap-3"
                  confirm={`Save the inspection of ${ref}? Units marked Problem go to quarantine and the booking becomes disputed. If every unit is OK and nothing is owed back, the booking closes.`}>
                  <input type="hidden" name="booking_id" value={id} />
                  {inspectCov && !inspectCov.complete && (
                    <div className="warn-box">
                      No inspection photos yet for {inspectCov.missing.length} of {inspectCov.units.length} unit{inspectCov.units.length === 1 ? "" : "s"}. Add them in <a href="#evidence">Handover evidence</a> (kind: Return inspection), then save.
                      {staff.role === "owner" && (
                        <div className="grid gap-1">
                          <label className="switch"><input type="checkbox" name="override" /> Owner override: inspect without the photos</label>
                          <textarea className="control" name="override_note" rows={2} aria-label="Why inspect without the photos" placeholder="Why? (saved in Notes)" />
                        </div>
                      )}
                    </div>
                  )}
                  {inspectUnits.map(([unitId, label]) => (
                    <fieldset key={unitId} className={`grid gap-1 ${s.fs}`}>
                      <input type="hidden" name="unit" value={unitId} />
                      <legend className="small"><strong>{label}</strong></legend>
                      <div className="actions">
                        <label className="switch"><input type="radio" name={`result_${unitId}`} value="ok" required /> OK</label>
                        <label className="switch"><input type="radio" name={`result_${unitId}`} value="problem" /> Problem</label>
                      </div>
                      <input className="control" name={`note_${unitId}`} aria-label={`Note for ${label}`} placeholder="Note (required for a problem): e.g. cracked LCD, battery missing" />
                    </fieldset>
                  ))}
                  <div className="actions">
                    <Submit disabled={!!inspectCov && !inspectCov.complete && staff.role !== "owner"}>Save inspection</Submit>
                  </div>
                </ActionForm>
              )}
              <details className="inline" open>
                <summary>Compare photos: dispatch → delivery → collection → inspection</summary>
                {evidence.error ? <ErrorBox what="handover evidence" error={evidence.error} /> : <EvidenceCompare evidence={evidence.data} units={inspectUnits} />}
              </details>
            </Section>
          )}

          {b.status === "disputed" && (
            <Section title="Compare handover photos" id="compare">
              {evidence.error ? <ErrorBox what="handover evidence" error={evidence.error} /> : <EvidenceCompare evidence={evidence.data} units={inspectUnits} />}
            </Section>
          )}

          <Section title="Gear" id="gear">
            {itemsRes.error ? <ErrorBox what="items" error={itemsRes.error.message} /> : !items.length ? <Empty>No items on this booking.</Empty> : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Item</th><th>Unit (tag · serial)</th>{seeMoney && <><th className="num">Rate</th><th className="num">Rental</th></>}{seeMoney && hasDeposit && <th className="num">Deposit</th>}{canSwap && <th>Swap</th>}</tr></thead>
                  <tbody>
                    {items.map((i) => {
                      const u = one(i.units);
                      const opts = (swapOptions.get(i.item_id) ?? []).filter((o) => o.id !== i.unit_id);
                      return (
                        <tr key={i.id}>
                          <td>{i.item_name}{i.kind === "extension" && <> <Chip tone="info">Extension</Chip></>}</td>
                          <td className="mono">{u ? [u.tag, u.serial].filter(Boolean).join(" · ") || "No tag" : i.kind === "rental" ? <Chip tone="bad">Not assigned</Chip> : <span className="muted">None</span>}</td>
                          {seeMoney && <><td className="num">{naira(i.day_rate_kobo)}×{i.days}</td><td className="num">{naira(i.rental_kobo)}</td></>}
                          {seeMoney && hasDeposit && <td className="num">{naira(i.deposit_kobo)}</td>}
                          {canSwap && (
                            <td>
                              {i.kind === "rental" && (opts.length ? (
                                <ActionForm action={swapUnit} className={s.rowForm} confirm="Swap to this unit? The old unit is released for these dates.">
                                  <input type="hidden" name="booking_item_id" value={i.id} />
                                  <select className="control" name="unit_id" aria-label="Free unit" required defaultValue="">
                                    <option value="" disabled>{i.unit_id ? "Free unit…" : "Assign unit…"}</option>
                                    {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                  </select>
                                  <Submit className="btn btn-secondary btn-sm">{i.unit_id ? "Swap" : "Assign"}</Submit>
                                </ActionForm>
                              ) : <span className="muted small">No free unit</span>)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Handover evidence" id="evidence">
            {evidence.error ? <ErrorBox what="handover evidence" error={evidence.error} /> : <EvidenceGallery evidence={evidence.data} unitLabels={unitLabels} />}
            {can(staff.role, "handover.capture") && !["hold", "expired", "cancelled"].includes(b.status) && (
              <div className="card">
                <HandoverCapture
                  bookingId={id}
                  units={rentalLines.filter((i) => i.unit_id).map((i) => ({ unitId: i.unit_id as string, label: unitLabel(i) }))}
                  kinds={HANDOVER_KINDS.filter((k) => k !== "inspection" || staff.role !== "rider")}
                  defaultKind={b.status === "confirmed" || b.status === "preparing" ? "dispatch" : b.status === "out_for_delivery" ? "delivery" : b.status === "delivered" || staff.role === "rider" ? "collection" : "inspection"}
                />
              </div>
            )}
          </Section>

          <BookingMessages bookingId={id} />

          <Section title="Activity" id="activity">
            {can(staff.role, "notes.write") && (
              <ActionForm action={addNote} className="grid gap-2" resetOnSuccess>
                <input type="hidden" name="booking_id" value={id} />
                <textarea className="control" name="body" rows={2} required placeholder="Internal note (renters never see these)" aria-label="New note" />
                <div className="actions"><Submit className="btn btn-secondary btn-sm">Add note</Submit></div>
              </ActionForm>
            )}
            {notesRes.error && <ErrorBox what="notes" error={notesRes.error.message} />}
            {canAudit && auditRes.error && <ErrorBox what="status changes" error={auditRes.error.message} />}
            <ul className={s.tl}>
              {events.map((e, n) => (
                <li key={n} className="small">
                  <span className="muted">{fmtDateTime(e.at)}</span> · {e.tone ? <Chip tone={e.tone}>{e.tone === "bad" ? "!" : "✓"}</Chip> : null} {e.text}
                  {e.who && <span className="muted"> · {e.who}</span>}
                </li>
              ))}
            </ul>
            {!canAudit && <p className="hint">Status changes and who made them are shown to admin and finance.</p>}
          </Section>
        </div>

        <div className="grid gap-4">
          <Section title="Renter" id="renter">
            <div className="grid gap-2">
              <div>
                {can(staff.role, "customers.view") ? <Link href={`/admin/customers/${b.renter_id}`}>{renterName}</Link> : <strong>{renterName}</strong>}
                {profile?.blocked && <> <Chip tone="bad">Blocked</Chip></>}
                <div className="mono small">{maskPhone(staff.role, phone) || "No phone"}</div>
              </div>
              {pii && phone && (
                <div className="actions">
                  {telLink(phone) && <a className="btn btn-secondary btn-sm" href={telLink(phone)}>Call {firstName}</a>}
                  {waLink(phone, `Hi ${firstName}, `) && <a className="btn btn-secondary btn-sm" href={waLink(phone, `Hi ${firstName}, `)} target="_blank" rel="noreferrer">WhatsApp</a>}
                </div>
              )}
              {pii && phone && (
                <details className="inline">
                  <summary>WhatsApp templates</summary>
                  <div className="grid gap-2">
                    {messages.map((m) => {
                      const href = waLink(phone, m.text);
                      return (
                        <div key={m.key} className="grid gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="small">{m.label}</strong>
                            {href ? <a className="btn btn-secondary btn-sm" href={href} target="_blank" rel="noreferrer">Send</a> : <span className="muted small">Phone not usable</span>}
                          </div>
                          <p className="muted small">{m.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          </Section>

          <Section title="Delivery" id="delivery">
            {b.delivery === "pickup" && <p className="notice">Renter picks up at base.</p>}
            <dl className="dl">
              <dt>Address</dt><dd>{maskText(staff.role, b.address) || <span className="subtle">Not set</span>}{pii && b.address && <> · <a href={mapsLink(b.address)} target="_blank" rel="noreferrer">Maps</a></>}</dd>
              <dt>Zone</dt><dd>{zone?.name ?? <span className="subtle">None</span>}</dd>
              <dt>Contact</dt><dd>{b.contact_phone ? <span className="mono">{maskPhone(staff.role, b.contact_phone)}</span> : <span className="subtle">Not set</span>}</dd>
              <dt>Delivery slot</dt><dd>{b.delivery_slot || <span className="subtle">Not set</span>}</dd>
              <dt>Collection slot</dt><dd>{b.collection_slot || <span className="subtle">Not set</span>}</dd>
              <dt>Rider</dt><dd>{b.rider_name || (b.delivery === "pickup" ? <span className="subtle">None (pickup)</span> : <Chip tone="warn">Not assigned</Chip>)} {b.rider_phone && <span className="mono">{maskPhone(staff.role, b.rider_phone)}</span>}</dd>
            </dl>
            {editDelivery && (
              <details className="inline" open={na.anchor === "#delivery" || undefined}>
                <summary>Edit delivery</summary>
                <ActionForm action={updateDelivery} className="grid gap-3">
                  <input type="hidden" name="booking_id" value={id} />
                  <label className="field"><span className="field-label">Address</span>
                    <textarea className="control" name="address" rows={2} defaultValue={b.address} /></label>
                  <div className="cols-2">
                    <label className="field"><span className="field-label">Zone</span>
                      <select className="control" name="delivery_zone_id" defaultValue={b.delivery_zone_id ?? ""}>
                        <option value="">None (pickup)</option>
                        {zones.map((z) => <option key={z.id} value={z.id}>{z.name} · {naira(z.price_kobo)}{z.active ? "" : " (off)"}</option>)}
                      </select></label>
                    <label className="field"><span className="field-label">Contact phone</span>
                      <input className="control" name="contact_phone" defaultValue={b.contact_phone} inputMode="tel" /></label>
                    <label className="field"><span className="field-label">Delivery slot</span>
                      <input className="control" name="delivery_slot" defaultValue={b.delivery_slot} placeholder="e.g. 8–11am" /></label>
                    <label className="field"><span className="field-label">Collection slot</span>
                      <input className="control" name="collection_slot" defaultValue={b.collection_slot} placeholder="e.g. 4–7pm" /></label>
                  </div>
                  {riders.length > 0 && (
                    <label className="field"><span className="field-label">Rider <span className="opt">fills name and phone</span></span>
                      <select className="control" name="rider_pick" defaultValue="">
                        <option value="">Keep / type below</option>
                        {riders.map((r) => <option key={r.user_id} value={`${r.display_name}|${r.phone}`}>{r.display_name}{r.phone ? ` · ${r.phone}` : ""}</option>)}
                      </select></label>
                  )}
                  <div className="cols-2">
                    <label className="field"><span className="field-label">Rider name</span>
                      <input className="control" name="rider_name" defaultValue={b.rider_name} /></label>
                    <label className="field"><span className="field-label">Rider phone</span>
                      <input className="control" name="rider_phone" defaultValue={b.rider_phone} inputMode="tel" /></label>
                  </div>
                  <div className="actions"><Submit>Save delivery</Submit></div>
                </ActionForm>
              </details>
            )}
          </Section>

          {seeMoney && (
            <Section title="Money" id="money">
              <dl className="dl">
                <dt>Rental</dt><dd className="num">{naira(b.rental_kobo)}</dd>
                <dt>Deloo Protection (damage cover)</dt><dd className="num">{naira(b.protection_kobo)}</dd>
                <dt>Delivery</dt><dd className="num">{naira(b.delivery_kobo)}</dd>
                {hasDeposit && <><dt>Deposit (refundable, older booking)</dt><dd className="num">{naira(b.deposit_kobo)}</dd></>}
                <dt><strong>Total</strong></dt><dd className="num"><strong>{naira(b.total_kobo)}</strong></dd>
              </dl>
              <h3 className="kicker">Payments</h3>
              {paymentsRes.error ? <ErrorBox what="payments" error={paymentsRes.error.message} /> : !payments.length ? <p className="hint">No payment started.</p> : (
                <ul className={s.tl}>
                  {payments.map((p) => (
                    <li key={p.id} className="small">
                      <Chip tone={p.status === "success" ? "good" : p.status === "mismatch" ? "bad" : p.status === "initialized" ? "warn" : "neutral"}>{p.status}</Chip>
                      {p.flags.map((f) => <Chip key={f} tone="bad">{f}</Chip>)}{" "}
                      <strong className="num">{naira(p.amount_kobo)}</strong>{p.channel ? ` · ${p.channel}` : ""} · {fmtDateTime(p.paid_at ?? p.created_at)}
                      <div><Link className="mono muted" href={`/admin/payments?q=${encodeURIComponent(p.reference)}`}>{p.reference}</Link></div>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="kicker">Refunds</h3>
              {refundsRes.error ? <ErrorBox what="refunds" error={refundsRes.error.message} /> : !refunds.length ? <p className="hint">No refunds.</p> : (
                <ul className={s.tl}>
                  {refunds.map((r) => (
                    <li key={r.id} className="small">
                      <Chip tone={r.status === "success" ? "good" : r.status === "failed" ? "bad" : "warn"}>{r.status}</Chip>{" "}
                      <strong className="num">{naira(r.amount_kobo)}</strong> · {REFUND_PURPOSE_LABEL[r.purpose] ?? r.purpose} · {r.method}
                      {r.reason && <div className="muted">{r.reason}</div>}
                      {r.provider_ref && <div className="mono muted">{r.provider_ref}</div>}
                      {r.processed_at && <div className="muted">{fmtDateTime(r.processed_at)} · {names.get(r.processed_by ?? "") ?? ""}</div>}
                    </li>
                  ))}
                </ul>
              )}
              {can(staff.role, "refunds.process") && (
                <details className="inline" open={na.anchor === "#money" && na.label.startsWith("Queue refund") || undefined}>
                  <summary>Add refund</summary>
                  <ActionForm action={addRefund} className="grid gap-2" resetOnSuccess confirm={`Add this refund on ${ref} to Finance’s queue? Pay it from the refund queue once the money is sent.`}>
                    <input type="hidden" name="booking_id" value={id} />
                    <div className="cols-2">
                      <label className="field"><span className="field-label">For</span>
                        <select className="control" name="purpose" defaultValue="goodwill" required>
                          <option value="goodwill">{REFUND_PURPOSE_LABEL.goodwill}</option>
                          <option value="claim_balance">{REFUND_PURPOSE_LABEL.claim_balance}</option>
                          {hasDeposit && <option value="deposit">{REFUND_PURPOSE_LABEL.deposit}</option>}
                        </select></label>
                      <label className="field"><span className="field-label">Amount (₦)</span>
                        <input className="control" name="amount" inputMode="decimal" required defaultValue={hasDeposit && !depositQueued ? nairaInput(b.deposit_kobo) : ""} /></label>
                    </div>
                    <label className="field"><span className="field-label">Reason</span>
                      <input className="control" name="reason" required minLength={3} placeholder="e.g. Late delivery, ₦5,000 goodwill agreed on WhatsApp" /></label>
                    <div className="actions"><Submit className="btn btn-secondary btn-sm">Queue refund</Submit></div>
                  </ActionForm>
                </details>
              )}
              {can(staff.role, "refunds.process") && <Link className="btn btn-quiet btn-sm" href="/admin/payments/refunds">Open the refund queue</Link>}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
