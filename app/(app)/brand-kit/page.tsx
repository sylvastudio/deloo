import { requireMembership } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Brand kit · Deloo" };

type Kit = { colours: Record<"primary" | "accent" | "paper" | "ink", string>; fonts: { heading: string; body: string }; tone: string; grain: boolean; logos: string[] };

// Phase 2 step 2.7 replaces this read-only view with the editor (admins) and live template previews.
export default async function BrandKit() {
  const m = await requireMembership();
  const supabase = await createClient();
  const { data: kit } = await supabase.from("brand_kits").select("colours, fonts, tone, grain, logos").eq("org_id", m.org.id).is("unit_id", null).single<Kit>();
  if (!kit) return <div className="page"><p className="error">No brand kit found.</p></div>;
  return (
    <div className="page">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="h1">Brand kit</h1>
        <span className="hint font-mono">set by HQ</span>
      </div>
      {m.role === "volunteer" && <p className="notice">🔒 Branch volunteers design with these but can&apos;t change them. That keeps every design on-brand.</p>}
      <section className="card grid gap-3">
        <h2 className="h2">Colours</h2>
        <div className="grid grid-cols-4 gap-2">
          {(["primary", "accent", "paper", "ink"] as const).map((k) => (
            <div key={k} className="grid justify-items-center gap-1 font-mono text-[11px] text-slate">
              <span className="block h-10 w-full rounded border border-line" style={{ background: kit.colours[k] }} />
              {k === "primary" ? "Main" : k[0].toUpperCase() + k.slice(1)}
              <span>{kit.colours[k]}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="card grid gap-2">
        <h2 className="h2">Tone</h2>
        <p style={{ margin: 0 }}>{kit.tone || <span className="hint">No tone set yet.</span>}</p>
      </section>
      <section className="card grid gap-2">
        <h2 className="h2">Logo</h2>
        <p className="hint">{kit.logos.length ? `${kit.logos.length} logo file(s)` : "No logo yet."} {m.role === "admin" && "Uploading arrives with the editor (step 2.7)."}</p>
      </section>
    </div>
  );
}
