import Link from "next/link";
import { Chip, Empty, ErrorBox, PageHead, Section, StatusChip } from "@/components/admin/ui";
import s from "@/components/admin/ops.module.css";
import { area, loadOps, OPS_COLUMNS, type OpsInfo, type OpsRow } from "@/app/admin/dispatch/_lib/load";
import { pageStaff } from "@/lib/admin/auth";
import { addDays, dayStart, fmtWeekday, lagosDay } from "@/lib/admin/format";
import { NOT_VERIFIED_LABEL } from "@/lib/admin/kyc";
import { slotOrder, type Severity } from "@/lib/admin/next-action";
import { can, maskText } from "@/lib/admin/roles";
import { LIVE_STATUSES } from "@/lib/admin/status";
import { one } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Today" };

type Alert = {
  key: string; n: number; text: string; tone: Severity; money?: boolean;
  /** The one action link. */
  href: string; action: string;
  /** Up to three bookings it's about. */
  refs?: { id: string; ref: string; anchor?: string }[];
};

type Trip = { b: OpsRow; info: OpsInfo; dir: "out" | "in"; day: string; slot: string };

const DEAD = "(hold,expired,cancelled)";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const uniq = <T,>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];

export default async function TodayInbox() {
  const staff = await pageStaff("dashboard");
  const db = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = lagosDay(now);
  const tomorrow = addDays(today, 1);
  const t0 = dayStart(today), t2 = dayStart(addDays(today, 2));
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const count = { count: "exact" as const, head: true };
  const seeMessages = can(staff.role, "messages.view");
  const finance = staff.role === "finance";

  const [runOut, runIn, collected, live, withRenters, overdue, holds, disputed, failedEmails, refunds, mismatch, needsRefund, renterIssues, badUnits] = await Promise.all([
    db.from("bookings").select(OPS_COLUMNS).gte("starts_at", t0).lt("starts_at", t2).not("status", "in", DEAD).order("starts_at").limit(150),
    db.from("bookings").select(OPS_COLUMNS).gt("ends_at", t0).lte("ends_at", t2).in("status", ["confirmed", "preparing", "out_for_delivery", "delivered"]).order("ends_at").limit(150),
    db.from("bookings").select(OPS_COLUMNS).eq("status", "collected").limit(100),
    db.from("bookings").select("id, status").in("status", LIVE_STATUSES).limit(2000),
    db.from("bookings").select("id", count).in("status", ["out_for_delivery", "delivered"]),
    db.from("bookings").select("id, ref").in("status", ["delivered", "out_for_delivery"]).lt("ends_at", nowIso).order("ends_at").limit(50),
    db.from("bookings").select("id, ref").eq("status", "hold").gt("hold_expires_at", nowIso).lte("hold_expires_at", new Date(now.getTime() + 15 * 60_000).toISOString()).limit(50),
    db.from("bookings").select("id, ref").eq("status", "disputed").limit(50),
    seeMessages ? db.from("notifications").select("id", count).eq("status", "failed") : Promise.resolve({ count: 0, error: null }),
    db.from("refunds").select("id, booking_id, status, created_at").in("status", ["failed", "queued", "processing"]).limit(500),
    db.from("payments").select("id", count).or("status.eq.mismatch,flags.cs.{duplicate}"),
    db.from("bookings").select("id", count).eq("needs_refund", true),
    db.from("handovers").select("booking_id, bookings!inner(id, ref, status)").eq("party", "renter").eq("result", "issue").in("bookings.status", LIVE_STATUSES).limit(50),
    db.from("units").select("id").in("status", ["repair", "quarantine"]).limit(500),
  ]);

  const firstErr = [runOut, runIn, collected, live, withRenters, overdue, holds, disputed, refunds, mismatch, needsRefund].find((r) => r.error)?.error;
  if (firstErr) {
    return <div className="adm-page"><PageHead title={`Today, ${fmtWeekday(today)}`} /><ErrorBox what="today’s work" error={firstErr.message} /></div>;
  }

  // Bookings booked on a unit that's in repair or quarantine, from now on.
  const badUnitIds = ((badUnits.data ?? []) as { id: string }[]).map((u) => u.id);
  const { data: stuck } = badUnitIds.length
    ? await db.from("reservations").select("booking_id, bookings(id, ref, status)").in("unit_id", badUnitIds).eq("live", true)
      .not("booking_id", "is", null).overlaps("period", `[${nowIso},)`).limit(50)
    : { data: [] };

  const outRows = (runOut.data ?? []) as unknown as OpsRow[];
  const inRows = (runIn.data ?? []) as unknown as OpsRow[];
  const collectedRows = (collected.data ?? []) as unknown as OpsRow[];
  let info = new Map<string, OpsInfo>();
  let loadErr = "";
  try {
    info = await loadOps(db, uniq([...outRows, ...inRows, ...collectedRows], (b) => b.id), now);
  } catch (e) {
    loadErr = e instanceof Error ? e.message : String(e);
  }

  // Run sheet: today and tomorrow, out and in, in slot order.
  const trips: Trip[] = [
    ...outRows.map((b) => ({ b, dir: "out" as const, day: lagosDay(b.starts_at), slot: b.delivery_slot })),
    ...inRows.map((b) => ({ b, dir: "in" as const, day: addDays(lagosDay(b.ends_at), -1), slot: b.collection_slot })),
  ].flatMap((t) => (info.get(t.b.id) ? [{ ...t, info: info.get(t.b.id)! }] : []))
    .sort((a, z) => (finance ? Number(!!z.info.action.money) - Number(!!a.info.action.money) : 0)
      || a.day.localeCompare(z.day) || slotOrder(a.slot) - slotOrder(z.slot) || (a.b.ref ?? "").localeCompare(z.b.ref ?? ""));

  const isDelivery = (t: Trip) => t.b.delivery !== "pickup";
  const noRider = trips.filter((t) => isDelivery(t) && !t.b.rider_name.trim());
  const noUnit = trips.filter((t) => t.dir === "out" && (t.info.ctx.units?.assigned ?? 0) < (t.info.ctx.units?.total ?? 0));
  const unverified = uniq(trips.filter((t) => t.dir === "out" && t.info.unverified), (t) => t.b.id);
  const outToday = trips.filter((t) => t.dir === "out" && t.day === today);
  const inToday = trips.filter((t) => t.dir === "in" && t.day === today);
  const lateInspect = collectedRows.filter((b) => {
    const at = info.get(b.id)?.ctx.collectedAt ?? b.ends_at;
    return Date.parse(at) < Date.parse(dayAgo);
  });
  const refundRows = (refunds.data ?? []) as { id: string; booking_id: string; status: string; created_at: string }[];
  const refundsFailed = refundRows.filter((r) => r.status === "failed").length;
  const refundsStale = refundRows.filter((r) => r.status !== "failed" && r.created_at < dayAgo).length;
  const renterProblems = uniq(((renterIssues.data ?? []) as { bookings: { id: string; ref: string } | { id: string; ref: string }[] | null }[])
    .map((h) => one(h.bookings)).filter((x): x is { id: string; ref: string } => !!x), (x) => x.id);
  const stuckBookings = uniq(((stuck ?? []) as { bookings: { id: string; ref: string; status: string } | { id: string; ref: string; status: string }[] | null }[])
    .map((r) => one(r.bookings)).filter((x): x is { id: string; ref: string; status: string } => !!x && !["cancelled", "expired", "closed"].includes(x.status)), (x) => x.id);
  const liveRows = (live.data ?? []) as { id: string; status: string }[];
  const overdueRows = (overdue.data ?? []) as { id: string; ref: string }[];
  const refsOf = (xs: { id: string; ref: string | null }[], anchor?: string) => xs.slice(0, 3).map((x) => ({ id: x.id, ref: x.ref ?? x.id.slice(0, 8), anchor }));
  const tripRefs = (xs: Trip[], anchor: string) => refsOf(uniq(xs.map((t) => t.b), (b) => b.id), anchor);
  const noRiderDay = noRider.some((t) => t.day === today) ? today : tomorrow;

  const allAlerts: Alert[] = [
    { key: "overdue", n: overdueRows.length, text: `${plural(overdueRows.length, "return")} overdue`, tone: "bad", href: "/admin/bookings?view=overdue", action: "Call renters", refs: refsOf(overdueRows, "#renter") },
    { key: "holds", n: (holds.data ?? []).length, text: `${plural((holds.data ?? []).length, "hold")} expiring in 15 min`, tone: "warn", href: "/admin/bookings?view=holds_expiring", action: "Nudge renters", refs: refsOf((holds.data ?? []) as { id: string; ref: string }[], "#renter") },
    { key: "norider", n: uniq(noRider, (t) => `${t.dir}${t.b.id}`).length, text: `${plural(uniq(noRider, (t) => `${t.dir}${t.b.id}`).length, "job")} today or tomorrow with no rider`, tone: noRider.some((t) => t.day === today) ? "bad" : "warn", href: `/admin/dispatch?day=${noRiderDay}`, action: "Assign riders", refs: tripRefs(noRider, "#delivery") },
    { key: "nounit", n: uniq(noUnit, (t) => t.b.id).length, text: `${plural(uniq(noUnit, (t) => t.b.id).length, "booking")} going out with units missing`, tone: noUnit.some((t) => t.day === today) ? "bad" : "warn", href: noUnit[0] ? `/admin/bookings/${noUnit[0].b.id}#gear` : "/admin/bookings", action: "Assign units", refs: tripRefs(noUnit, "#gear") },
    { key: "unverified", n: unverified.length, text: `${plural(unverified.length, "booking")} going out with the renter’s ID not verified`, tone: unverified.some((t) => t.day === today) ? "bad" : "warn", href: can(staff.role, "kyc.review") ? "/admin/customers/verification" : `/admin/bookings/${unverified[0]?.b.id ?? ""}`, action: "Review IDs", refs: tripRefs(unverified, "") },
    { key: "renter", n: renterProblems.length, text: `${plural(renterProblems.length, "renter handover")} marked problem`, tone: "bad", href: renterProblems[0] ? `/admin/bookings/${renterProblems[0].id}#evidence` : "/admin/bookings", action: "Review photos", refs: refsOf(renterProblems, "#evidence") },
    { key: "inspect", n: lateInspect.length, text: `${plural(lateInspect.length, "return")} not inspected after 24h`, tone: "bad", href: "/admin/bookings?view=to_inspect", action: "Inspect", refs: refsOf(lateInspect, "#inspect") },
    { key: "disputed", n: (disputed.data ?? []).length, text: `${plural((disputed.data ?? []).length, "booking")} disputed`, tone: "bad", href: "/admin/bookings?view=disputed", action: "Assess", refs: refsOf((disputed.data ?? []) as { id: string; ref: string }[], "#compare") },
    { key: "stuck", n: stuckBookings.length, text: `${plural(stuckBookings.length, "upcoming booking")} on a unit in repair or quarantine`, tone: "bad", href: stuckBookings[0] ? `/admin/bookings/${stuckBookings[0].id}#gear` : "/admin/inventory", action: "Swap units", refs: refsOf(stuckBookings, "#gear") },
    { key: "emails", n: failedEmails.count ?? 0, text: `${plural(failedEmails.count ?? 0, "email")} to renters failed`, tone: "warn", href: "/admin/messages?status=failed", action: "Retry" },
    { key: "refunds_failed", n: refundsFailed, text: `${plural(refundsFailed, "refund")} failed`, tone: "bad", money: true, href: "/admin/payments/refunds?status=failed", action: "Retry refunds" },
    { key: "refunds_stale", n: refundsStale, text: `${plural(refundsStale, "refund")} queued over 24h`, tone: "warn", money: true, href: "/admin/payments/refunds?status=open", action: "Pay refunds" },
    { key: "mismatch", n: mismatch.count ?? 0, text: `${plural(mismatch.count ?? 0, "payment")} mismatched or duplicated`, tone: "bad", money: true, href: "/admin/payments?flag=attention", action: "Check payments" },
    { key: "needsrefund", n: needsRefund.count ?? 0, text: `${plural(needsRefund.count ?? 0, "booking")} paid but can’t be honoured`, tone: "bad", money: true, href: "/admin/bookings?view=needs_refund", action: "Queue refunds" },
  ];
  const alerts = allAlerts.filter((a) => a.n > 0)
    .sort((a, z) => (finance ? Number(!!z.money) - Number(!!a.money) : 0) || (a.tone === z.tone ? 0 : a.tone === "bad" ? -1 : z.tone === "bad" ? 1 : 0));

  const withoutRider = (xs: Trip[]) => xs.filter((t) => isDelivery(t) && !t.b.rider_name.trim()).length;
  const kpis: { n: number; label: string; href: string; sub: string; bad?: boolean }[] = [
    (() => { const n = withoutRider(outToday); const p = outToday.filter((t) => !isDelivery(t)).length;
      return { n: outToday.length, label: "Going out today", href: `/admin/dispatch?day=${today}#out`, bad: n > 0,
        sub: n ? `${n} without a rider` : p ? `${plural(p, "pickup")} at base` : outToday.length ? "All riders assigned" : "Nothing going out" }; })(),
    (() => { const n = withoutRider(inToday);
      return { n: inToday.length, label: "Coming back today", href: `/admin/dispatch?day=${today}#in`, bad: n > 0,
        sub: n ? `${n} without a rider` : inToday.length ? "All riders assigned" : "Nothing due back" }; })(),
    { n: withRenters.count ?? 0, label: "Out with renters", href: "/admin/bookings?view=with_renters", bad: overdueRows.length > 0,
      sub: overdueRows.length ? `${overdueRows.length} overdue` : "None overdue" },
    { n: liveRows.length, label: "Live bookings", href: "/admin/bookings?status=live",
      sub: [`${liveRows.filter((r) => r.status === "collected").length} to inspect`, `${liveRows.filter((r) => r.status === "disputed").length} disputed`].join(" · ") },
  ];

  return (
    <div className="adm-page">
      <PageHead title={`Today, ${fmtWeekday(today)}`}
        actions={<><Link className="btn btn-secondary btn-sm" href="/admin/dispatch">Dispatch board</Link><Link className="btn btn-quiet btn-sm" href="/admin/availability">Availability</Link></>} />

      <Section title="Needs attention">
        {loadErr && <ErrorBox what="job details" error={loadErr} />}
        {alerts.length === 0 ? <Empty>Nothing needs attention right now.</Empty> : (
          <ul className={s.alerts}>
            {alerts.map((a) => (
              <li key={a.key} className={s.alert} data-tone={a.tone}>
                <span className={s.alertN}>{a.n}</span>
                <span className={s.alertText}>
                  {a.text}
                  {a.refs && a.refs.length > 0 && (
                    <span className="muted small"> · {a.refs.map((r, i) => (
                      <span key={r.id}>{i > 0 && ", "}<Link className="mono" href={`/admin/bookings/${r.id}${r.anchor ?? ""}`}>{r.ref}</Link></span>
                    ))}{a.n > a.refs.length ? ", …" : ""}</span>
                  )}
                </span>
                <Link className="btn btn-secondary btn-sm" href={a.href}>{a.action}</Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="tiles">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="tile" data-alert={k.bad ? "true" : undefined}>
            <span className="n">{k.n}</span>
            <span className="l">{k.label}</span>
            <span className={k.bad ? s.subBad : s.sub}>{k.sub}</span>
          </Link>
        ))}
      </div>

      <Section title="Run sheet · today and tomorrow" actions={<Link className="btn btn-quiet btn-sm" href="/admin/dispatch">Assign riders</Link>}>
        {trips.length === 0 ? <Empty>No deliveries, pickups or returns today or tomorrow.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Slot</th><th>Ref</th><th>Renter</th><th>Area</th><th>Rider</th><th>Next action</th><th>Status</th></tr></thead>
              <tbody>
                {trips.map((t) => {
                  const a = t.info.action;
                  return (
                    <tr key={`${t.dir}-${t.b.id}`}>
                      <td className="small">
                        <span className={`${s.dir} ${t.dir === "out" ? s.dirOut : s.dirIn}`}>{t.dir === "out" ? "Out" : "In"}</span>{" "}
                        {t.day === today ? <strong>Today</strong> : "Tomorrow"} {t.slot || <span className="muted">any time</span>}
                      </td>
                      <td><Link className="rowlink mono" href={`/admin/bookings/${t.b.id}`}>{t.b.ref ?? "No ref"}</Link></td>
                      <td className="small">{t.info.renter.name}</td>
                      <td className="small">{t.b.delivery === "pickup" ? <span className="muted">At base</span> : [t.info.zone, maskText(staff.role, area(t.b.address))].filter(Boolean).join(" · ") || <span className="muted">Not set</span>}</td>
                      <td className="small">{t.b.delivery === "pickup" ? <span className="muted">None (pickup)</span> : t.b.rider_name || <Chip tone={t.day === today ? "bad" : "warn"}>No rider</Chip>}</td>
                      <td className="small">
                        <div className="flex flex-wrap gap-1">
                          {t.dir === "out" && t.info.unverified && <Chip tone="bad">{NOT_VERIFIED_LABEL}</Chip>}
                          {a.anchor ? <Link href={`/admin/bookings/${t.b.id}${a.anchor}`}><Chip tone={a.severity}>{a.label}</Chip></Link> : <Chip tone={a.severity}>{a.label}</Chip>}
                        </div>
                      </td>
                      <td><StatusChip status={t.b.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
