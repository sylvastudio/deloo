import Link from "next/link";
import { recheckPayment } from "@/app/admin/_actions/money";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Chip, Empty, ErrorBox, PageHead } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { safeSearch } from "@/lib/admin/data";
import { fmtDateTime, naira } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { PAYMENT_STATUSES } from "@/lib/admin/status";
import { one, type PaymentRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Payments" };

type Row = PaymentRow & { bookings: { id: string; ref: string; status: string; needs_refund: boolean } | { id: string; ref: string; status: string; needs_refund: boolean }[] | null };
const tone = (s: string) => (s === "success" ? "good" : s === "mismatch" || s === "failed" ? "bad" : s === "initialized" ? "warn" : "neutral") as "good" | "bad" | "warn" | "neutral";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await pageStaff("payments.view");
  const sp = await searchParams;
  const q = safeSearch(sp.q ?? "");
  const status = sp.status ?? "";
  const flag = sp.flag ?? "";
  const db = await createClient();

  let query = db.from("payments")
    .select("id, booking_id, purpose, reference, amount_kobo, fees_kobo, channel, status, flags, paystack_id, paid_at, created_at, bookings(id, ref, status, needs_refund)")
    .order("created_at", { ascending: false }).limit(300);
  if ((PAYMENT_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (flag === "duplicate") query = query.contains("flags", ["duplicate"]);
  if (flag === "mismatch") query = query.eq("status", "mismatch");
  if (flag === "attention") query = query.or("status.eq.mismatch,flags.cs.{duplicate}");
  if (q) {
    const { data: bs } = await db.from("bookings").select("id").ilike("ref", `%${q}%`).limit(50);
    const ids = (bs ?? []).map((b) => b.id as string);
    query = query.or([`reference.ilike.%${q}%`, `paystack_id.eq.${q.replace(/\D/g, "") || "0"}`, ...(ids.length ? [`booking_id.in.(${ids.join(",")})`] : [])].join(","));
  }
  const { data, error } = await query;
  const rows = (data ?? []) as Row[];
  const verify = can(staff.role, "payments.verify");
  const filtered = !!(q || status || flag);

  return (
    <div className="adm-page">
      <PageHead title="Payments" actions={<Link className="btn btn-secondary" href="/admin/payments/refunds">Refunds queue</Link>} />
      <form className="filters" method="get" role="search">
        <label className="field grow"><span className="field-label">Search</span>
          <input className="control" name="q" defaultValue={q} placeholder="Payment reference, Paystack id or booking ref" /></label>
        <label className="field"><span className="field-label">Status</span>
          <select className="control" name="status" defaultValue={status}>
            <option value="">Any</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></label>
        <label className="field"><span className="field-label">Flag</span>
          <select className="control" name="flag" defaultValue={flag}>
            <option value="">Any</option>
            <option value="attention">Needs attention</option>
            <option value="duplicate">Duplicate</option>
            <option value="mismatch">Amount mismatch</option>
          </select></label>
        <div className="actions"><button className="btn" type="submit">Filter</button>{filtered && <Link className="btn btn-quiet" href="/admin/payments">Clear</Link>}</div>
      </form>

      {error ? <ErrorBox what="payments" error={error.message} /> : rows.length === 0 ? (
        <Empty>{filtered ? "No payments match." : "No payments yet. They appear when a renter starts checkout."}</Empty>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Created</th><th>Reference</th><th>Booking</th><th>Purpose</th><th className="num">Amount</th><th className="num">Fees</th><th>Channel</th><th>Status</th><th>Paid at</th>{verify && <th></th>}</tr></thead>
            <tbody>
              {rows.map((p) => {
                const b = one(p.bookings);
                // Money received for a booking we can't honour (expired / cancelled before payment landed).
                const unmatched = p.status === "success" && b && (b.needs_refund || b.status === "expired");
                return (
                  <tr key={p.id}>
                    <td className="small">{fmtDateTime(p.created_at)}</td>
                    <td className="mono">{p.reference}{p.paystack_id && <div className="muted">#{p.paystack_id}</div>}</td>
                    <td>{b ? <Link className="rowlink mono" href={`/admin/bookings/${b.id}`}>{b.ref}</Link> : "—"}</td>
                    <td className="small">{p.purpose}</td>
                    <td className="num">{naira(p.amount_kobo)}</td>
                    <td className="num muted">{p.fees_kobo ? naira(p.fees_kobo) : "—"}</td>
                    <td className="small">{p.channel || "—"}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Chip tone={tone(p.status)}>{p.status}</Chip>
                        {p.flags.map((f) => <Chip key={f} tone="bad">{f.startsWith("amount_") ? `paid ${naira(Number(f.slice(7)) || 0)}` : f}</Chip>)}
                        {unmatched && <Chip tone="bad">unmatched</Chip>}
                      </div>
                    </td>
                    <td className="small">{fmtDateTime(p.paid_at)}</td>
                    {verify && (
                      <td>
                        <ActionForm action={recheckPayment} confirm={`Re-check ${p.reference} with Paystack? If it succeeded, the booking is confirmed.`}>
                          <input type="hidden" name="reference" value={p.reference} />
                          <Submit className="btn btn-quiet btn-sm">Re-check</Submit>
                        </ActionForm>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
