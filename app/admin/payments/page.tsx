import { CreditCard, Ellipsis, RefreshCw, SearchX, Undo2 } from "lucide-react";
import Link from "next/link";
import { recheckPayment } from "@/app/admin/_actions/money";
import { ActionForm, Submit } from "@/components/admin/action-form";
import {
  ActiveFilters, ButtonLink, Chip, DescriptionList, Drawer, EmptyState, ErrorState, FilterBar, PageHead, Pagination, PaymentStatusChip, Tabs,
} from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { safeSearch } from "@/lib/admin/data";
import { fmtDateTime, naira } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { humanize, PAYMENT_CHANNEL_LABEL, PAYMENT_PURPOSE_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUSES, paymentFlagLabel, STATUS_LABEL, type BookingStatus } from "@/lib/admin/status";
import { one, type PaymentRow } from "@/lib/admin/types";
import { first, hrefWith, PAGE_SIZE, pageOf, rangeOf, type SearchParams } from "@/lib/admin/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Payments" };

type B = { id: string; ref: string; status: string; needs_refund: boolean };
type Row = PaymentRow & { bookings: B | B[] | null };

const VIEWS = {
  attention: "Needs attention",
  success: "Paid",
  initialized: "Started, not paid",
  failed: "Failed",
} as const;
type View = keyof typeof VIEWS;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;
function applyView(q: Q, view: string): Q {
  if (view === "attention") return q.or("status.eq.mismatch,flags.cs.{duplicate}");
  if (view === "failed") return q.in("status", ["failed", "abandoned"]);
  if (view === "success" || view === "initialized") return q.eq("status", view);
  return q;
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await pageStaff("payments.view");
  const sp = await searchParams;
  const q = safeSearch(first(sp.q));
  // ?flag=attention|mismatch|duplicate (dashboard links) map onto the views and the status filter.
  const flag = first(sp.flag);
  const view = flag === "attention" || flag === "duplicate" ? "attention" : Object.hasOwn(VIEWS, first(sp.view)) ? first(sp.view) : "";
  const status = flag === "mismatch" ? "mismatch" : (PAYMENT_STATUSES as readonly string[]).includes(first(sp.status)) ? first(sp.status) : "";
  const page = pageOf(sp);
  const current = Object.fromEntries(Object.entries({ q, status, view, page: page > 1 ? String(page) : "" }).filter(([, v]) => v)) as Record<string, string>;
  const db = await createClient();

  let bookingIds: string[] = [];
  if (q) {
    const { data: bs } = await db.from("bookings").select("id").ilike("ref", `%${q}%`).limit(50);
    bookingIds = (bs ?? []).map((b) => b.id as string);
  }
  const narrow = (x: Q): Q => {
    let y = x;
    if (status) y = y.eq("status", status);
    if (q) y = y.or([`reference.ilike.%${q}%`, `paystack_id.eq.${q.replace(/\D/g, "") || "0"}`, ...(bookingIds.length ? [`booking_id.in.(${bookingIds.join(",")})`] : [])].join(","));
    return y;
  };
  const [lo, hi] = rangeOf(page);
  const countOf = (v: string) => applyView(narrow(db.from("payments").select("id", { count: "exact", head: true })), v);
  const viewKeys = Object.keys(VIEWS) as View[];
  const [res, ...counts] = await Promise.all([
    applyView(narrow(db.from("payments").select(
      "id, booking_id, purpose, reference, amount_kobo, fees_kobo, channel, status, flags, paystack_id, paid_at, created_at, bookings(id, ref, status, needs_refund)",
      { count: "exact" },
    )), view).order("created_at", { ascending: false }).range(lo, hi),
    countOf(""),
    ...viewKeys.map((k) => countOf(k)),
  ]);
  const { data, error, count } = res as { data: Row[] | null; error: { message: string } | null; count: number | null };
  const rows = data ?? [];
  const n = (r: unknown) => (r as { count: number | null }).count;
  const verify = can(staff.role, "payments.verify");

  const chips = [
    ...(q ? [{ label: <>Search: “{q}”</>, href: hrefWith("/admin/payments", current, { q: null }) }] : []),
    ...(status ? [{ label: <>Status: {PAYMENT_STATUS_LABEL[status] ?? humanize(status)}</>, href: hrefWith("/admin/payments", current, { status: null }) }] : []),
  ];

  return (
    <div className="adm-page">
      <PageHead title="Payments" meta={count != null ? <span>{count} payment{count === 1 ? "" : "s"}</span> : undefined}
        actions={<ButtonLink variant="secondary" icon={Undo2} href="/admin/payments/refunds">Refunds</ButtonLink>} />

      <Tabs label="Saved views" items={[
        { href: hrefWith("/admin/payments", current, { view: null }), label: "All", count: n(counts[0]), current: !view },
        ...viewKeys.map((k, i) => ({ href: hrefWith("/admin/payments", current, { view: k }), label: VIEWS[k], count: n(counts[i + 1]), current: view === k })),
      ]} />

      <div className="grid gap-3">
        <FilterBar action="/admin/payments" hidden={{ view }}
          search={{ name: "q", value: q, label: "Search payments", placeholder: "Payment reference, Paystack id or booking ref" }}
          selects={[{ name: "status", label: "Status", value: status, anyLabel: "Any status", options: PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] })) }]} />
        <ActiveFilters items={chips} clearHref={hrefWith("/admin/payments", { view }, {})} />
      </div>

      {error ? <ErrorState what="payments" error={error.message} /> : rows.length === 0 ? (
        q || status || view
          ? <EmptyState icon={SearchX} title="No payments match">Try a different reference or remove a filter.</EmptyState>
          : <EmptyState icon={CreditCard} title="No payments yet">They appear when a renter starts checkout.</EmptyState>
      ) : (
        <div>
          <div className="tbl-wrap">
            <table className="tbl rows-link">
              <thead>
                <tr><th>Created</th><th>Booking</th><th>Reference</th><th>Purpose</th><th className="num">Amount</th><th className="num">Fees</th><th>Channel</th><th>Status</th><th className="shrink"><span className="sr-only">Details</span></th></tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const b = one(p.bookings);
                  // Money received for a booking we can't honour (expired / cancelled before payment landed).
                  const unmatched = p.status === "success" && b && (b.needs_refund || b.status === "expired");
                  return (
                    <tr key={p.id}>
                      <td className="nowrap">{fmtDateTime(p.created_at)}{p.paid_at && <span className="sub">Paid {fmtDateTime(p.paid_at)}</span>}</td>
                      <td className="nowrap">{b ? <Link className="rowlink mono" href={`/admin/bookings/${b.id}`}>{b.ref}</Link> : <span className="subtle">None</span>}</td>
                      <td><span className="mono">{p.reference}</span>{p.paystack_id && <span className="sub mono">#{p.paystack_id}</span>}</td>
                      <td>{PAYMENT_PURPOSE_LABEL[p.purpose] ?? humanize(p.purpose)}</td>
                      <td className="num money">{naira(p.amount_kobo)}</td>
                      <td className="num muted">{p.fees_kobo ? naira(p.fees_kobo) : "None"}</td>
                      <td>{p.channel ? PAYMENT_CHANNEL_LABEL[p.channel] ?? humanize(p.channel) : <span className="subtle">Not set</span>}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <PaymentStatusChip status={p.status} />
                          {p.flags.map((f) => <Chip key={f} tone="bad">{paymentFlagLabel(f, naira)}</Chip>)}
                          {unmatched && <Chip tone="bad">Can’t honour</Chip>}
                        </div>
                      </td>
                      <td className="shrink above">
                        <Drawer trigger={{ label: `Details for ${p.reference}`, icon: Ellipsis, variant: "ghost", iconOnly: true }} title="Payment" description={<span className="mono">{p.reference}</span>}>
                          <DescriptionList items={[
                            ["Status", <PaymentStatusChip key="s" status={p.status} />],
                            ["Amount", <span key="a" className="tabular">{naira(p.amount_kobo)}</span>],
                            ["Fees", p.fees_kobo ? naira(p.fees_kobo) : null],
                            ["Purpose", PAYMENT_PURPOSE_LABEL[p.purpose] ?? humanize(p.purpose)],
                            ["Channel", p.channel ? PAYMENT_CHANNEL_LABEL[p.channel] ?? humanize(p.channel) : null],
                            ["Booking", b ? <Link key="b" className="link mono" href={`/admin/bookings/${b.id}`}>{b.ref}</Link> : null],
                            ["Booking status", b ? STATUS_LABEL[b.status as BookingStatus] ?? humanize(b.status) : null],
                            ["Paystack id", p.paystack_id ? <span key="p" className="mono">{p.paystack_id}</span> : null],
                            ["Started", fmtDateTime(p.created_at)],
                            ["Paid", p.paid_at ? fmtDateTime(p.paid_at) : null],
                            ["Flags", p.flags.length ? p.flags.map((f) => paymentFlagLabel(f, naira)).join(", ") : null],
                          ]} />
                          {verify ? (
                            <ActionForm action={recheckPayment} className="grid gap-2"
                              confirm={`Re-check ${p.reference} with Paystack? If Paystack says it succeeded, the booking is confirmed (or a refund is queued if the gear is gone).`}>
                              <input type="hidden" name="reference" value={p.reference} />
                              <Submit variant="secondary" icon={RefreshCw}>Re-check with Paystack</Submit>
                            </ActionForm>
                          ) : <p className="hint">Finance, Admin and Owner can re-check payments with Paystack.</p>}
                        </Drawer>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count} hrefFor={(pg) => hrefWith("/admin/payments", current, { page: pg > 1 ? String(pg) : null })} />
        </div>
      )}
    </div>
  );
}
