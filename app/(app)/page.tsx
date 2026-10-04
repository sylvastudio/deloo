import Link from "next/link";
import { requireMembership } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const m = await requireMembership();
  const supabase = await createClient();
  const [{ data: types }, { count: briefs }] = await Promise.all([
    supabase.from("org_categories").select("categories(label)").eq("org_id", m.org.id),
    supabase.from("briefs").select("id", { count: "exact", head: true }),
  ]);
  const labels = (types ?? []).map((t) => (Array.isArray(t.categories) ? t.categories[0]?.label : (t.categories as { label: string } | null)?.label)).filter(Boolean);
  return (
    <div className="page">
      <div className="grid gap-1">
        <p className="kicker">{m.role === "admin" ? "HQ" : m.unit?.name}</p>
        <h1 className="h1">Welcome to {m.org.name}&apos;s studio</h1>
      </div>
      <section className="card grid gap-3">
        <h2 className="h2">Make a design</h2>
        <p className="hint" style={{ fontSize: 14 }}>Describe it the way you&apos;d text it. Deloo writes the copy and lays it out in your brand, in every size.</p>
        <div className="flex flex-wrap gap-2">{labels.map((l) => <span key={l} className="badge">{l}</span>)}</div>
        <div><span className="btn btn-generate" aria-disabled="true">New design · coming in Phase 3</span></div>
        <p className="hint">{briefs ?? 0} brief{briefs === 1 ? "" : "s"} visible to you.</p>
      </section>
      <section className="card grid gap-3">
        <h2 className="h2">Brand kit</h2>
        <p className="hint" style={{ fontSize: 14 }}>{m.role === "admin" ? "Set your logo, colours and tone once. Every branch and department designs with them." : "Set by HQ. You design with it, and it keeps every design on-brand."}</p>
        <div><Link className="btn btn-secondary" href="/brand-kit">{m.role === "admin" ? "Edit brand kit" : "View brand kit"}</Link></div>
      </section>
      {m.role === "admin" && (
        <section className="card grid gap-3">
          <h2 className="h2">Members</h2>
          <p className="hint" style={{ fontSize: 14 }}>Invite volunteers to a branch or department.</p>
          <div><Link className="btn btn-secondary" href="/settings/members">Manage members</Link></div>
        </section>
      )}
    </div>
  );
}
