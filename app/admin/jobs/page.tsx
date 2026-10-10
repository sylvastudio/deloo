import { ArrowDownLeft, ArrowUpRight, Bike, ChevronDown, Package, Store, Truck, User } from "lucide-react";
import Link from "next/link";
import { Callout, EmptyState, ErrorState, PageHead, SegmentedLinks, StatusChip, Tag } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { riderOwns } from "@/lib/admin/data";
import { addDays, dayStart, fmtWeekday, lagosDay } from "@/lib/admin/format";
import { can, maskText } from "@/lib/admin/roles";
import type { BookingStatus } from "@/lib/admin/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Jobs" };

type Job = {
  id: string; ref: string | null; renter_id: string; status: BookingStatus; starts_at: string; ends_at: string; delivery: string;
  address: string; contact_phone: string; delivery_slot: string; collection_slot: string; rider_name: string; rider_phone: string;
  booking_items: { kind: string }[];
};

const SELECT = "id, ref, renter_id, status, starts_at, ends_at, delivery, address, contact_phone, delivery_slot, collection_slot, rider_name, rider_phone, booking_items(kind)";

/** Which days the list covers. Late deliveries and overdue collections are always shown on top. */
const DAYS = {
  today: { label: "Today", from: 0, to: 1 },
  tomorrow: { label: "Tomorrow", from: 1, to: 2 },
  two: { label: "Today and tomorrow", from: 0, to: 2 },
  week: { label: "Next 7 days", from: 0, to: 7 },
} as const;
type DayKey = keyof typeof DAYS;

/** Delivery windows in the order they happen; anything typed by staff goes after them. */
const SLOT_ORDER = ["8–11am", "12–3pm", "4–7pm"];
const slotRank = (s: string) => (s ? (SLOT_ORDER.indexOf(s) + 1 || SLOT_ORDER.length + 1) : SLOT_ORDER.length + 2);

