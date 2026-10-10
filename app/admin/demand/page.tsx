import { ChartLine } from "lucide-react";
import Link from "next/link";
import { Chip, EmptyState, ErrorState, Kpi, PageHead, Section, SegmentedLinks } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { namesFor } from "@/lib/admin/data";
import { fmtDateTime, fmtRental, nowMs, parseRange } from "@/lib/admin/format";
import { humanize } from "@/lib/admin/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Unmet demand" };

type Row = { id: string; category_key: string; spec: Record<string, unknown>; quantity: number; period: string | null; area: string; reason: "not_stocked" | "booked"; profile_id: string | null; created_at: string };

const REASON = { not_stocked: "We don’t stock it", booked: "Booked on their dates" } as const;

export default async function DemandPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await pageStaff("demand.view");
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const since = new Date(nowMs() - days * 86_400_000).toISOString();
  const db = await createClient();
  const [{ data, error }, { data: cats }] = await Promise.all([
    db.from("unmet_demand").select("id, category_key, spec, quantity, period, area, reason, profile_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    db.from("categories").select("key, label"),
  ]);
  const rows = (data ?? []) as Row[];
  const label = new Map((cats ?? []).map((c) => [c.key as string, c.label as string]));
  const cat = (k: string) => label.get(k) ?? humanize(k);

  const groups = new Map<string, { cat: string; reason: Row["reason"]; requests: number; units: number; people: Set<string>; last: string }>();
  for (const r of rows) {
    const k = `${r.category_key}|${r.reason}`;
    const g = groups.get(k) ?? { cat: r.category_key, reason: r.reason, requests: 0, units: 0, people: new Set<string>(), last: "" };
    g.requests += 1; g.units += r.quantity;
    if (r.profile_id) g.people.add(r.profile_id);
    if (r.created_at > g.last) g.last = r.created_at;
    groups.set(k, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.requests - a.requests);
  const recent = rows.slice(0, 50);
  const names = staff.role === "readonly" ? new Map<string, string>() : await namesFor(db, recent.map((r) => r.profile_id));
  const spec = (s: Record<string, unknown>) => Object.entries(s ?? {}).map(([k, v]) => `${humanize(k)}: ${String(v)}`).join(", ");
  const people = new Set(rows.map((r) => r.profile_id).filter(Boolean)).size;
  const booked = rows.filter((r) => r.reason === "booked").length;

  return (
    <div className="adm-page">
      <PageHead title="Unmet demand" meta={<span>What renters asked for that we couldn’t supply</span>}
        actions={<SegmentedLinks label="Period" items={[7, 30, 90].map((d) => ({ href: `/admin/demand?days=${d}`, label: `${d} days`, current: days === d }))} />} />
      {error ? <ErrorState what="unmet demand" error={error.message} /> : rows.length === 0 ? (
        <EmptyState icon={ChartLine} title={`No unmet requests in the last ${days} days`}>When a renter asks for gear we can’t supply, it shows up here.</EmptyState>
      ) : (
        <>
          <div className="tiles">
            <Kpi label="Requests" value={rows.length} detail={`last ${days} days`} />
            <Kpi label="Renters asking" value={people} />
            <Kpi label="Booked on their dates" value={booked} detail="we stock it, every unit was out" />
            <Kpi label="Top category" value={sorted[0] ? cat(sorted[0].cat) : "—"} detail={sorted[0] ? `${sorted[0].requests} requests` : undefined} />
          </div>
          <Section title="By category and reason" description="“Booked on their dates” means we stock it but every unit was out: a sign to buy another unit.">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Category</th><th>Reason</th><th className="num">Requests</th><th className="num">Units asked</th><th className="num">People</th><th>Latest</th></tr></thead>
                <tbody>
                  {sorted.map((g) => (
                    <tr key={`${g.cat}|${g.reason}`}>
                      <td><b>{cat(g.cat)}</b></td>
                      <td><Chip tone={g.reason === "booked" ? "warn" : "neutral"}>{REASON[g.reason] ?? humanize(g.reason)}</Chip></td>
                      <td className="num money">{g.requests}</td>
                      <td className="num">{g.units}</td>
                      <td className="num">{g.people.size}</td>
                      <td className="nowrap">{fmtDateTime(g.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Recent requests" description="The latest 50.">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>When</th><th>Category</th><th>What they asked for</th><th className="num">Qty</th><th>Dates</th><th>Area</th><th>Reason</th><th>Who</th></tr></thead>
                <tbody>
                  {recent.map((r) => {
                    const p = parseRange(r.period);
                    return (
                      <tr key={r.id}>
                        <td className="nowrap">{fmtDateTime(r.created_at)}</td>
                        <td>{cat(r.category_key)}</td>
                        <td className="wrap">{spec(r.spec) || <span className="subtle">—</span>}</td>
                        <td className="num">{r.quantity}</td>
                        <td className="nowrap">{p ? fmtRental(p.from, p.to) : <span className="subtle">—</span>}</td>
                        <td>{r.area || <span className="subtle">—</span>}</td>
                        <td>{REASON[r.reason] ?? humanize(r.reason)}</td>
                        <td>{r.profile_id ? <Link className="link" href={`/admin/customers/${r.profile_id}`}>{names.get(r.profile_id) ?? "Renter"}</Link> : <span className="subtle">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
