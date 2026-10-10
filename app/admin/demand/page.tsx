import Link from "next/link";
import { Chip, Empty, ErrorBox, PageHead, Section } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { namesFor } from "@/lib/admin/data";
import { fmtDateTime, fmtRental, nowMs, parseRange } from "@/lib/admin/format";
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
  const spec = (s: Record<string, unknown>) => Object.entries(s ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(", ");

  return (
    <div className="adm-page">
      <PageHead title="Unmet demand" kicker="What renters asked for that we couldn’t supply" actions={
        <div className="tabs" role="tablist" aria-label="Period">
          {[7, 30, 90].map((d) => <Link key={d} className="tab" role="tab" aria-selected={days === d} href={`/admin/demand?days=${d}`}>{d} days</Link>)}
        </div>
      } />
      {error ? <ErrorBox what="unmet demand" error={error.message} /> : rows.length === 0 ? (
        <Empty>No unmet requests in the last {days} days.</Empty>
      ) : (
        <>
          <Section title="By category and reason">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Category</th><th>Reason</th><th className="num">Requests</th><th className="num">Units asked</th><th className="num">People</th><th>Latest</th></tr></thead>
                <tbody>
                  {sorted.map((g) => (
                    <tr key={`${g.cat}|${g.reason}`}>
                      <td>{label.get(g.cat) ?? g.cat}</td>
                      <td><Chip tone={g.reason === "booked" ? "warn" : "info"}>{REASON[g.reason] ?? g.reason}</Chip></td>
                      <td className="num"><strong>{g.requests}</strong></td>
                      <td className="num">{g.units}</td>
                      <td className="num">{g.people.size}</td>
                      <td className="small">{fmtDateTime(g.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">“Booked on their dates” means we stock it but every unit was out: a sign to buy another unit.</p>
          </Section>
          <Section title="Recent requests">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>When</th><th>Category</th><th>Spec</th><th className="num">Qty</th><th>Dates</th><th>Area</th><th>Reason</th><th>Who</th></tr></thead>
                <tbody>
                  {recent.map((r) => {
                    const p = parseRange(r.period);
                    return (
                      <tr key={r.id}>
                        <td className="small">{fmtDateTime(r.created_at)}</td>
                        <td>{label.get(r.category_key) ?? r.category_key}</td>
                        <td className="small mono">{spec(r.spec) || "—"}</td>
                        <td className="num">{r.quantity}</td>
                        <td className="small">{p ? fmtRental(p.from, p.to) : "—"}</td>
                        <td className="small">{r.area || "—"}</td>
                        <td className="small">{REASON[r.reason] ?? r.reason}</td>
                        <td className="small">{r.profile_id ? <Link href={`/admin/customers/${r.profile_id}`} style={{ color: "var(--lagoon)" }}>{names.get(r.profile_id) ?? "Renter"}</Link> : "—"}</td>
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