type Entry = { b: Job; kind: "out" | "in"; day: string; slot: string; late: boolean; done: boolean };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function JobsPage({ searchParams }: { searchParams: SP }) {
  const staff = await pageStaff();
  const rider = staff.role === "rider";
  if (!can(staff.role, "handover.capture") && staff.role !== "readonly") {
    return <div className="adm-page narrow"><EmptyState icon={Truck} title="Jobs are for ops and riders" /></div>;
  }
  const sp = await searchParams;
  const dayParam = String((Array.isArray(sp.day) ? sp.day[0] : sp.day) ?? "");
  const keys: DayKey[] = rider ? ["today", "tomorrow"] : ["today", "tomorrow", "two", "week"];
  const fallback: DayKey = rider ? "today" : "two";
  const dayKey: DayKey = (keys as string[]).includes(dayParam) ? (dayParam as DayKey) : fallback;
  const range = DAYS[dayKey];
  const db = await createClient();
  const today = lagosDay();
  const t0 = dayStart(today);
  const from = dayStart(addDays(today, range.from)), to = dayStart(addDays(today, range.to));

  const [outRes, inRes, lateRes, overdueRes] = await Promise.all([
    db.from("bookings").select(SELECT).gte("starts_at", from).lt("starts_at", to).in("status", ["confirmed", "preparing", "out_for_delivery", "delivered"]).order("starts_at"),
    // Collections: last rental day in the range ⇔ ends_at in (first day 00:00, day after the last 00:00].
    db.from("bookings").select(SELECT).gt("ends_at", from).lte("ends_at", to).in("status", ["delivered", "collected"]).order("ends_at"),
    // Should have gone out before today and still hasn't been delivered.
    db.from("bookings").select(SELECT).lt("starts_at", t0).in("status", ["confirmed", "preparing", "out_for_delivery"]).order("starts_at"),
    // Last rental day has passed and the gear is still with the renter.
    db.from("bookings").select(SELECT).lte("ends_at", t0).in("status", ["delivered", "out_for_delivery"]).order("ends_at"),
  ]);
  const error = outRes.error ?? inRes.error ?? lateRes.error ?? overdueRes.error;
  // Riders see only their own jobs; everyone else sees all.
  const mine = (rows: unknown) => ((rows ?? []) as Job[]).filter((b) => riderOwns(staff, b));

  const entries: Entry[] = [];
  const seen = new Set<string>();
  const push = (b: Job, kind: "out" | "in", late: boolean) => {
    const k = `${kind}-${b.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    const day = kind === "out" ? lagosDay(b.starts_at) : addDays(lagosDay(b.ends_at), -1);
    entries.push({
      b, kind, late, day: late ? today : day,
      slot: kind === "out" ? b.delivery_slot : b.collection_slot,
      done: kind === "out" ? b.status === "delivered" : b.status === "collected",
    });
  };
  mine(lateRes.data).forEach((b) => push(b, "out", true));
  mine(overdueRes.data).forEach((b) => push(b, "in", true));
  mine(outRes.data).forEach((b) => push(b, "out", false));
  mine(inRes.data).forEach((b) => push(b, "in", false));
  entries.sort((a, b) => Number(b.late) - Number(a.late) || a.day.localeCompare(b.day) || slotRank(a.slot) - slotRank(b.slot) || (a.b.ref ?? "").localeCompare(b.b.ref ?? ""));

  const ids = [...new Set(entries.map((e) => e.b.renter_id))];
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const people = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));

  const todo = entries.filter((e) => !e.done);
  const done = entries.filter((e) => e.done);
  const multiDay = range.to - range.from > 1;
  const dayName = (d: string) => (d === today ? "Today" : d === addDays(today, 1) ? `Tomorrow, ${fmtWeekday(d)}` : fmtWeekday(d));

  const card = (e: Entry) => {
    const { b, kind } = e;
    const pickup = b.delivery === "pickup";
    const gear = b.booking_items.filter((i) => i.kind === "rental").length;
    const when = `${e.late ? (kind === "out" ? "Late" : "Overdue") : e.day === today ? "Today" : e.day === addDays(today, 1) ? "Tomorrow" : fmtWeekday(e.day)}${e.slot ? ` · ${e.slot}` : ""}`;
    return (
      <li key={`${kind}-${b.id}`} className="job-card" data-late={e.late ? "true" : undefined}>
        <div className="jc-top">
          <div className="jc-when">
            <b><Link className="job-link" href={`/admin/jobs/${b.id}`}>{when}</Link></b>
            <div className="jc-tags">
              {kind === "out"
                ? pickup
                  ? <Tag kind="dir-base" icon={<Store aria-hidden="true" />}>Pickup at base</Tag>
                  : <Tag kind="dir-out" icon={<ArrowUpRight aria-hidden="true" />}>Delivery</Tag>
                : <Tag kind="dir-in" icon={<ArrowDownLeft aria-hidden="true" />}>Collection</Tag>}
              {e.late && <Tag kind="late">{kind === "out" ? "Should have gone out" : "Past return day"}</Tag>}
            </div>
          </div>
          <StatusChip status={b.status} />
        </div>
        <p className="jc-addr">{pickup ? "Deloo base" : b.address ? maskText(staff.role, b.address) : <span className="muted">No address yet</span>}</p>
        <div className="jc-meta">
          <span><User aria-hidden="true" />{people.get(b.renter_id) ?? "Renter"}</span>
          <span><Package aria-hidden="true" />{gear} item{gear === 1 ? "" : "s"}</span>
          {!rider && (b.rider_name ? <span><Bike aria-hidden="true" />{b.rider_name}</span> : <span className="st warn">No rider</span>)}
          <span className="mono">{b.ref ?? "No ref"}</span>
        </div>
      </li>
    );
  };

  // Group the to-do list by day when the range spans several days.
  const byDay = new Map<string, Entry[]>();
  for (const e of todo) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);

  return (
    <div className="adm-page narrow">
      {!rider && <PageHead title="Jobs" meta={<span>{todo.length} to do · {done.length} done</span>} />}
      <div className="jobs-bar">
        {rider && <h1 className="sr-only">My jobs</h1>}
        <SegmentedLinks size={rider ? "lg" : undefined} label="Days" items={keys.map((k) => ({
          href: k === fallback ? "/admin/jobs" : `/admin/jobs?day=${k}`, label: DAYS[k].label, current: dayKey === k,
        }))} />
      </div>

      {error ? <ErrorState what="jobs" error={error.message} /> : entries.length === 0 ? (
        <EmptyState icon={Truck} title={`No jobs ${dayKey === "week" ? "in the next 7 days" : DAYS[dayKey].label.toLowerCase()}`}>
          {rider ? "Jobs show here when ops sets you as the rider on a booking." : "Deliveries, pickups and collections appear here once bookings are confirmed."}
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {todo.length === 0 && <Callout tone="ok" title="All done">Every job {DAYS[dayKey].label.toLowerCase()} is finished.</Callout>}
          {multiDay
            ? [...byDay.entries()].map(([d, list]) => (
              <section key={d} className="grid gap-2" aria-label={dayName(d)}>
                <h2 className="job-day"><span>{dayName(d)}</span><span>{list.length}</span></h2>
                <ul className="job-list">{list.map(card)}</ul>
              </section>
            ))
            : todo.length > 0 && <ul className="job-list">{todo.map(card)}</ul>}
          {done.length > 0 && (
            <details className="done-jobs">
              <summary>Done ({done.length})<ChevronDown aria-hidden="true" /></summary>
              <ul className="job-list">{done.map(card)}</ul>
            </details>
          )}
        </div>
      )}
      {rider && <p className="hint">Your jobs are the ones with your name or phone number as the rider.</p>}
    </div>
  );
}
