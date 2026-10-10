import Link from "next/link";
import { Chip, Empty, ErrorBox, PageHead, StatusChip } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { riderOwns } from "@/lib/admin/data";
import { addDays, dayStart, fmtWeekday, lagosDay } from "@/lib/admin/format";
import { can, maskPhone, maskText } from "@/lib/admin/roles";
import type { BookingStatus } from "@/lib/admin/status";
import { one } from "@/lib/admin/types";
import { mapsLink, telLink } from "@/lib/admin/whatsapp";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Jobs" };

type Job = {
  id: string; ref: string | null; renter_id: string; status: BookingStatus; starts_at: string; ends_at: string; delivery: string;
  address: string; contact_phone: string; delivery_slot: string; collection_slot: string; rider_name: string; rider_phone: string;
  booking_items: { item_name: string; kind: string; units: { tag: string; serial: string } | { tag: string; serial: string }[] | null }[];
};

const SELECT = "id, ref, renter_id, status, starts_at, ends_at, delivery, address, contact_phone, delivery_slot, collection_slot, rider_name, rider_phone, booking_items(item_name, kind, units(tag, serial))";

export default async function JobsPage() {
  const staff = await pageStaff();
  if (!can(staff.role, "handover.capture") && staff.role !== "readonly") return <div className="adm-page"><p className="hint">Jobs are for ops and riders.</p></div>;
  const db = await createClient();
  const today = lagosDay();
  const t0 = dayStart(today), t2 = dayStart(addDays(today, 2));

  const [outRes, inRes] = await Promise.all([
    db.from("bookings").select(SELECT).gte("starts_at", t0).lt("starts_at", t2).in("status", ["confirmed", "preparing", "out_for_delivery", "delivered"]).order("starts_at"),
    // Collections: last rental day is today or tomorrow ⇔ ends_at in (today 00:00, day after tomorrow 00:00].
    db.from("bookings").select(SELECT).gt("ends_at", t0).lte("ends_at", t2).in("status", ["delivered", "collected"]).order("ends_at"),
  ]);
  const error = outRes.error ?? inRes.error;
  // Riders see only their own jobs; everyone else sees all.
  const mine = (rows: Job[] | null) => (rows ?? []).filter((b) => riderOwns(staff, b));

  const out = mine(outRes.data as Job[] | null);
  const back = mine(inRes.data as Job[] | null);

  const ids = [...new Set([...out, ...back].map((b) => b.renter_id))];
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, full_name, phone").in("id", ids) : { data: [] };
  const people = new Map((profiles ?? []).map((p) => [p.id as string, p as { full_name: string; phone: string }]));

  const card = (b: Job, kind: "out" | "in") => {
    const day = kind === "out" ? lagosDay(b.starts_at) : addDays(lagosDay(b.ends_at), -1);
    const p = people.get(b.renter_id);
    const phone = b.contact_phone || p?.phone || "";
    const done = kind === "out" ? b.status === "delivered" : b.status === "collected";
    const pickup = b.delivery === "pickup";
    return (
      <li key={`${kind}-${b.id}`} className="card job" style={done ? { opacity: 0.65 } : undefined}>
        <div className="flex items-center justify-between gap-2">
          <Link href={`/admin/jobs/${b.id}`} className="mono" style={{ color: "var(--lagoon)", fontWeight: 500, fontSize: 16 }}>{b.ref ?? "—"}</Link>
          <StatusChip status={b.status} />
        </div>
        <div className="meta">
          <span><strong>{day === today ? "Today" : fmtWeekday(day)}</strong>{(kind === "out" ? b.delivery_slot : b.collection_slot) ? ` · ${kind === "out" ? b.delivery_slot : b.collection_slot}` : ""}</span>
          <span>{kind === "out" ? (pickup ? "Pickup at base" : "Delivery") : "Collection"}</span>
          {b.rider_name ? <span>Rider: {b.rider_name}</span> : <Chip tone="warn">No rider</Chip>}
        </div>
        <div><strong>{p?.full_name ?? "Renter"}</strong> {phone && <a className="mono small" href={telLink(phone)} style={{ color: "var(--lagoon)" }}>{maskPhone(staff.role, phone)}</a>}</div>
        {!pickup && b.address && (
          <div className="small">{maskText(staff.role, b.address)} {can(staff.role, "pii.view") && <a href={mapsLink(b.address)} target="_blank" rel="noreferrer" style={{ color: "var(--lagoon)" }}>Maps</a>}</div>
        )}
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {b.booking_items.filter((i) => i.kind === "rental").map((i, n) => {
            const u = one(i.units);
            return <li key={n}>{i.item_name}{u && <span className="muted mono"> · {[u.tag, u.serial].filter(Boolean).join(" · ")}</span>}</li>;
          })}
        </ul>
        {!done && staff.role !== "readonly" && <Link className="btn" href={`/admin/jobs/${b.id}`}>Open job</Link>}
      </li>
    );
  };

  return (
    <div className="adm-page narrow">
      <PageHead title={staff.role === "rider" ? "My jobs" : "Jobs"} kicker={`${fmtWeekday(today)} and tomorrow`} />
      {staff.role === "rider" && <p className="hint">Jobs where you’re set as the rider (by your name or phone on your staff profile).</p>}
      {error ? <ErrorBox what="jobs" error={error.message} /> : (
        <>
          <h2 className="h2">Going out <span className="muted small">({out.length})</span></h2>
          {out.length ? <ul className="grid gap-3" style={{ listStyle: "none", margin: 0, padding: 0 }}>{out.map((b) => card(b, "out"))}</ul>
            : <Empty>No deliveries or pickups today or tomorrow.</Empty>}
          <h2 className="h2">Coming back <span className="muted small">({back.length})</span></h2>
          {back.length ? <ul className="grid gap-3" style={{ listStyle: "none", margin: 0, padding: 0 }}>{back.map((b) => card(b, "in"))}</ul>
            : <Empty>No collections today or tomorrow.</Empty>}
        </>
      )}
    </div>
  );
}
