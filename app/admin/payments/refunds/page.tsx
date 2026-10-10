import { CircleCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { updateRefund } from "@/app/admin/_actions/money";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Callout, DescriptionList, Drawer, EmptyState, ErrorState, Field, PageHead, Pagination, RefundStatusChip, Tabs } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { namesFor } from "@/lib/admin/data";
import { fmtDateTime, naira } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { humanize, PAYMENT_CHANNEL_LABEL, REFUND_METHOD_LABEL, REFUND_PURPOSE_LABEL, REFUND_STATUSES } from "@/lib/admin/status";
import { one, type RefundRow } from "@/lib/admin/types";
import { first, hrefWith, PAGE_SIZE, pageOf, rangeOf, type SearchParams } from "@/lib/admin/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Refunds" };

type Row = RefundRow & {
  bookings: { id: string; ref: string; renter_id: string } | { id: string; ref: string; renter_id: string }[] | null;
  payments: { reference: string; channel: string } | { reference: string; channel: string }[] | null;
};

const TABS: [string, string][] = [["open", "To do"], ["queued", "Queued"], ["processing", "Processing"], ["success", "Refunded"], ["failed", "Failed"], ["all", "All"]];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;
function applyStatus(q: Q, status: string): Q {
  if (status === "open") return q.in("status", ["queued", "processing"]);
  if ((REFUND_STATUSES as readonly string[]).includes(status)) return q.eq("status", status);
  return q;
}

