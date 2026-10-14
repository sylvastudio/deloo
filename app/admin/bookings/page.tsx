import { CalendarDays, SearchX } from "lucide-react";
import Link from "next/link";
import {
  ActiveFilters, Chip, EmptyState, ErrorState, FilterBar, PageHead, Pagination, StatusChip, Tabs,
} from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { safeSearch } from "@/lib/admin/data";
import { addDays, dayStart, fmtDay, fmtDateTime, fmtRental, lagosDay, naira } from "@/lib/admin/format";
import { maskPhone } from "@/lib/admin/roles";
import { LIVE_STATUSES, STATUS_LABEL, STATUS_ORDER, type BookingStatus } from "@/lib/admin/status";
import { first, hrefWith, PAGE_SIZE, pageOf, rangeOf, type SearchParams } from "@/lib/admin/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Bookings" };

/** Saved views, in tab order. Each is a fixed filter; search, status and dates narrow it further. */
const VIEWS = {
  live: "In progress",
  deliveries_today: "Deliveries today",
  collections_today: "Collections today",
  tomorrow: "Going out tomorrow",
  with_renters: "With renters",
  overdue: "Overdue returns",
  to_inspect: "To inspect",
  holds_expiring: "Holds expiring",
  needs_refund: "Can’t honour",
  disputed: "Disputed",
} as const;
type View = keyof typeof VIEWS;

type Row = {
  id: string; ref: string | null; renter_id: string; status: BookingStatus; starts_at: string; ends_at: string; days: number;
  total_kobo: number; delivery: string; delivery_slot: string; rider_name: string; contact_phone: string; needs_refund: boolean;
  hold_expires_at: string | null;
  booking_items: { item_name: string; kind: string; units: { tag: string } | { tag: string }[] | null }[];
};

type Db = Awaited<ReturnType<typeof createClient>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

/** Apply a saved view to a bookings query. Returns whether the view lists oldest first. */
function applyView(q: Q, view: string, today: string): { q: Q; ascending: boolean; by?: "created_at" } {
  const now = new Date();
  switch (view as View) {
    case "live": return { q: q.in("status", LIVE_STATUSES), ascending: true };
    case "deliveries_today":
      return { q: q.neq("delivery", "pickup").gte("starts_at", dayStart(today)).lt("starts_at", dayStart(addDays(today, 1))).not("status", "in", "(hold,expired,cancelled)"), ascending: true };
    case "tomorrow":
      return { q: q.gte("starts_at", dayStart(addDays(today, 1))).lt("starts_at", dayStart(addDays(today, 2))).not("status", "in", "(hold,expired,cancelled)"), ascending: true };
    case "collections_today":
      return { q: q.gt("ends_at", dayStart(today)).lte("ends_at", dayStart(addDays(today, 1))).in("status", ["delivered", "out_for_delivery"]), ascending: true };
    case "holds_expiring":
      return { q: q.eq("status", "hold").gt("hold_expires_at", now.toISOString()).lte("hold_expires_at", new Date(now.getTime() + 15 * 60_000).toISOString()), ascending: true };
    case "needs_refund": return { q: q.eq("needs_refund", true), ascending: false };
    case "with_renters": return { q: q.in("status", ["out_for_delivery", "delivered"]), ascending: true };
    // Last rental day has passed and the gear isn't back.
    case "overdue": return { q: q.in("status", ["delivered", "out_for_delivery"]).lt("ends_at", now.toISOString()), ascending: true };
    case "to_inspect": return { q: q.eq("status", "collected"), ascending: true };
    case "disputed": return { q: q.eq("status", "disputed"), ascending: false };
    // Unfiltered list: newest bookings first.
    default: return { q, ascending: false, by: "created_at" };
  }
}

