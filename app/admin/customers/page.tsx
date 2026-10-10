import Link from "next/link";
import { Chip, Empty, ErrorBox, PageHead } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { safeSearch } from "@/lib/admin/data";
import { fmtDateTime, naira } from "@/lib/admin/format";
import { maskPhone } from "@/lib/admin/roles";
import { PAID_STATUSES } from "@/lib/admin/status";
import type { ProfileRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await pageStaff("customers.view");
  const sp = await searchParams;
  const q = safeSearch(sp.q ?? "");
  const blockedOnly = sp.blocked === "1";
  const db = await createClient();
  let query = db.from("profiles").select("id, full_name, phone, blocked, trust_level, created_at").order("created_at", { ascending: false }).limit(300);
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q.replace(/\s/g, "")}%`);
  if (blockedOnly) query = query.eq("blocked", true);
  const { data, error } = await query;
  const rows = (data ?? []) as ProfileRow[];

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
  const { data: staffRows } = await db.from("staff_members").select("user_id");
  const staffIds = new Set((staffRows ?? []).map((s) => s.user_id as string));

  return (
    <div className="adm-page">
      <PageHead title="Customers" />
      <form className="filters" method="get" role="search">
        <label className="field grow"><span className="field-label">Search</span>
          <input className="control" name="q" defaultValue={q} placeholder="Name or phone" /></label>
        <label className="switch" style={{ alignSelf: "center" }}><input type="checkbox" name="blocked" value="1" defaultChecked={blockedOnly} /> Blocked only</label>
        <div className="actions"><button className="btn" type="submit">Filter</button>{(q || blockedOnly) && <Link className="btn btn-quiet" href="/admin/customers">Clear</Link>}</div>
      </form>
      {error ? <ErrorBox what="customers" error={error.message} /> : rows.length === 0 ? (
        <Empty>{q || blockedOnly ? "No customers match." : "No customers yet."}</Empty>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Phone</th><th className="num">Paid bookings</th><th className="num">Total spent</th><th>Last booking</th><th>Joined</th><th>Flags</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const s = stats.get(p.id);
                return (
                  <tr key={p.id}>
                    <td><Link className="rowlink" href={`/admin/customers/${p.id}`}>{p.full_name}</Link></td>
                    <td className="mono small">{maskPhone(staff.role, p.phone) || "—"}</td>
                    <td className="num">{s?.n ?? 0}</td>
                    <td className="num">{naira(s?.spent ?? 0)}</td>
                    <td className="small">{s?.last ? fmtDateTime(s.last) : "—"}</td>
                    <td className="small">{fmtDateTime(p.created_at)}</td>
                    <td><div className="flex gap-1 flex-wrap">
                      {p.blocked && <Chip tone="bad">Blocked</Chip>}
                      {staffIds.has(p.id) && <Chip tone="info">Staff</Chip>}
                      {p.trust_level > 0 && <Chip tone="good">Tier {p.trust_level}</Chip>}
                    </div></td>
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
