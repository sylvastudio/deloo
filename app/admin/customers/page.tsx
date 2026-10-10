import { SearchX, Users } from "lucide-react";
import Link from "next/link";
import { ActiveFilters, Chip, EmptyState, ErrorState, FilterBar, PageHead, Pagination, Tabs } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { safeSearch } from "@/lib/admin/data";
import { fmtDateTime, naira } from "@/lib/admin/format";
import { maskPhone } from "@/lib/admin/roles";
import { PAID_STATUSES } from "@/lib/admin/status";
import type { ProfileRow } from "@/lib/admin/types";
import { first, hrefWith, PAGE_SIZE, pageOf, rangeOf, type SearchParams } from "@/lib/admin/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Customers" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await pageStaff("customers.view");
  const sp = await searchParams;
  const q = safeSearch(first(sp.q));
  const blocked = first(sp.blocked) === "1";
  const page = pageOf(sp);
  const current = Object.fromEntries(Object.entries({ q, blocked: blocked ? "1" : "", page: page > 1 ? String(page) : "" }).filter(([, v]) => v)) as Record<string, string>;
  const db = await createClient();
  const narrow = (x: Q): Q => (q ? x.or(`full_name.ilike.%${q}%,phone.ilike.%${q.replace(/\s/g, "")}%`) : x);
  const [lo, hi] = rangeOf(page);
  let list = narrow(db.from("profiles").select("id, full_name, phone, blocked, trust_level, created_at", { count: "exact" }));
  if (blocked) list = list.eq("blocked", true);
  const [res, allCount, blockedCount, staffRes] = await Promise.all([
    list.order("created_at", { ascending: false }).range(lo, hi),
    narrow(db.from("profiles").select("id", { count: "exact", head: true })),
    narrow(db.from("profiles").select("id", { count: "exact", head: true })).eq("blocked", true),
    db.from("staff_members").select("user_id"),
  ]);
  const { data, error, count } = res as { data: ProfileRow[] | null; error: { message: string } | null; count: number | null };
  const rows = data ?? [];
  const staffIds = new Set(((staffRes.data ?? []) as { user_id: string }[]).map((s) => s.user_id));

  const stats = new Map<string, { n: number; spent: number; last: string }>();
  if (rows.length) {
    const { data: bs } = await db.from("bookings").select("renter_id, total_kobo, status, created_at").in("renter_id", rows.map((r) => r.id));
    for (const b of bs ?? []) {
      const s = stats.get(b.renter_id as string) ?? { n: 0, spent: 0, last: "" };
      if ((PAID_STATUSES as string[]).includes(b.status as string)) { s.n += 1; s.spent += Number(b.total_kobo); }
      if ((b.created_at as string) > s.last) s.last = b.created_at as string;
      stats.set(b.renter_id as string, s);
    }
  }
  const n = (r: unknown) => (r as { count: number | null }).count;

  return (
    <div className="adm-page">
      <PageHead title="Customers" meta={count != null ? <span>{count} {blocked ? "blocked" : q ? "matching" : "renters"}</span> : undefined} />
      <Tabs label="Saved views" items={[
        { href: hrefWith("/admin/customers", current, { blocked: null }), label: "All", count: n(allCount), current: !blocked },
        { href: hrefWith("/admin/customers", current, { blocked: "1" }), label: "Blocked", count: n(blockedCount), current: blocked },
      ]} />
      <div className="grid gap-3">
        <FilterBar action="/admin/customers" hidden={{ blocked: blocked ? "1" : "" }}
          search={{ name: "q", value: q, label: "Search customers", placeholder: "Name or phone" }} />
        <ActiveFilters items={q ? [{ label: <>Search: “{q}”</>, href: hrefWith("/admin/customers", current, { q: null }) }] : []} />
      </div>
      {error ? <ErrorState what="customers" error={error.message} /> : rows.length === 0 ? (
        q || blocked
          ? <EmptyState icon={SearchX} title="No customers match">Try part of the name, or the last digits of the phone number.</EmptyState>
          : <EmptyState icon={Users} title="No customers yet">Renters appear here when they sign up in the app.</EmptyState>
      ) : (
        <div>
          <div className="tbl-wrap">
            <table className="tbl rows-link">
              <thead><tr><th>Name</th><th>Phone</th><th className="num">Paid bookings</th><th className="num">Total spent</th><th>Last booking</th><th>Joined</th><th>Flags</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const s = stats.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td><Link className="rowlink" href={`/admin/customers/${p.id}`}>{p.full_name || "No name"}</Link></td>
                      <td className="mono nowrap">{maskPhone(staff.role, p.phone) || <span className="subtle">—</span>}</td>
                      <td className="num">{s?.n ?? 0}</td>
                      <td className="num money">{naira(s?.spent ?? 0)}</td>
                      <td className="nowrap">{s?.last ? fmtDateTime(s.last) : <span className="subtle">—</span>}</td>
                      <td className="nowrap">{fmtDateTime(p.created_at)}</td>
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {p.blocked && <Chip tone="bad">Blocked</Chip>}
                          {staffIds.has(p.id) && <Chip tone="info">Staff</Chip>}
                          {p.trust_level > 0 && <Chip tone="good">Trusted, tier {p.trust_level}</Chip>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count} hrefFor={(pg) => hrefWith("/admin/customers", current, { page: pg > 1 ? String(pg) : null })} />
        </div>
      )}
    </div>
  );
}