/** Booking ids matching a search on renter name, unit tag or serial (ref, phone and rider are matched in the query). */
async function searchIds(db: Db, q: string) {
  const [{ data: people }, { data: units }] = await Promise.all([
    db.from("profiles").select("id").ilike("full_name", `%${q}%`).limit(50),
    db.from("units").select("id").or(`serial.ilike.%${q}%,tag.ilike.%${q}%`).limit(50),
  ]);
  const unitIds = (units ?? []).map((u) => u.id as string);
  const { data: lines } = unitIds.length ? await db.from("booking_items").select("booking_id").in("unit_id", unitIds).limit(200) : { data: [] };
  return { renters: (people ?? []).map((p) => p.id as string), bookings: [...new Set((lines ?? []).map((l) => l.booking_id as string))] };
}

export default async function BookingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await pageStaff("bookings.view");
  const sp = await searchParams;
  const q = safeSearch(first(sp.q));
  // ?status=live (older dashboard links) is the "In progress" view.
  const legacyLive = first(sp.status) === "live";
  const status = legacyLive ? "" : first(sp.status);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.from)) ? first(sp.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.to)) ? first(sp.to) : "";
  const view = legacyLive ? "live" : Object.hasOwn(VIEWS, first(sp.view)) ? first(sp.view) : "";
  const page = pageOf(sp);
  const current = Object.fromEntries(Object.entries({ q, status, from, to, view, page: page > 1 ? String(page) : "" }).filter(([, v]) => v)) as Record<string, string>;
  const db = await createClient();
  const today = lagosDay();

  // Search, status and dates (shared by the list and the view counts).
  const found = q ? await searchIds(db, q) : null;
  const narrow = (query: Q): Q => {
    let x = query;
    if (status && (STATUS_ORDER as string[]).includes(status)) x = x.eq("status", status);
    if (from) x = x.gt("ends_at", dayStart(from));
    if (to) x = x.lt("starts_at", dayStart(addDays(to, 1)));
    if (found) {
      const ors = [`ref.ilike.%${q}%`, `contact_phone.ilike.%${q.replace(/\s/g, "")}%`, `rider_name.ilike.%${q}%`];
      if (found.renters.length) ors.push(`renter_id.in.(${found.renters.join(",")})`);
      if (found.bookings.length) ors.push(`id.in.(${found.bookings.join(",")})`);
      x = x.or(ors.join(","));
    }
    return x;
  };

  const base = narrow(db.from("bookings").select(
    "id, ref, renter_id, status, starts_at, ends_at, days, total_kobo, delivery, delivery_slot, rider_name, contact_phone, needs_refund, hold_expires_at, booking_items(item_name, kind, units(tag))",
    { count: "exact" },
  ));
  const { q: listQ, ascending, by = "starts_at" } = applyView(base, view, today);
  const [lo, hi] = rangeOf(page);
  const countOf = (v: string) => applyView(narrow(db.from("bookings").select("id", { count: "exact", head: true })), v, today).q;
  const viewKeys = Object.keys(VIEWS) as View[];
  const [res, ...counts] = await Promise.all([
    listQ.order(by, { ascending }).range(lo, hi),
    countOf(""),
    ...viewKeys.map((k) => countOf(k)),
  ]);
  const { data, error, count } = res as { data: Row[] | null; error: { message: string } | null; count: number | null };
  const rows = data ?? [];
  const n = (r: unknown) => (r as { count: number | null }).count;

  const renterIds = [...new Set(rows.map((r) => r.renter_id))];
  const { data: profiles } = renterIds.length
    ? await db.from("profiles").select("id, full_name, phone").in("id", renterIds)
    : { data: [] as { id: string; full_name: string; phone: string }[] };
  const people = new Map((profiles ?? []).map((p) => [p.id as string, p as { full_name: string; phone: string }]));

  const chips = [
    ...(q ? [{ label: <>Search: “{q}”</>, href: hrefWith("/admin/bookings", current, { q: null }) }] : []),
    ...(status ? [{ label: <>Status: {STATUS_LABEL[status as BookingStatus] ?? status}</>, href: hrefWith("/admin/bookings", current, { status: null }) }] : []),
    ...(from ? [{ label: <>From {fmtDay(from)}</>, href: hrefWith("/admin/bookings", current, { from: null }) }] : []),
    ...(to ? [{ label: <>To {fmtDay(to)}</>, href: hrefWith("/admin/bookings", current, { to: null }) }] : []),
  ];
  const filtered = chips.length > 0;

  return (
    <div className="adm-page">
      <PageHead title="Bookings" meta={count != null ? <span>{count} {view ? VIEWS[view as View].toLowerCase() : filtered ? "matching" : "in total"}</span> : undefined} />

      <Tabs label="Saved views" items={[
        { href: hrefWith("/admin/bookings", current, { view: null }), label: "All", count: n(counts[0]), current: !view },
        ...viewKeys.map((k, i) => ({ href: hrefWith("/admin/bookings", current, { view: k }), label: VIEWS[k], count: n(counts[i + 1]), current: view === k })),
      ]} />

      <div className="grid gap-3">
        <FilterBar action="/admin/bookings" hidden={{ view }}
          search={{ name: "q", value: q, label: "Search bookings", placeholder: "Ref, renter, phone, rider or serial", autoFocus: first(sp.focus) === "1" }}
          selects={[{ name: "status", label: "Status", value: status, anyLabel: "Any status", options: STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })) }]}
          dates={[{ name: "from", label: "From", value: from }, { name: "to", label: "To", value: to }]} />
        <ActiveFilters items={chips} clearHref={hrefWith("/admin/bookings", { view }, {})} />
      </div>

      {error ? <ErrorState what="bookings" error={error.message} /> : rows.length === 0 ? (
        filtered || view
          ? <EmptyState icon={SearchX} title="No bookings match" action={<Link className="btn btn-secondary" href="/admin/bookings">Show all bookings</Link>}>Try a different search or remove a filter.</EmptyState>
          : <EmptyState icon={CalendarDays} title="No bookings yet">They appear here as soon as a renter places a hold.</EmptyState>
      ) : (
        <div>
          <div className="tbl-wrap">
            <table className="tbl rows-link">
              <thead>
                <tr>
                  <th>Ref</th><th>Renter</th><th>Gear</th><th>Dates</th><th className="num">Total</th><th>Status</th><th>Handover</th><th>Rider</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const p = people.get(b.renter_id);
                  const items = b.booking_items.filter((i) => i.kind === "rental");
                  const u = items[0] ? (Array.isArray(items[0].units) ? items[0].units[0] : items[0].units) : null;
                  return (
                    <tr key={b.id}>
                      <td className="nowrap"><Link className="rowlink mono" href={`/admin/bookings/${b.id}`}>{b.ref ?? b.id.slice(0, 8)}</Link></td>
                      <td>
                        {p?.full_name ?? <span className="muted">Unknown</span>}
                        <span className="sub mono">{maskPhone(staff.role, b.contact_phone || p?.phone || "") || "No phone"}</span>
                      </td>
                      <td className="wrap">
                        {items.length ? <>{items[0].item_name}{u?.tag && <span className="mono muted"> · {u.tag}</span>}</> : <span className="muted">No gear</span>}
                        {items.length > 1 && <span className="sub">+{items.length - 1} more</span>}
                      </td>
                      <td className="nowrap">{fmtRental(b.starts_at, b.ends_at)}<span className="sub">{b.days} day{b.days === 1 ? "" : "s"}</span></td>
                      <td className="num money">{naira(b.total_kobo)}</td>
                      <td>
                        <div className="grid gap-1 justify-items-start">
                          <StatusChip status={b.status} />
                          {b.needs_refund && <Chip tone="bad">Needs refund</Chip>}
                          {b.status === "hold" && b.hold_expires_at && <span className="sub">Until {fmtDateTime(b.hold_expires_at)}</span>}
                        </div>
                      </td>
                      <td className="nowrap">{b.delivery === "pickup" ? "Pickup" : "Delivery"}{b.delivery_slot && <span className="sub">{b.delivery_slot}</span>}</td>
                      <td>{b.rider_name || <span className="subtle">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count} hrefFor={(pg) => hrefWith("/admin/bookings", current, { page: pg > 1 ? String(pg) : null })} />
        </div>
      )}
    </div>
  );
}
