import { createItem } from "@/app/admin/_actions/inventory";
import { ItemForm, type Category } from "@/components/admin/item-form";
import { ErrorBox, PageHead, Section } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Add item" };

export default async function NewItemPage() {
  await pageStaff("inventory.price");
  const db = await createClient();
  const { data, error } = await db.from("categories").select("key, label, grp, spec_schema").order("sort");
  return (
    <div className="adm-page narrow">
      <PageHead crumbs={[{ href: "/admin/inventory", label: "Inventory" }]} title="Add item" />
      {error ? <ErrorBox what="categories" error={error.message} /> : (
        <Section title="Details">
          <p className="hint">The item starts hidden. Add units and photos next, then list it.</p>
          <ItemForm item={{ specs: {}, in_the_box: [] }} categories={(data ?? []) as Category[]} action={createItem} canEdit canPrice submitLabel="Add item" />
        </Section>
      )}
    </div>
  );
}
