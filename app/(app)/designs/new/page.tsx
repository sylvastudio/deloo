import { CATEGORIES } from "@/lib/catalog";
import { getOrgCategories } from "@/lib/kit";
import { requireMembership } from "@/lib/org";
import { NewDesign } from "./new-design";

export const metadata = { title: "New design · Deloo" };

export default async function NewDesignPage() {
  const m = await requireMembership();
  const keys = await getOrgCategories(m.org.id);
  // The types picked at onboarding; every type if none were picked.
  const categories = keys.length ? CATEGORIES.filter((c) => keys.includes(c.key)) : CATEGORIES;
  return (
    <div className="page">
      <h1 className="h1">New design</h1>
      <NewDesign categories={categories} />
    </div>
  );
}
