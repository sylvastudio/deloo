import { getKit, getOrgCategories, getOrgStyles } from "@/lib/kit";
import { requireMembership } from "@/lib/org";
import { BrandKitEditor } from "./editor";

export const metadata = { title: "Brand kit · Deloo" };

export default async function BrandKit() {
  const m = await requireMembership();
  const [kit, styles, categories] = await Promise.all([getKit(m.org.id), getOrgStyles(m.org.id), getOrgCategories(m.org.id)]);
  if (!kit) return <div className="page"><p className="error">No brand kit found.</p></div>;
  return (
    <div className="page">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="h1">Brand kit</h1>
        <span className="hint font-mono">{m.role === "admin" ? "you manage this" : "set by HQ"}</span>
      </div>
      <BrandKitEditor kit={kit} orgId={m.org.id} orgName={m.org.name} readOnly={m.role !== "admin"} styles={styles} categories={categories} />
    </div>
  );
}
