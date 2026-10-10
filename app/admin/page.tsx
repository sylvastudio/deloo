import Link from "next/link";
import { ErrorBox, Empty, PageHead, Section, StatusChip } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { addDays, dayStart, fmtRental, fmtWeekday, lagosDay } from "@/lib/admin/format";
import { maskText } from "@/lib/admin/roles";
import { LIVE_STATUSES, type BookingStatus } from "@/lib/admin/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

type Job = { id: string; ref: string | null; status: BookingStatus; starts_at: string; ends_at: string; address: string; delivery_slot: string; collection_slot: string; rider_name: string };

export default async function Dashboard() {
  const staff = await pageStaff("dashboard");
  const db = await createClient();
  const today = lagosDay();
  const t0 = dayStart(today), t1 = dayStart(addDays(today, 1)), t2 = dayStart(addDays(today, 2));
  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const count = { count: "exact" as const, head: true };
  const notDead = "(hold,expired,cancelled)";

  const [deliveries, collections, holds, awaitingPrep, refundsQueued, needsRefund, unmet, mismatch, deliveryList, collectionList, live, withRenters] = await Promise.all([
    db.from("bookings").select("id", count).neq("delivery", "pickup").gte("starts_at", t0).lt("starts_at", t1).not("status", "in", notDead),
    // Last rental day today ⇔ ends_at is tomorrow 00:00 Lagos.
    db.from("bookings").select("id", count).gt("ends_at", t0).lte("ends_at", t1).in("status", ["delivered", "out_for_delivery"]),
    db.from("bookings").select("id", count).eq("status", "hold").gt("hold_expires_at", now.toISOString()).lte("hold_expires_at", soon),
    db.from("bookings").select("id", count).eq("status", "confirmed"),
    db.from("refunds").select("id", count).in("status", ["queued", "processing"]),
    db.from("bookings").select("id", count).eq("needs_refund", true),
    db.from("unmet_demand").select("id", count).gte("created_at", weekAgo),
    db.from("payments").select("id", count).or("status.eq.mismatch,flags.cs.{duplicate}"),
    db.from("bookings").select("id, ref, status, starts_at, ends_at, address, delivery_slot, collection_slot, rider_name")
      .gte("starts_at", t0).lt("starts_at", t2).not("status", "in", notDead).order("starts_at").limit(50),
    db.from("bookings").select("id, ref, status, starts_at, ends_at, address, delivery_slot, collection_slot, rider_name")
      .gt("ends_at", t0).lte("ends_at", t2).in("status", ["delivered", "out_for_delivery", "preparing", "confirmed"]).order("ends_at").limit(50),
    // Whatever the dates: every paid booking still in progress, and the gear that's out with renters now.
    // (The tiles above only look at today, so a booking that starts later would otherwise vanish from here.)
    db.from("bookings").select("id", count).in("status", LIVE_STATUSES),
    db.from("bookings").select("id", count).in("status", ["out_for_delivery", "delivered"]),
  ]);

  const failed = [deliveries, collections, holds, awaitingPrep, refundsQueued, needsRefund, unmet, mismatch, live, withRenters].find((r) => r.error);
  const tiles: { n: number | null; label: string; href: string; alert?: boolean }[] = [
    { n: live.count, label: "Live bookings (any date)", href: `/admin/bookings?status=live` },
    { n: withRenters.count, label: "Out with renters now", href: `/admin/bookings?status=live` },
    { n: deliveries.count, label: "Deliveries today", href: `/admin/bookings?view=deliveries_today` },
    { n: collections.count, label: "Collections today", href: `/admin/bookings?view=collections_today` },
    { n: holds.count, label: "Holds expiring in 15 min", href: `/admin/bookings?view=holds_expiring` },
    { n: awaitingPrep.count, label: "Confirmed, awaiting prep", href: `/admin/bookings?status=confirmed` },
    { n: refundsQueued.count, label: "Refunds queued", href: `/admin/payments/refunds?status=open`, alert: (refundsQueued.count ?? 0) > 0 },
    { n: needsRefund.count, label: "Paid, can’t honour (needs refund)", href: `/admin/bookings?view=needs_refund`, alert: (needsRefund.count ?? 0) > 0 },
    { n: mismatch.count, label: "Payments needing attention", href: `/admin/payments?flag=attention`, alert: (mismatch.count ?? 0) > 0 },
    { n: unmet.count, label: "Unmet demand this week", href: `/admin/demand` },
  ];

  const jobs = (rows: Job[] | null, kind: "out" | "in") => {
    const list = rows ?? [];
    if (!list.length) return <Empty>{kind === "out" ? "No deliveries or pickups today or tomorrow." : "No returns due today or tomorrow."}</Empty>;
    return (
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Day</th><th>Ref</th><th>Status</th><th>Slot</th><th>Address</th><th>Rider</th></tr></thead>
          <tbody>
            {list.map((b) => {
              const day = kind === "out" ? lagosDay(b.starts_at) : addDays(lagosDay(b.ends_at), -1);
              return (
                <tr key={b.id}>
                  <td className="small">{day === today ? <strong>Today</strong> : fmtWeekday(day)}</td>
                  <td><Link className="rowlink mono" href={`/admin/bookings/${b.id}`}>{b.ref ?? "—"}</Link><div className="muted small">{fmtRental(b.starts_at, b.ends_at)}</div></td>
                  <td><StatusChip status={b.status} /></td>
                  <td className="small">{(kind === "out" ? b.delivery_slot : b.collection_slot) || <span className="muted">—</span>}</td>
                  <td className="small">{b.address ? maskText(staff.role, b.address) : <span className="muted">Pickup at base</span>}</td>
                  <td className="small">{b.rider_name || <span className="muted">Not assigned</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="adm-page">
      <PageHead kicker={fmtWeekday(today)} title="Today" />
      {failed?.error ? <ErrorBox what="the dashboard" error={failed.error.message} /> : (
        <div className="tiles">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="tile" data-alert={t.alert ? "true" : undefined}>
              <span className="n">{t.n ?? "—"}</span>
              <span className="l">{t.label}</span>
            </Link>
          ))}
        </div>
      )}
      <div className="cols-2">
        <Section title="Going out" actions={<Link className="btn btn-quiet btn-sm" href="/admin/jobs">Jobs view</Link>}>
          {deliveryList.error ? <ErrorBox what="deliveries" error={deliveryList.error.message} /> : jobs(deliveryList.data as Job[], "out")}
        </Section>
        <Section title="Coming back" actions={<Link className="btn btn-quiet btn-sm" href="/admin/availability">Availability</Link>}>
          {collectionList.error ? <ErrorBox what="collections" error={collectionList.error.message} /> : jobs(collectionList.data as Job[], "in")}
        </Section>
      </div>
    </div>
  );
}
