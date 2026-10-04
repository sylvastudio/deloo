import Link from "next/link";
import { briefTitle, getCategory } from "@/lib/catalog";
import { requireMembership } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export default async function Home() {
  const m = await requireMembership();
  const supabase = await createClient();
  const [{ data: types }, { data: briefs }] = await Promise.all([
    supabase.from("org_categories").select("categories(label)").eq("org_id", m.org.id),
    // RLS (briefs_select): admins see the whole org's designs, volunteers their own and their unit's.
    supabase.from("briefs").select("id, category_key, fields, updated_at").order("updated_at", { ascending: false }).limit(12),
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
        <div><Link className="btn btn-generate" href="/designs/new">New design</Link></div>
      </section>
      <section className="card grid gap-3">
        <h2 className="h2">{m.role === "admin" ? "Recent designs" : "Your designs"}</h2>
        {briefs?.length ? (
          <ul className="design-list">
            {briefs.map((b) => (
              <li key={b.id}>
                <Link href={`/designs/${b.id}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{briefTitle(b.category_key, b.fields as Record<string, string>)}</span>
                    <span className="hint">{getCategory(b.category_key)?.label ?? b.category_key}</span>
                  </span>
                  <span className="hint font-mono shrink-0">{DAY.format(new Date(b.updated_at))}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No designs yet. Your first one takes about a minute.</p>
        )}
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