export default async function RefundsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await pageStaff("payments.view");
  const sp = await searchParams;
  const status = TABS.some(([k]) => k === first(sp.status)) ? first(sp.status) : "open";
  const page = pageOf(sp);
  const current = Object.fromEntries(Object.entries({ status, page: page > 1 ? String(page) : "" }).filter(([, v]) => v)) as Record<string, string>;
  const db = await createClient();
  const [lo, hi] = rangeOf(page);
  const [res, totalRes, ...counts] = await Promise.all([
    applyStatus(db.from("refunds").select(
      "id, booking_id, payment_id, purpose, amount_kobo, method, status, provider_ref, reason, requested_by, processed_by, processed_at, created_at, bookings(id, ref, renter_id), payments(reference, channel)",
      { count: "exact" },
    ), status).order("created_at", { ascending: status === "open" }).range(lo, hi),
    applyStatus(db.from("refunds").select("amount_kobo"), status).limit(2000),
    ...TABS.map(([k]) => applyStatus(db.from("refunds").select("id", { count: "exact", head: true }), k)),
  ]);
  const { data, error, count } = res as { data: Row[] | null; error: { message: string } | null; count: number | null };
  const rows = data ?? [];
  const names = await namesFor(db, [...rows.map((r) => one(r.bookings)?.renter_id), ...rows.map((r) => r.processed_by)]);
  const process = can(staff.role, "refunds.process");
  const total = ((totalRes as { data: { amount_kobo: number }[] | null }).data ?? []).reduce((s, r) => s + Number(r.amount_kobo), 0);
  const n = (r: unknown) => (r as { count: number | null }).count;

  return (
    <div className="adm-page">
      <PageHead crumbs={[{ href: "/admin/payments", label: "Payments" }]} title="Refunds"
        meta={count ? <span className="tabular">{count} refund{count === 1 ? "" : "s"} · {naira(total)}</span> : undefined} />

      <Tabs label="Refund status" items={TABS.map(([k, l], i) => ({
        href: k === "open" ? "/admin/payments/refunds" : `/admin/payments/refunds?status=${k}`, label: l, count: n(counts[i]), current: status === k,
      }))} />

      {!process && <Callout tone="info">View only. Finance, Admin and Owner record refunds.</Callout>}

      {error ? <ErrorState what="refunds" error={error.message} /> : rows.length === 0 ? (
        status === "open"
          ? <EmptyState icon={CircleCheck} title="Nothing to refund">Refunds land here when a booking is cancelled, paid twice, or paid after the gear went.</EmptyState>
          : <EmptyState icon={Undo2} title="No refunds here" />
      ) : (
        <div>
          <div className="tbl-wrap">
            <table className="tbl rows-link">
              <thead>
                <tr><th>Queued</th><th>Booking</th><th>Renter</th><th>Reason</th><th className="num">Amount</th><th>Original payment</th><th>Status</th><th className="shrink">{process ? <span className="sr-only">Record</span> : "Processed"}</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = one(r.bookings), p = one(r.payments);
                  const open = r.status === "queued" || r.status === "processing" || r.status === "failed";
                  return (
                    <tr key={r.id}>
                      <td className="nowrap">{fmtDateTime(r.created_at)}</td>
                      <td className="nowrap">{b ? <Link className="rowlink mono" href={`/admin/bookings/${b.id}`}>{b.ref}</Link> : <span className="subtle">None</span>}</td>
                      <td>{b ? names.get(b.renter_id) ?? "Renter" : <span className="subtle">Unknown</span>}</td>
                      <td className="wrap">{REFUND_PURPOSE_LABEL[r.purpose] ?? humanize(r.purpose)}{r.reason && <span className="sub">{r.reason}</span>}</td>
                      <td className="num money">{naira(r.amount_kobo)}</td>
                      <td>{p ? <><span className="mono">{p.reference}</span>{p.channel && <span className="sub">{PAYMENT_CHANNEL_LABEL[p.channel] ?? humanize(p.channel)}</span>}</> : <span className="subtle">None</span>}</td>
                      <td><RefundStatusChip status={r.status} /></td>
                      <td className="shrink above">
                        {process && open ? (
                          <Drawer trigger={{ label: r.status === "failed" ? "Retry" : "Record", variant: "secondary", size: "sm" }}
                            title={`Record a ${naira(r.amount_kobo)} refund`} description={<>{b?.ref && <span className="mono">{b.ref}</span>} · {b ? names.get(b.renter_id) ?? "Renter" : "Renter"}</>}>
                            <DescriptionList items={[
                              ["Reason", <>{REFUND_PURPOSE_LABEL[r.purpose] ?? humanize(r.purpose)}{r.reason && <span className="sub">{r.reason}</span>}</>],
                              ["Original payment", p ? <span className="mono">{p.reference}</span> : null],
                              ["Queued", fmtDateTime(r.created_at)],
                            ]} />
                            <ActionForm action={updateRefund} className="grid gap-4"
                              confirm={`Record this ${naira(r.amount_kobo)} refund? Only mark it paid once the money has actually been sent.`}>
                              <input type="hidden" name="refund_id" value={r.id} />
                              <Field label="How it was paid back">
                                <select className="control" name="method" defaultValue={r.method}>
                                  {Object.entries(REFUND_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                                </select>
                              </Field>
                              <Field label="Outcome">
                                <select className="control" name="status" defaultValue="success">
                                  <option value="success">Refunded (money sent)</option><option value="processing">Processing</option><option value="failed">Failed</option>
                                </select>
                              </Field>
                              <Field label="Reference" note="required when refunded" hint="The Paystack refund id or the bank transfer reference.">
                                <input className="control mono" name="provider_ref" defaultValue={r.provider_ref} />
                              </Field>
                              <div className="actions"><Submit>Save</Submit></div>
                            </ActionForm>
                          </Drawer>
                        ) : (
                          <span className="nowrap">
                            {REFUND_METHOD_LABEL[r.method] ?? humanize(r.method)}{r.provider_ref && <span className="sub mono">{r.provider_ref}</span>}
                            {r.processed_at && <span className="sub">{fmtDateTime(r.processed_at)} · {names.get(r.processed_by ?? "") ?? "Staff"}</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count} hrefFor={(pg) => hrefWith("/admin/payments/refunds", current, { page: pg > 1 ? String(pg) : null })} />
        </div>
      )}
    </div>
  );
}
