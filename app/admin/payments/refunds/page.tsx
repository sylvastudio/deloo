import Link from "next/link";
import { updateRefund } from "@/app/admin/_actions/money";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Chip, Empty, ErrorBox, PageHead } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { namesFor } from "@/lib/admin/data";
import { fmtDateTime, naira } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { REFUND_PURPOSE_LABEL, REFUND_STATUSES } from "@/lib/admin/status";
import { one, type RefundRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Refunds" };

type Row = RefundRow & {
  bookings: { id: string; ref: string; renter_id: string } | { id: string; ref: string; renter_id: string }[] | null;
  payments: { reference: string; channel: string } | { reference: string; channel: string }[] | null;
};
const METHOD: Record<string, string> = { manual: "Manual", transfer: "Bank transfer", paystack_refund: "Paystack refund" };

export default async function RefundsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await pageStaff("payments.view");
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const db = await createClient();
  let query = db.from("refunds")
    .select("id, booking_id, payment_id, purpose, amount_kobo, method, status, provider_ref, reason, requested_by, processed_by, processed_at, created_at, bookings(id, ref, renter_id), payments(reference, channel)")
    .order("created_at", { ascending: status === "open" }).limit(300);
  if (status === "open") query = query.in("status", ["queued", "processing"]);
  else if ((REFUND_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  const rows = (data ?? []) as Row[];
  const names = await namesFor(db, [...rows.map((r) => one(r.bookings)?.renter_id), ...rows.map((r) => r.processed_by)]);
  const process = can(staff.role, "refunds.process");
  const total = rows.reduce((s, r) => s + r.amount_kobo, 0);

  return (
    <div className="adm-page">
      <PageHead crumbs={[{ href: "/admin/payments", label: "Payments" }]} title="Refunds and deposits" />
      <div className="tabs" role="tablist" aria-label="Refund status">
        {[["open", "To do"], ["queued", "Queued"], ["processing", "Processing"], ["success", "Done"], ["failed", "Failed"], ["all", "All"]].map(([k, l]) => (
          <Link key={k} href={`/admin/payments/refunds?status=${k}`} className="tab" role="tab" aria-selected={status === k}>{l}</Link>
        ))}
      </div>
      {!process && <p className="hint">Only Finance, Admin and Owner can record refunds.</p>}
      {error ? <ErrorBox what="refunds" error={error.message} /> : rows.length === 0 ? (
        <Empty>{status === "open" ? "Nothing to refund right now." : "No refunds here."}</Empty>
      ) : (
        <>
          <p className="hint">{rows.length} refund{rows.length === 1 ? "" : "s"} · {naira(total)}</p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Queued</th><th>Booking</th><th>Renter</th><th>Purpose</th><th className="num">Amount</th><th>Original payment</th><th>Status</th><th>{process ? "Record" : "Processed"}</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const b = one(r.bookings), p = one(r.payments);
                  const open = r.status === "queued" || r.status === "processing" || r.status === "failed";
                  return (
                    <tr key={r.id}>
                      <td className="small">{fmtDateTime(r.created_at)}</td>
                      <td>{b ? <Link className="rowlink mono" href={`/admin/bookings/${b.id}`}>{b.ref}</Link> : "—"}</td>
                      <td className="small">{b ? names.get(b.renter_id) ?? "—" : "—"}</td>
                      <td className="small">{REFUND_PURPOSE_LABEL[r.purpose] ?? r.purpose}{r.reason && <div className="muted">{r.reason}</div>}</td>
                      <td className="num"><strong>{naira(r.amount_kobo)}</strong></td>
                      <td className="small mono">{p ? `${p.reference}${p.channel ? ` · ${p.channel}` : ""}` : "—"}</td>
                      <td><Chip tone={r.status === "success" ? "good" : r.status === "failed" ? "bad" : "warn"}>{r.status}</Chip></td>
                      <td style={{ minWidth: 260 }}>
                        {process && open ? (
                          <ActionForm action={updateRefund} className="grid gap-1" confirm={`Record this ${naira(r.amount_kobo)} refund? Only do this once the money has actually been sent.`}>
                            <input type="hidden" name="refund_id" value={r.id} />
                            <div className="flex gap-1">
                              <select className="control" name="method" defaultValue={r.method} aria-label="Method" style={{ minHeight: 30, padding: "2px 6px" }}>
                                {Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </select>
                              <select className="control" name="status" defaultValue="success" aria-label="Outcome" style={{ minHeight: 30, padding: "2px 6px" }}>
                                <option value="success">Paid</option><option value="processing">Processing</option><option value="failed">Failed</option>
                              </select>
                            </div>
                            <input className="control mono" name="provider_ref" defaultValue={r.provider_ref} placeholder="Paystack refund / transfer ref" aria-label="Provider reference" style={{ minHeight: 30, padding: "2px 6px" }} />
                            <Submit className="btn btn-sm">Save</Submit>
                          </ActionForm>
                        ) : (
                          <span className="small">{METHOD[r.method] ?? r.method}{r.provider_ref && <span className="mono"> · {r.provider_ref}</span>}
                            {r.processed_at && <div className="muted">{fmtDateTime(r.processed_at)} · {names.get(r.processed_by ?? "") ?? "Staff"}</div>}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
