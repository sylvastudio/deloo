import Link from "next/link";
import { notFound } from "next/navigation";
import { addNote, setBookingStatus, swapUnit, updateDelivery } from "@/app/admin/_actions/booking";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { EvidenceGallery } from "@/components/admin/evidence-gallery";
import { HandoverCapture } from "@/components/admin/handover-capture";
import { Chip, Empty, ErrorBox, PageHead, Section, StatusChip } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { evidenceCoverage, loadEvidence, namesFor, riderOwns } from "@/lib/admin/data";
import { fmtDateTime, fmtRental, naira, nairaInput } from "@/lib/admin/format";
import { can, maskPhone, maskText } from "@/lib/admin/roles";
import { EVIDENCE_FOR, HANDOVER_KINDS, movesFor, REFUND_PURPOSE_LABEL, STATUS_LABEL, type BookingStatus } from "@/lib/admin/status";
import { one, type BookingItemRow, type BookingRow, type PaymentRow, type RefundRow } from "@/lib/admin/types";
import { bookingMessages, mapsLink, telLink, waLink } from "@/lib/admin/whatsapp";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Booking" };

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

  const [itemsRes, profileRes, paymentsRes, refundsRes, notesRes, zonesRes, ridersRes, resvRes, auditRes, quoteRes] = await Promise.all([
    db.from("booking_items").select("id, booking_id, item_id, unit_id, item_name, day_rate_kobo, days, rental_kobo, deposit_kobo, kind, units(tag, serial)").eq("booking_id", id).order("created_at"),
    db.from("profiles").select("id, full_name, phone, blocked").eq("id", b.renter_id).maybeSingle(),
    db.from("payments").select("id, booking_id, purpose, reference, amount_kobo, fees_kobo, channel, status, flags, paystack_id, paid_at, created_at").eq("booking_id", id).order("created_at"),
    db.from("refunds").select("id, booking_id, payment_id, purpose, amount_kobo, method, status, provider_ref, reason, requested_by, processed_by, processed_at, created_at").eq("booking_id", id).order("created_at"),
    db.from("booking_notes").select("id, author_id, body, created_at").eq("booking_id", id).order("created_at", { ascending: false }),
    db.from("delivery_zones").select("id, name, price_kobo, active").order("sort"),
    db.from("staff_members").select("user_id, display_name, phone").eq("role", "rider").eq("active", true),
    db.from("reservations").select("id, unit_id, booking_item_id, period, live").eq("booking_id", id).eq("live", true),
    db.from("audit_log").select("id, actor_id, before, after, at").eq("entity", "bookings").eq("entity_id", id).order("at"),
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
  const swapOptions = new Map<string, { id: string; label: string }[]>();
  if (canSwap && rentalLines.length) {
    const itemIds = [...new Set(rentalLines.map((i) => i.item_id))];
    const period = reservations[0]?.period;
    const { data: units } = await db.from("units").select("id, item_id, tag, serial").in("item_id", itemIds).eq("status", "active");
    const busy = new Set<string>();
    if (period && units?.length) {
      const { data: clash } = await db.from("reservations").select("unit_id, booking_id").in("unit_id", units.map((u) => u.id)).eq("live", true).overlaps("period", period);
      for (const r of clash ?? []) busy.add(r.unit_id as string);
    }
    for (const it of itemIds) {
      swapOptions.set(it, (units ?? []).filter((u) => u.item_id === it && !busy.has(u.id as string))
        .map((u) => ({ id: u.id as string, label: [u.tag, u.serial].filter(Boolean).join(" · ") || (u.id as string).slice(0, 8) })));
    }
  }

  const evidence = await loadEvidence(db, [id]);
  const names = await namesFor(db, [...notes.map((n) => n.author_id), ...audit.map((a) => a.actor_id), ...refunds.map((r) => r.processed_by)]);
  const moves = movesFor(b.status, staff.role);
  const coverage = new Map<string, Awaited<ReturnType<typeof evidenceCoverage>>>();
  for (const m of moves) {
    const k = EVIDENCE_FOR[m.to];
    if (k && !coverage.has(k)) coverage.set(k, await evidenceCoverage(db, id, k));
  }

  const renterName = profile?.full_name ?? "Unknown renter";
  const phone = b.contact_phone || profile?.phone || "";
  const pii = can(staff.role, "pii.view");
  const messages = bookingMessages(b, renterName);
  const zone = zones.find((z) => z.id === b.delivery_zone_id);
  const editDelivery = can(staff.role, "bookings.edit");

  return (
    <div className="adm-page">
      <PageHead
        crumbs={staff.role === "rider" ? [{ href: "/admin/jobs", label: "Jobs" }] : [{ href: "/admin/bookings", label: "Bookings" }]}
        title={<span className="mono">{b.ref ?? id.slice(0, 8)}</span>}
        actions={<><StatusChip status={b.status} />{b.needs_refund && <Chip tone="bad">Needs refund</Chip>}</>}
      />

      <div className="card grid gap-2">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span>
            <span className="muted small">Renter </span>
            {can(staff.role, "customers.view")
              ? <Link href={`/admin/customers/${b.renter_id}`} style={{ color: "var(--lagoon)" }}>{renterName}</Link>
              : renterName}
            {profile?.blocked && <> <Chip tone="bad">Blocked</Chip></>}
          </span>
          <span><span className="muted small">Phone </span><span className="mono">{maskPhone(staff.role, phone) || "—"}</span></span>
          <span><span className="muted small">Days </span>{fmtRental(b.starts_at, b.ends_at)} ({b.days})</span>
          <span><span className="muted small">Total </span><strong className="mono">{naira(b.total_kobo)}</strong></span>
          <span><span className="muted small">{b.delivery === "pickup" ? "Pickup at base" : "Delivery"}</span></span>
          {b.status === "hold" && b.hold_expires_at && <span className="muted small">Hold until {fmtDateTime(b.hold_expires_at)}</span>}
          {b.cancel_reason && <span className="muted small">Cancel reason: {b.cancel_reason}</span>}
        </div>

        {moves.length > 0 ? (
          <div className="grid gap-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <p className="kicker">Next</p>
            <div className="flex flex-wrap gap-2 items-start">
              {moves.map((m) => {
                const kind = EVIDENCE_FOR[m.to];
                const cov = kind ? coverage.get(kind) : undefined;
                const missingEvidence = !!cov && !cov.complete;
                const simple = !m.note && !missingEvidence;
                if (simple) {
                  return (
                    <ActionForm key={m.to} action={setBookingStatus} confirm={`${m.label}? The booking moves to “${STATUS_LABEL[m.to]}”.`}>
                      <input type="hidden" name="booking_id" value={id} />
                      <input type="hidden" name="to" value={m.to} />
                      <Submit className={m.danger ? "btn btn-secondary" : "btn"}>{m.label}</Submit>
                    </ActionForm>
                  );
                }
                return (
                  <details key={m.to} className="card" style={{ padding: 10, minWidth: 260, flex: "1 1 260px" }}>
                    <summary className={m.danger ? "btn btn-secondary" : "btn"} style={{ listStyle: "none" }}>{m.label}…</summary>
                    <ActionForm action={setBookingStatus} className="grid gap-2" confirm={m.to === "cancelled" ? "Cancel this booking? Its units are released straight away." : `${m.label}?`}>
                      <input type="hidden" name="booking_id" value={id} />
                      <input type="hidden" name="to" value={m.to} />
                      {missingEvidence && cov && (
                        <div className="warn-box">
                          {cov.units.length === 0 ? "No units are assigned." : `No ${kind} photos yet for ${cov.missing.length} of ${cov.units.length} unit${cov.units.length === 1 ? "" : "s"}. Add them below in Evidence.`}
                          {staff.role !== "rider" && (
                            <label className="switch" style={{ marginTop: 6 }}><input type="checkbox" name="override" /> Continue without the photos</label>
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
                      {m.to === "cancelled" && (
                        <label className="field">
                          <span className="field-label">Refund (₦) <span className="opt">policy: {naira(refundQuote)}</span></span>
                          <input className="control" name="refund" inputMode="decimal" defaultValue={nairaInput(refundQuote)} disabled={!can(staff.role, "refunds.process")} />
                          {!can(staff.role, "refunds.process") && <span className="hint">Finance queues the refund; we’ll note the amount on the booking.</span>}
                        </label>
                      )}
                      <Submit className={m.danger ? "btn btn-secondary" : "btn"}>Confirm: {m.label}</Submit>
                    </ActionForm>
                  </details>
                );
              })}
            </div>
          </div>
        ) : (
          staff.role !== "readonly" && <p className="hint" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>No status moves available to your role from here.</p>
        )}
      </div>

      <div className="split">
        <div className="grid gap-4">
          <Section title="Items and units">
            {itemsRes.error ? <ErrorBox what="items" error={itemsRes.error.message} /> : !items.length ? <Empty>No items on this booking.</Empty> : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Item</th><th>Unit (tag · serial)</th><th className="num">Rate</th><th className="num">Rental</th>{hasDeposit && <th className="num">Deposit</th>}{canSwap && <th>Swap</th>}</tr></thead>
                  <tbody>
                    {items.map((i) => {
                      const u = one(i.units);
                      const opts = (swapOptions.get(i.item_id) ?? []).filter((o) => o.id !== i.unit_id);
                      return (
                        <tr key={i.id}>
                          <td>{i.item_name}{i.kind === "extension" && <> <Chip tone="info">Extension</Chip></>}</td>
                          <td className="mono">{u ? [u.tag, u.serial].filter(Boolean).join(" · ") || "—" : <span className="muted">Not assigned</span>}</td>
                          <td className="num">{naira(i.day_rate_kobo)}×{i.days}</td>
                          <td className="num">{naira(i.rental_kobo)}</td>
                          {hasDeposit && <td className="num">{naira(i.deposit_kobo)}</td>}
                          {canSwap && (
                            <td>
                              {i.kind === "rental" && (opts.length ? (
                                <ActionForm action={swapUnit} className="flex gap-1" confirm="Swap to this unit? The old unit is released for these dates.">
                                  <input type="hidden" name="booking_item_id" value={i.id} />
                                  <select className="control" name="unit_id" style={{ minWidth: 120, minHeight: 30, padding: "2px 6px" }} aria-label="Free unit" required defaultValue="">
                                    <option value="" disabled>Free unit…</option>
                                    {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                  </select>
                                  <Submit className="btn btn-secondary btn-sm">Swap</Submit>
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
              <div className="card" style={{ background: "var(--paper)" }}>
                <HandoverCapture
                  bookingId={id}
                  units={rentalLines.filter((i) => i.unit_id).map((i) => ({ unitId: i.unit_id as string, label: unitLabel(i) }))}
                  kinds={[...HANDOVER_KINDS]}
                  defaultKind={b.status === "confirmed" || b.status === "preparing" ? "dispatch" : b.status === "out_for_delivery" ? "delivery" : b.status === "delivered" ? "collection" : "inspection"}
                />
              </div>
            )}
          </Section>

          <Section title="Money">
            <dl className="dl">
              <dt>Rental</dt><dd className="mono">{naira(b.rental_kobo)}</dd>
              <dt>Deloo Protection (damage cover)</dt><dd className="mono">{naira(b.protection_kobo)}</dd>
              <dt>Delivery</dt><dd className="mono">{naira(b.delivery_kobo)}</dd>
              {hasDeposit && <><dt>Deposit (refundable, older booking)</dt><dd className="mono">{naira(b.deposit_kobo)}</dd></>}
              <dt><strong>Total</strong></dt><dd className="mono"><strong>{naira(b.total_kobo)}</strong></dd>
            </dl>
            <h3 className="kicker">Payments</h3>
            {paymentsRes.error ? <ErrorBox what="payments" error={paymentsRes.error.message} /> : !payments.length ? <p className="hint">No payment started.</p> : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Reference</th><th>Status</th><th>Channel</th><th className="num">Amount</th><th>Paid at</th></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="mono"><Link className="rowlink" href={`/admin/payments?q=${encodeURIComponent(p.reference)}`}>{p.reference}</Link></td>
                        <td><Chip tone={p.status === "success" ? "good" : p.status === "mismatch" ? "bad" : p.status === "initialized" ? "warn" : "neutral"}>{p.status}</Chip>{p.flags.map((f) => <Chip key={f} tone="bad">{f}</Chip>)}</td>
                        <td className="small">{p.channel || "—"}</td>
                        <td className="num">{naira(p.amount_kobo)}</td>
                        <td className="small">{fmtDateTime(p.paid_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h3 className="kicker">Refunds</h3>
            {refundsRes.error ? <ErrorBox what="refunds" error={refundsRes.error.message} /> : !refunds.length ? <p className="hint">No refunds.</p> : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Purpose</th><th>Status</th><th>Method</th><th className="num">Amount</th><th>Processed</th></tr></thead>
                  <tbody>
                    {refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="small">{REFUND_PURPOSE_LABEL[r.purpose] ?? r.purpose}{r.reason && <div className="muted">{r.reason}</div>}</td>
                        <td><Chip tone={r.status === "success" ? "good" : r.status === "failed" ? "bad" : "warn"}>{r.status}</Chip></td>
                        <td className="small">{r.method}{r.provider_ref && <div className="mono muted">{r.provider_ref}</div>}</td>
                        <td className="num">{naira(r.amount_kobo)}</td>
                        <td className="small">{r.processed_at ? `${fmtDateTime(r.processed_at)} · ${names.get(r.processed_by ?? "") ?? ""}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {can(staff.role, "refunds.process") && <Link className="btn btn-quiet btn-sm" href="/admin/payments/refunds">Open the refund queue</Link>}
          </Section>
        </div>

        <div className="grid gap-4">
          <Section title="Delivery">
            {b.delivery === "pickup" && <p className="notice">Renter picks up at base.</p>}
            {editDelivery ? (
              <ActionForm action={updateDelivery} className="grid gap-3">
                <input type="hidden" name="booking_id" value={id} />
                <label className="field"><span className="field-label">Address</span>
                  <textarea className="control" name="address" rows={2} defaultValue={b.address} style={{ minHeight: 60 }} /></label>
                {b.address && <a className="small" style={{ color: "var(--lagoon)" }} href={mapsLink(b.address)} target="_blank" rel="noreferrer">Open in Maps</a>}
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
                    <input className="control" name="collection_slot" defaultValue={b.collection_slot} placeholder="e.g. 6–8pm" /></label>
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
            ) : (
              <dl className="dl">
                <dt>Address</dt><dd>{maskText(staff.role, b.address) || "—"}{pii && b.address && <> · <a href={mapsLink(b.address)} target="_blank" rel="noreferrer" style={{ color: "var(--lagoon)" }}>Maps</a></>}</dd>
                <dt>Zone</dt><dd>{zone?.name ?? "—"}</dd>
                <dt>Delivery slot</dt><dd>{b.delivery_slot || "—"}</dd>
                <dt>Collection slot</dt><dd>{b.collection_slot || "—"}</dd>
                <dt>Rider</dt><dd>{b.rider_name || "—"} {b.rider_phone && <span className="mono">{b.rider_phone}</span>}</dd>
              </dl>
            )}
          </Section>

          {pii && (
            <Section title="Messages">
              {phone ? (
                <div className="grid gap-2">
                  <div className="actions">
                    {telLink(phone) && <a className="btn btn-secondary btn-sm" href={telLink(phone)}>Call {renterName.split(" ")[0]}</a>}
                  </div>
                  {messages.map((m) => {
                    const href = waLink(phone, m.text);
                    return (
                      <div key={m.key} className="grid gap-1" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                        <div className="flex items-center justify-between gap-2">
                          <strong className="small">{m.label}</strong>
                          {href ? <a className="btn btn-secondary btn-sm" href={href} target="_blank" rel="noreferrer">WhatsApp</a> : <span className="muted small">Phone not usable</span>}
                        </div>
                        <p className="muted small" style={{ margin: 0 }}>{m.text}</p>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="hint">No phone number on this booking.</p>}
            </Section>
          )}

          <Section title="Notes">
            {can(staff.role, "notes.write") && (
              <ActionForm action={addNote} className="grid gap-2" resetOnSuccess>
                <input type="hidden" name="booking_id" value={id} />
                <textarea className="control" name="body" rows={2} required placeholder="Internal note (renters never see these)" style={{ minHeight: 60 }} aria-label="New note" />
                <div className="actions"><Submit className="btn btn-secondary btn-sm">Add note</Submit></div>
              </ActionForm>
            )}
            {notesRes.error ? <ErrorBox what="notes" error={notesRes.error.message} /> : !notes.length ? <p className="hint">No notes yet.</p> : (
              <ul className="grid gap-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {notes.map((n) => (
                  <li key={n.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.body}</p>
                    <p className="muted small" style={{ margin: 0 }}>{names.get(n.author_id ?? "") ?? "System"} · {fmtDateTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {!auditRes.error && (
            <Section title="Timeline">
              <ul className="grid gap-1 small" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                <li><span className="muted">{fmtDateTime(b.created_at)}</span> · Hold placed</li>
                {b.confirmed_at && <li><span className="muted">{fmtDateTime(b.confirmed_at)}</span> · Payment confirmed</li>}
                {audit.filter((a) => a.before?.status !== a.after?.status).map((a) => (
                  <li key={a.id}>
                    <span className="muted">{fmtDateTime(a.at)}</span> · {STATUS_LABEL[(a.before?.status ?? "") as BookingStatus] ?? a.before?.status} → <strong>{STATUS_LABEL[(a.after?.status ?? "") as BookingStatus] ?? a.after?.status}</strong>
                    <span className="muted"> · {a.actor_id ? names.get(a.actor_id) ?? "Staff" : "System"}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
