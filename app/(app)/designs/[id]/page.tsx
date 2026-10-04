import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategory } from "@/lib/catalog";
import { getKit, getOrgStyles } from "@/lib/kit";
import { requireMembership } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Studio } from "./studio";

export const metadata = { title: "Design · Deloo" };

export default async function DesignPage({ params }: PageProps<"/designs/[id]">) {
  const { id } = await params;
  const m = await requireMembership();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  // RLS (briefs_select) decides who can see it: HQ admins, the author, and the author's unit.
  const { data: brief } = await supabase.from("briefs").select("id, category_key, raw_text, fields, author_id").eq("id", id).maybeSingle();
  const category = brief && getCategory(brief.category_key);
  if (!brief || !category) notFound();
  const [kit, styles] = await Promise.all([getKit(m.org.id), getOrgStyles(m.org.id)]);
  if (!kit) return <div className="page"><p className="error">No brand kit found.</p></div>;
  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="h1">{category.label}</h1>
        <Link href="/designs/new" className="btn btn-quiet btn-sm">New design</Link>
      </div>
      <Studio
        brief={{ id: brief.id, category: category.key, rawText: brief.raw_text, fields: brief.fields as Record<string, string> }}
        canEdit={m.role === "admin" || brief.author_id === m.userId}
        kit={kit} orgId={m.org.id} orgName={m.org.name} orgStyles={styles}
      />
    </div>
  );
}
