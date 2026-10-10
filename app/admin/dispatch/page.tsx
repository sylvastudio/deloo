import Link from "next/link";
import type { ReactNode } from "react";
import { Chip, Empty, ErrorBox, PageHead, Section, StatusChip } from "@/components/admin/ui";
import s from "@/components/admin/ops.module.css";
import { pageStaff } from "@/lib/admin/auth";
import { addDays, dayStart, fmtWeekday, lagosDay } from "@/lib/admin/format";
import { relDay, slotOrder } from "@/lib/admin/next-action";
import { can, maskPhone, maskText } from "@/lib/admin/roles";
import { waLink } from "@/lib/admin/whatsapp";
import { createClient } from "@/lib/supabase/server";
import { area, loadOps, OPS_COLUMNS, type OpsInfo, type OpsRow } from "./_lib/load";
import { BulkRider, RiderSelect, type RiderOption } from "./_lib/rider-forms";

export const metadata = { title: "Dispatch" };

const DEAD = "(hold,expired,cancelled)";
const digits = (x: string) => (x ?? "").replace(/\D/g, "").slice(-10);

type Stop = { b: OpsRow; info: OpsInfo; dir: "out" | "in"; slot: string };

/** Google Maps directions through every stop, in order. Without a base address Maps starts from where the phone is. */
function routeLink(origin: string, stops: string[]) {
  const place = (a: string) => `${a}, Lagos, Nigeria`;
  if (!stops.length) return "";
  const p = new URLSearchParams({ api: "1", travelmode: "driving", destination: place(stops[stops.length - 1]) });
  if (origin) p.set("origin", place(origin));
  if (stops.length > 1) p.set("waypoints", stops.slice(0, -1).map(place).join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

export default async function DispatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await pageStaff("bookings.view");
  const sp = await searchParams;
  const today = lagosDay();
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  const want = typeof sp.day === "string" ? sp.day : "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(want) ? want : today;
  const d0 = dayStart(day), d1 = dayStart(addDays(day, 1));
  const canEdit = can(staff.role, "bookings.edit");
  const pii = can(staff.role, "pii.view");
  const db = await createClient();

  const [outRes, inRes, ridersRes, settingsRes, weekOut, weekIn] = await Promise.all([
    db.from("bookings").select(OPS_COLUMNS).gte("starts_at", d0).lt("starts_at", d1).not("status", "in", DEAD).order("starts_at").limit(200),
    db.from("bookings").select(OPS_COLUMNS).gt("ends_at", d0).lte("ends_at", d1).not("status", "in", DEAD).order("ends_at").limit(200),
    db.from("staff_members").select("user_id, display_name, phone").eq("role", "rider").eq("active", true).order("display_name"),
    db.from("app_settings").select("pickup_address").eq("id", 1).maybeSingle(),
    // Day tab counts.
    db.from("bookings").select("starts_at").gte("starts_at", dayStart(days[0])).lt("starts_at", dayStart(addDays(days[7], 1))).not("status", "in", DEAD).limit(1000),
    db.from("bookings").select("ends_at").gt("ends_at", dayStart(days[0])).lte("ends_at", dayStart(addDays(days[7], 1))).not("status", "in", DEAD).limit(1000),
  ]);
  const failed = [outRes, inRes, ridersRes].find((r) => r.error);
  const outRows = (outRes.data ?? []) as unknown as OpsRow[];
  const inRows = (inRes.data ?? []) as unknown as OpsRow[];
  let info = new Map<string, OpsInfo>();
  let loadErr = "";
  try {
    info = await loadOps(db, [...outRows, ...inRows]);
  } catch (e) {
    loadErr = e instanceof Error ? e.message : String(e);
  }
  const riders: RiderOption[] = ((ridersRes.data ?? []) as { user_id: string; display_name: string; phone: string }[])
    .map((r) => ({ id: r.user_id, name: r.display_name || "Rider", phone: r.phone ?? "" }));
  const base = (settingsRes.data as { pickup_address?: string } | null)?.pickup_address ?? "";

  const count = new Map<string, number>();
  for (const r of (weekOut.data ?? []) as { starts_at: string }[]) { const d = lagosDay(r.starts_at); count.set(d, (count.get(d) ?? 0) + 1); }
  for (const r of (weekIn.data ?? []) as { ends_at: string }[]) { const d = addDays(lagosDay(r.ends_at), -1); count.set(d, (count.get(d) ?? 0) + 1); }

  const riderFor = (b: OpsRow) => {
    const p = digits(b.rider_phone);
    return riders.find((r) => (p.length >= 7 && digits(r.phone) === p) || (b.rider_name && r.name.trim().toLowerCase() === b.rider_name.trim().toLowerCase()))?.id ?? "";
  };

  const stops = (rows: OpsRow[], dir: "out" | "in"): Stop[] => rows.flatMap((b) => {
    const i = info.get(b.id);
    return i ? [{ b, info: i, dir, slot: dir === "out" ? b.delivery_slot : b.collection_slot }] : [];
  }).sort((a, z) => slotOrder(a.slot) - slotOrder(z.slot) || (a.b.ref ?? "").localeCompare(z.b.ref ?? ""));
  const outStops = stops(outRows, "out");
  const inStops = stops(inRows, "in");
  const atBase = [...outStops, ...inStops].filter((x) => x.b.delivery === "pickup")
    .sort((a, z) => slotOrder(a.slot) - slotOrder(z.slot));

  // Runs: every delivery and collection a rider has on this day, in slot order.
  const runs = new Map<string, { name: string; phone: string; stops: Stop[] }>();
  const unassigned: Stop[] = [];
  for (const x of [...outStops, ...inStops].filter((x) => x.b.delivery !== "pickup").sort((a, z) => slotOrder(a.slot) - slotOrder(z.slot))) {
    if (!x.b.rider_name.trim()) { unassigned.push(x); continue; }
    const key = digits(x.b.rider_phone) || x.b.rider_name.trim().toLowerCase();
    const run = runs.get(key) ?? { name: x.b.rider_name, phone: x.b.rider_phone, stops: [] };
    run.stops.push(x);
    runs.set(key, run);
  }
  const runText = (name: string, list: Stop[], route: string) => [
    `Deloo run, ${fmtWeekday(day)}: ${name.split(" ")[0]}, ${list.length} stop${list.length === 1 ? "" : "s"}`,
    ...list.map((x, n) => [
      "",
      `${n + 1}. ${x.slot || "Any time"} · ${x.dir === "out" ? "DELIVER" : "COLLECT"} · ${x.b.ref ?? ""}`,
      `${x.info.renter.name}${x.info.renter.phone ? `, ${x.info.renter.phone}` : ""}`,
      x.b.address || "(no address)",
      x.info.items.map((it) => `${it.name}${it.tag ? ` (${it.tag})` : ""}`).join(", "),
    ].join("\n")),
    ...(route ? ["", `Route: ${route}`] : []),
  ].join("\n");

  const table = (list: Stop[], bulkId: string | null, showDir = false): ReactNode => (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {bulkId && <th><span className="sr-only">Tick</span></th>}
            <th>Slot</th><th>Ref</th><th>Renter</th><th>Address</th><th>Items</th>{!showDir && <th>Rider</th>}<th>Next action</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {list.map((x) => {
            const a = x.info.action;
            return (
              <tr key={`${x.dir}-${x.b.id}`}>
                {bulkId && <td><input type="checkbox" name="booking_id" value={x.b.id} form={bulkId} aria-label={`Tick ${x.b.ref ?? "booking"}`} /></td>}
                <td className="small">{showDir && <span className={`${s.dir} ${x.dir === "out" ? s.dirOut : s.dirIn}`}>{x.dir === "out" ? "Out" : "In"}</span>} {x.slot || <span className="muted">Any time</span>}</td>
                <td><Link className="rowlink mono" href={`/admin/bookings/${x.b.id}`}>{x.b.ref ?? "No ref"}</Link></td>
                <td className="small">{x.info.renter.name}<div className="muted mono">{maskPhone(staff.role, x.info.renter.phone)}</div></td>
                <td className="small">{x.b.delivery === "pickup" ? <span className="muted">At base</span> : maskText(staff.role, x.b.address) || <span className="muted">No address</span>}</td>
                <td className="small">{x.info.items.map((it) => it.tag ? `${it.name} · ${it.tag}` : it.name).join(", ") || <span className="muted">No gear</span>}</td>
                {!showDir && (
                  <td className="small">
                    {canEdit && riders.length
                      ? <RiderSelect bookingId={x.b.id} riders={riders} current={riderFor(x.b)} label={x.b.ref ?? "booking"} />
                      : x.b.rider_name || <span className="muted">Not assigned</span>}
                    {canEdit && x.b.rider_name && !riderFor(x.b) && <div className="muted">{x.b.rider_name}</div>}
                  </td>
                )}
                <td className="small">
                  {a.anchor ? <Link href={`/admin/bookings/${x.b.id}${a.anchor}`}><Chip tone={a.severity}>{a.label}</Chip></Link> : <Chip tone={a.severity}>{a.label}</Chip>}
                </td>
                <td><StatusChip status={x.b.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  /** Zone, then slot (the list is already in slot order). */
  const byZone = (list: Stop[], dir: "out" | "in") => {
    const delivery = list.filter((x) => x.b.delivery !== "pickup");
    if (!delivery.length) return <Empty>{dir === "out" ? "No deliveries this day." : "No collections this day."}</Empty>;
    const zones = [...new Set(delivery.map((x) => x.info.zone || "No zone"))].sort();
    const bulkId = canEdit && riders.length ? `bulk-${dir}` : null;
    return (
      <div className="grid gap-2">
        {bulkId && <BulkRider id={bulkId} riders={riders} />}
        {zones.map((z) => (
          <div key={z} className="grid gap-1">
            <p className={s.groupHead}>{z} · {delivery.filter((x) => (x.info.zone || "No zone") === z).length}</p>
            {table(delivery.filter((x) => (x.info.zone || "No zone") === z), bulkId)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="adm-page">
      <PageHead title="Dispatch" kicker={`${relDay(day, today) === "today" ? "Today, " : ""}${fmtWeekday(day)}`}
        actions={<Link className="btn btn-quiet btn-sm" href="/admin">Today inbox</Link>} />

      <nav className={s.dayTabs} aria-label="Day">
        {days.map((d) => (
          <Link key={d} className={s.dayTab} href={`/admin/dispatch?day=${d}`} aria-current={d === day ? "page" : undefined}>
            {d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : fmtWeekday(d)}
            {(count.get(d) ?? 0) > 0 && <span className={s.count}>{count.get(d)}</span>}
          </Link>
        ))}
      </nav>

      {failed?.error ? <ErrorBox what="the dispatch board" error={failed.error.message} /> : loadErr ? <ErrorBox what="job details" error={loadErr} /> : (
        <>
          <Section title="Runs" id="runs">
            {runs.size === 0 && unassigned.length === 0 ? <Empty>No deliveries or collections this day.</Empty> : (
              <div className={s.runs}>
                {[...runs.values()].map((r) => {
                  const route = routeLink(base, r.stops.map((x) => x.b.address).filter(Boolean));
                  const wa = pii ? waLink(r.phone, runText(r.name, r.stops, route)) : "";
                  return (
                    <article key={r.name + r.phone} className={s.run}>
                      <div className="flex items-center justify-between gap-2">
                        <strong>{r.name}</strong>
                        <span className="muted small">{r.stops.length} stop{r.stops.length === 1 ? "" : "s"}</span>
                      </div>
                      <ol>
                        {r.stops.map((x) => (
                          <li key={`${x.dir}-${x.b.id}`}>
                            <span className={`${s.dir} ${x.dir === "out" ? s.dirOut : s.dirIn}`}>{x.dir === "out" ? "Out" : "In"}</span>{" "}
                            {x.slot || "Any time"} · <Link className="mono" href={`/admin/bookings/${x.b.id}`}>{x.b.ref}</Link> · {maskText(staff.role, area(x.b.address)) || x.info.zone}
                          </li>
                        ))}
                      </ol>
                      {pii && (
                        <div className="actions">
                          {wa ? <a className="btn btn-sm" href={wa} target="_blank" rel="noreferrer">Send run to rider</a> : <span className="muted small">Rider phone not usable for WhatsApp</span>}
                          {route && <a className="btn btn-secondary btn-sm" href={route} target="_blank" rel="noreferrer">Route in Maps</a>}
                        </div>
                      )}
                    </article>
                  );
                })}
                {unassigned.length > 0 && (
                  <article className={s.run}>
                    <div className="flex items-center justify-between gap-2">
                      <strong>No rider yet</strong>
                      <Chip tone="bad">{unassigned.length}</Chip>
                    </div>
                    <ol>
                      {unassigned.map((x) => (
                        <li key={`${x.dir}-${x.b.id}`}>
                          <span className={`${s.dir} ${x.dir === "out" ? s.dirOut : s.dirIn}`}>{x.dir === "out" ? "Out" : "In"}</span>{" "}
                          {x.slot || "Any time"} · <Link className="mono" href={`/admin/bookings/${x.b.id}`}>{x.b.ref}</Link> · {x.info.zone || "No zone"}
                        </li>
                      ))}
                    </ol>
                    {canEdit && <p className="hint">Pick a rider on each row below, or tick rows and assign them together.</p>}
                  </article>
                )}
              </div>
            )}
            {!base && pii && <p className="hint">Routes start from the rider’s current location. Set the base address in Settings to start them at base.</p>}
          </Section>

          <Section title={`Going out · ${outStops.filter((x) => x.b.delivery !== "pickup").length}`} id="out">{byZone(outStops, "out")}</Section>
          <Section title={`Coming back · ${inStops.filter((x) => x.b.delivery !== "pickup").length}`} id="in">{byZone(inStops, "in")}</Section>
          <Section title={`At base · ${atBase.length}`} id="base">
            {atBase.length ? table(atBase, null, true) : <Empty>No pickups or drop-offs at base this day.</Empty>}
          </Section>
        </>
      )}
    </div>
  );
}
