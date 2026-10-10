import { CalendarRange, Package, Plus, SearchX } from "lucide-react";
import Link from "next/link";
import { setItemActive } from "@/app/admin/_actions/inventory";
import { ActionForm } from "@/components/admin/action-form";
import {
  ActiveFilters, AutoSubmit, ButtonLink, Chip, EmptyState, ErrorState, FilterBar, PageHead, Pagination, Switch, Tabs,
} from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { itemPhotoUrl, safeSearch } from "@/lib/admin/data";
import { itemProtectionPct, naira } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { first, hrefWith, PAGE_SIZE, pageOf, rangeOf, type SearchParams } from "@/lib/admin/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Inventory" };

type Row = {
  id: string; name: string; brand: string; model: string; category_key: string; day_rate_kobo: number; protection_rate: number | null;
  replacement_value_kobo: number; photos: string[]; active: boolean; units: { id: string; status: string }[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await pageStaff("inventory.view");
  const sp = await searchParams;
  const q = safeSearch(first(sp.q));
  const cat = first(sp.cat);
  const view = ["listed", "hidden"].includes(first(sp.view)) ? first(sp.view) : "";
  const page = pageOf(sp);
  const current = Object.fromEntries(Object.entries({ q, cat, view, page: page > 1 ? String(page) : "" }).filter(([, v]) => v)) as Record<string, string>;
  const db = await createClient();
  const narrow = (x: Q): Q => {
    let y = x;
    if (q) y = y.or(`name.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`);
    if (cat) y = y.eq("category_key", cat);
    return y;
  };
  let list = narrow(db.from("items").select("id, name, brand, model, category_key, day_rate_kobo, protection_rate, replacement_value_kobo, photos, active, units(id, status)", { count: "exact" }));
  if (view) list = list.eq("active", view === "listed");
  const [lo, hi] = rangeOf(page);
  const [res, { data: cats }, all, listed, hidden] = await Promise.all([
    list.order("category_key").order("name").range(lo, hi),
    db.from("categories").select("key, label").order("sort"),
    narrow(db.from("items").select("id", { count: "exact", head: true })),
    narrow(db.from("items").select("id", { count: "exact", head: true })).eq("active", true),
    narrow(db.from("items").select("id", { count: "exact", head: true })).eq("active", false),
  ]);
  const { data, error, count } = res as { data: Row[] | null; error: { message: string } | null; count: number | null };
  const rows = data ?? [];
  const label = new Map((cats ?? []).map((c) => [c.key as string, c.label as string]));
  const edit = can(staff.role, "inventory.edit");
  const n = (r: unknown) => (r as { count: number | null }).count;

  const chips = [
    ...(q ? [{ label: <>Search: “{q}”</>, href: hrefWith("/admin/inventory", current, { q: null }) }] : []),
    ...(cat ? [{ label: <>Category: {label.get(cat) ?? cat}</>, href: hrefWith("/admin/inventory", current, { cat: null }) }] : []),
  ];

  return (
    <div className="adm-page">
      <PageHead title="Inventory" meta={count != null ? <span>{count} item{count === 1 ? "" : "s"}</span> : undefined} actions={<>
        <ButtonLink variant="secondary" icon={CalendarRange} href="/admin/availability">Availability</ButtonLink>
        {can(staff.role, "inventory.price") && <ButtonLink icon={Plus} href="/admin/inventory/new">Add item</ButtonLink>}
      </>} />

      <Tabs label="Saved views" items={[
        { href: hrefWith("/admin/inventory", current, { view: null }), label: "All", count: n(all), current: !view },
        { href: hrefWith("/admin/inventory", current, { view: "listed" }), label: "Listed", count: n(listed), current: view === "listed" },
        { href: hrefWith("/admin/inventory", current, { view: "hidden" }), label: "Hidden", count: n(hidden), current: view === "hidden" },
      ]} />

      <div className="grid gap-3">
        <FilterBar action="/admin/inventory" hidden={{ view }}
          search={{ name: "q", value: q, label: "Search items", placeholder: "Name, brand or model" }}
          selects={[{ name: "cat", label: "Category", value: cat, anyLabel: "All categories", options: (cats ?? []).map((c) => ({ value: c.key as string, label: c.label as string })) }]} />
        <ActiveFilters items={chips} clearHref={hrefWith("/admin/inventory", { view }, {})} />
      </div>

      {error ? <ErrorState what="items" error={error.message} /> : rows.length === 0 ? (
        q || cat || view
          ? <EmptyState icon={SearchX} title="No items match">Try another name, or another category.</EmptyState>
          : <EmptyState icon={Package} title="No gear yet" action={can(staff.role, "inventory.price") ? <ButtonLink icon={Plus} href="/admin/inventory/new">Add the first item</ButtonLink> : undefined}>
              Items are what renters book; each needs at least one unit.
            </EmptyState>
      ) : (
        <div>
          <div className="tbl-wrap">
            <table className="tbl rows-link">
              <thead>
                <tr><th className="shrink"><span className="sr-only">Photo</span></th><th>Item</th><th>Category</th><th className="num">Day rate</th><th className="num">Protection</th><th className="num">Replacement</th><th className="num">Free units</th><th className="shrink">Listed</th></tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const active = i.units.filter((u) => u.status === "active").length;
                  return (
                    <tr key={i.id}>
                      <td className="shrink">
                        {i.photos[0]
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img className="thumb" src={itemPhotoUrl(i.photos[0])} alt="" loading="lazy" />
                          : <span className="thumb" aria-hidden="true" />}
                      </td>
                      <td>
                        <Link className="rowlink" href={`/admin/inventory/${i.id}`}>{i.name}</Link>
                        {(i.brand || i.model) && <span className="sub">{[i.brand, i.model].filter(Boolean).join(" ")}</span>}
                      </td>
                      <td>{label.get(i.category_key) ?? i.category_key}</td>
                      <td className="num money">{naira(i.day_rate_kobo)}</td>
                      <td className="num">{itemProtectionPct(i.protection_rate, i.category_key)}%</td>
                      <td className="num">{naira(i.replacement_value_kobo)}</td>
                      <td className="num">
                        {active === 0 ? <Chip tone="bad">None of {i.units.length}</Chip> : <span className="tabular">{active} of {i.units.length}</span>}
                      </td>
                      <td className="shrink above">
                        {edit ? (
                          <ActionForm key={`${i.id}-${i.active}`} action={setItemActive} inlineResult={false}>
                            <input type="hidden" name="item_id" value={i.id} />
                            <AutoSubmit>
                              <Switch name="active" value="true" defaultChecked={i.active} hideLabel label={`${i.name} listed for renters`}
                                confirmOff={`Hide ${i.name} from renters? It stops showing in the app. Existing bookings aren’t affected.`} />
                            </AutoSubmit>
                          </ActionForm>
                        ) : <Chip tone={i.active ? "good" : "hollow"}>{i.active ? "Listed" : "Hidden"}</Chip>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count} hrefFor={(pg) => hrefWith("/admin/inventory", current, { page: pg > 1 ? String(pg) : null })} />
        </div>
      )}
    </div>
  );
}
