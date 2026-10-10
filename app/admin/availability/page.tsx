import Link from "next/link";
import { AvailabilityGrid, type Cell, type GridRow } from "@/components/admin/availability-grid";
import { Empty, ErrorBox, PageHead } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { addDays, dayStart, lagosDay, nowMs, parseRange } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { one } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Availability" };

const DAYS = 30;

type Res = { id: string; unit_id: string; booking_id: string | null; period: string; note: string; bookings: { ref: string; status: string; hold_expires_at: string | null } | { ref: string; status: string; hold_expires_at: string | null }[] | null };

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await pageStaff("inventory.view");
  const sp = await searchParams;
  const itemFilter = /^[0-9a-f-]{36}$/i.test(sp.item ?? "") ? sp.item! : "";
  const cat = sp.cat ?? "";
  const start = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : lagosDay();
  const today = lagosDay();
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const db = await createClient();

  let itemsQ = db.from("items").select("id, name, category_key, units(id, tag, serial, status, created_at)").order("category_key").order("name");
  if (itemFilter) itemsQ = itemsQ.eq("id", itemFilter);
  if (cat) itemsQ = itemsQ.eq("category_key", cat);
  const [{ data: items, error }, { data: cats }] = await Promise.all([itemsQ, db.from("categories").select("key, label").order("sort")]);

  const units = (items ?? []).flatMap((i) => ((i.units ?? []) as { id: string; tag: string; serial: string; status: string; created_at: string }[])
    .filter((u) => u.status !== "retired")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((u) => ({ ...u, item: i.name as string })));

  let resErr: string | null = null;
  const byUnit = new Map<string, Res[]>();
  if (units.length) {
    const { data: res, error: e } = await db.from("reservations")
      .select("id, unit_id, booking_id, period, note, bookings(ref, status, hold_expires_at)")
      .in("unit_id", units.map((u) => u.id)).eq("live", true)
      .overlaps("period", `[${dayStart(days[0])},${dayStart(addDays(days[DAYS - 1], 1))})`);
    if (e) resErr = e.message;
    for (const r of (res ?? []) as Res[]) byUnit.set(r.unit_id, [...(byUnit.get(r.unit_id) ?? []), r]);
  }

  const now = nowMs();
  const rows: GridRow[] = units.map((u) => {
    const list = (byUnit.get(u.id) ?? []).map((r) => ({ r, p: parseRange(r.period), b: one(r.bookings) }))
      // An unpaid hold that ran out no longer holds the unit (private.res_holding).
      .filter((x) => x.p && !(x.b?.status === "hold" && x.b.hold_expires_at && Date.parse(x.b.hold_expires_at) < now));
    const cells: Cell[] = days.map((d) => {
      const s = Date.parse(dayStart(d)), e = Date.parse(dayStart(addDays(d, 1)));
      const hit = list.find((x) => Date.parse(x.p!.from) < e && Date.parse(x.p!.to) > s);
      if (!hit) return { kind: "free" };
      if (!hit.r.booking_id) return { kind: "blocked", reservationId: hit.r.id, note: hit.r.note || "Blocked" };
      return { kind: hit.b?.status === "hold" ? "hold" : "booked", ref: hit.b?.ref ?? hit.r.note ?? "booked", bookingId: hit.r.booking_id };
    });
    return { unitId: u.id, label: u.item, sub: [u.tag, u.serial].filter(Boolean).join(" · ") || u.id.slice(0, 8), status: u.status, cells };
  });

  const prev = addDays(start, -14), next = addDays(start, 14);
  const qs = (from: string) => `?${new URLSearchParams({ ...(itemFilter ? { item: itemFilter } : {}), ...(cat ? { cat } : {}), from }).toString()}`;

  return (
    <div className="adm-page" style={{ maxWidth: "none" }}>
      <PageHead title="Availability" kicker="Units × next 30 days (Lagos)" actions={<>
        <Link className="btn btn-secondary btn-sm" href={qs(prev)}>← 2 weeks</Link>
        {start !== today && <Link className="btn btn-quiet btn-sm" href={qs(today)}>Today</Link>}
        <Link className="btn btn-secondary btn-sm" href={qs(next)}>2 weeks →</Link>
      </>} />
      <form className="filters" method="get">
        <label className="field"><span className="field-label">Category</span>
          <select className="control" name="cat" defaultValue={cat}>
            <option value="">All</option>
            {(cats ?? []).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select></label>
        <label className="field"><span className="field-label">From</span><input className="control" type="date" name="from" defaultValue={start} /></label>
        <div className="actions"><button className="btn" type="submit">Show</button>{(cat || itemFilter) && <Link className="btn btn-quiet" href="/admin/availability">All items</Link>}</div>
      </form>
      {error ? <ErrorBox what="units" error={error.message} /> : resErr ? <ErrorBox what="reservations" error={resErr} /> : rows.length === 0 ? (
        <Empty>No units to show. Add units on an item first.</Empty>
      ) : (
        <AvailabilityGrid days={days} rows={rows} canEdit={can(staff.role, "inventory.edit")} today={today} />
      )}
    </div>
  );
}
