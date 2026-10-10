import Link from "next/link";
import { Chip, Empty, ErrorBox, PageHead, StatusChip } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { safeSearch } from "@/lib/admin/data";
import { addDays, dayStart, fmtDateTime, fmtRental, lagosDay, naira } from "@/lib/admin/format";
import { maskPhone } from "@/lib/admin/roles";
import { LIVE_STATUSES, STATUS_LABEL, STATUS_ORDER, type BookingStatus } from "@/lib/admin/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Bookings" };

const VIEWS: Record<string, string> = {
  deliveries_today: "Deliveries today",
  collections_today: "Collections today",
  tomorrow: "Going out tomorrow",
  holds_expiring: "Holds expiring in 15 min",
  needs_refund: "Paid but can’t honour",
};

type Row = {
  id: string; ref: string | null; renter_id: string; status: BookingStatus; starts_at: string; ends_at: string; days: number;
  total_kobo: number; delivery: string; delivery_slot: string; rider_name: string; contact_phone: string; needs_refund: boolean;
  hold_expires_at: string | null;
  booking_items: { item_name: string; kind: string; units: { tag: string } | { tag: string }[] | null }[];
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function BookingsPage({ searchParams }: { searchParams: SP }) {
  const staff = await pageStaff("bookings.view");
  const sp = await searchParams;
  const q = safeSearch(first(sp.q));
  const status = first(sp.status);
  const from = first(sp.from);
  const to = first(sp.to);
  const view = first(sp.view);
  const db = await createClient();

  const today = lagosDay();
  let query = db.from("bookings")
    .select("id, ref, renter_id, status, starts_at, ends_at, days, total_kobo, delivery, delivery_slot, rider_name, contact_phone, needs_refund, hold_expires_at, booking_items(item_name, kind, units(tag))")
    .limit(300);

  if (status === "live") query = query.in("status", LIVE_STATUSES);
  else if (status && (STATUS_ORDER as string[]).includes(status)) query = query.eq("status", status);

  // Date range: bookings whose rental days overlap [from, to] (Lagos).
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gt("ends_at", dayStart(from));
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lt("starts_at", dayStart(addDays(to, 1)));

  let ascending = false;
  if (view === "deliveries_today") {
    query = query.neq("delivery", "pickup").gte("starts_at", dayStart(today)).lt("starts_at", dayStart(addDays(today, 1))).not("status", "in", "(hold,expired,cancelled)");
    ascending = true;
  } else if (view === "tomorrow") {
    query = query.gte("starts_at", dayStart(addDays(today, 1))).lt("starts_at", dayStart(addDays(today, 2))).not("status", "in", "(hold,expired,cancelled)");
    ascending = true;
  } else if (view === "collections_today") {
    query = query.gt("ends_at", dayStart(today)).lte("ends_at", dayStart(addDays(today, 1))).in("status", ["delivered", "out_for_delivery"]);
    ascending = true;
  } else if (view === "holds_expiring") {
    const now = new Date();
    query = query.eq("status", "hold").gt("hold_expires_at", now.toISOString()).lte("hold_expires_at", new Date(now.getTime() + 15 * 60_000).toISOString());
    ascending = true;
  } else if (view === "needs_refund") {
    query = query.eq("needs_refund", true);
  }

  let nameIds: string[] = [];
  if (q) {
    const { data: people } = await db.from("profiles").select("id").ilike("full_name", `%${q}%`).limit(50);
    nameIds = (people ?? []).map((p) => p.id as string);
    const ors = [`ref.ilike.%${q}%`, `contact_phone.ilike.%${q.replace(/\s/g, "")}%`, `rider_name.ilike.%${q}%`];
    if (nameIds.length) ors.push(`renter_id.in.(${nameIds.join(",")})`);
    query = query.or(ors.join(","));
  }

  const { data, error } = await query.order("starts_at", { ascending });
  const rows = (data ?? []) as Row[];

  const renterIds = [...new Set(rows.map((r) => r.renter_id))];
  const { data: profiles } = renterIds.length
    ? await db.from("profiles").select("id, full_name, phone").in("id", renterIds)
    : { data: [] as { id: string; full_name: string; phone: string }[] };
  const people = new Map((profiles ?? []).map((p) => [p.id as string, p as { full_name: string; phone: string }]));

  const filtered = !!(q || status || from || to || view);

  return (
    <div className="adm-page">
      <PageHead title={view && VIEWS[view] ? VIEWS[view] : "Bookings"} kicker={view && VIEWS[view] ? "Bookings" : undefined} />

      <form className="filters" method="get" role="search">
        <label className="field grow">
          <span className="field-label">Search</span>
          <input className="control" name="q" defaultValue={q} placeholder="Ref (DLO-…), renter name, phone or rider" />
        </label>
        <label className="field">
          <span className="field-label">Status</span>
          <select className="control" name="status" defaultValue={status}>
            <option value="">Any</option>
            <option value="live">In progress (confirmed → collected)</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">From <span className="opt">Lagos</span></span>
          <input className="control" type="date" name="from" defaultValue={from} />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input className="control" type="date" name="to" defaultValue={to} />
        </label>
        {view && <input type="hidden" name="view" value={view} />}
        <div className="actions">
          <button className="btn" type="submit">Filter</button>
          {filtered && <Link className="btn btn-quiet" href="/admin/bookings">Clear</Link>}
        </div>
      </form>

      <div className="actions" aria-label="Quick views">
        {Object.entries(VIEWS).map(([k, label]) => (
          <Link key={k} href={`/admin/bookings?view=${k}`} className="chip" aria-pressed={view === k}>{label}</Link>
        ))}
      </div>

      {error ? <ErrorBox what="bookings" error={error.message} /> : rows.length === 0 ? (
        <Empty>{filtered ? "No bookings match these filters." : "No bookings yet. They appear here as soon as a renter places a hold."}</Empty>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Ref</th><th>Renter</th><th>Items</th><th>Days (Lagos)</th><th className="num">Total</th><th>Status</th><th>Delivery</th><th>Rider</th></tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const p = people.get(b.renter_id);
                const items = b.booking_items.filter((i) => i.kind === "rental");
                return (
                  <tr key={b.id}>
                    <td><Link className="rowlink mono" href={`/admin/bookings/${b.id}`}>{b.ref ?? b.id.slice(0, 8)}</Link></td>
                    <td>
                      <div>{p?.full_name ?? <span className="muted">Unknown</span>}</div>
                      <div className="muted small mono">{maskPhone(staff.role, b.contact_phone || p?.phone || "")}</div>
                    </td>
                    <td className="small" style={{ maxWidth: 280 }}>
                      {items.length ? items.map((i, n) => {
                        const u = Array.isArray(i.units) ? i.units[0] : i.units;
                        return <div key={n}>{i.item_name}{u?.tag ? <span className="muted mono"> · {u.tag}</span> : null}</div>;
                      }) : <span className="muted">—</span>}
                    </td>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>{fmtRental(b.starts_at, b.ends_at)}<div className="muted">{b.days} day{b.days === 1 ? "" : "s"}</div></td>
                    <td className="num">{naira(b.total_kobo)}</td>
                    <td>
                      <StatusChip status={b.status} />
                      {b.needs_refund && <div style={{ marginTop: 4 }}><Chip tone="bad">Needs refund</Chip></div>}
                      {b.status === "hold" && b.hold_expires_at && <div className="muted small">until {fmtDateTime(b.hold_expires_at)}</div>}
                    </td>
                    <td className="small">{b.delivery === "pickup" ? "Pickup" : "Delivery"}{b.delivery_slot && <div className="muted">{b.delivery_slot}</div>}</td>
                    <td className="small">{b.rider_name || <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 300 && <p className="hint">Showing the first 300. Narrow the filters to see more.</p>}
    </div>
  );
}
