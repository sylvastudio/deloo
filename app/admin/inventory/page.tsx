import Link from "next/link";
import { setItemActive } from "@/app/admin/_actions/inventory";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Chip, Empty, ErrorBox, PageHead } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { itemPhotoUrl, safeSearch } from "@/lib/admin/data";
import { naira } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Inventory" };

type Row = {
  id: string; name: string; brand: string; model: string; category_key: string; day_rate_kobo: number; deposit_kobo: number;
  replacement_value_kobo: number; photos: string[]; active: boolean; units: { id: string; status: string }[];
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await pageStaff("inventory.view");
  const sp = await searchParams;
  const q = safeSearch(String(sp.q ?? ""));
  const cat = String(sp.cat ?? "");
  const db = await createClient();
  let query = db.from("items")
    .select("id, name, brand, model, category_key, day_rate_kobo, deposit_kobo, replacement_value_kobo, photos, active, units(id, status)")
    .order("category_key").order("name");
  if (q) query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`);
  if (cat) query = query.eq("category_key", cat);
  const [{ data, error }, { data: cats }] = await Promise.all([
    query,
    db.from("categories").select("key, label").order("sort"),
  ]);
  const rows = (data ?? []) as Row[];
  const label = new Map((cats ?? []).map((c) => [c.key as string, c.label as string]));
  const edit = can(staff.role, "inventory.edit");

  return (
    <div className="adm-page">
      <PageHead title="Inventory" actions={<>
        <Link className="btn btn-secondary" href="/admin/availability">Availability grid</Link>
        {can(staff.role, "inventory.price") && <Link className="btn" href="/admin/inventory/new">Add item</Link>}
      </>} />
      <form className="filters" method="get" role="search">
        <label className="field grow"><span className="field-label">Search</span>
          <input className="control" name="q" defaultValue={q} placeholder="Name, brand or model" /></label>
        <label className="field"><span className="field-label">Category</span>
          <select className="control" name="cat" defaultValue={cat}>
            <option value="">All</option>
            {(cats ?? []).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select></label>
        <div className="actions"><button className="btn" type="submit">Filter</button>{(q || cat) && <Link className="btn btn-quiet" href="/admin/inventory">Clear</Link>}</div>
      </form>

      {error ? <ErrorBox what="items" error={error.message} /> : rows.length === 0 ? (
        <Empty>{q || cat ? "No items match." : "No items yet. Add the first one, or load supabase/inventory_deloo.sql."}</Empty>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th></th><th>Item</th><th>Category</th><th className="num">Day rate</th><th className="num">Deposit</th><th className="num">Replacement</th><th className="num">Units</th><th>Listed</th></tr></thead>
            <tbody>
              {rows.map((i) => {
                const active = i.units.filter((u) => u.status === "active").length;
                return (
                  <tr key={i.id}>
                    <td>
                      {i.photos[0]
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img className="thumb" src={itemPhotoUrl(i.photos[0])} alt="" loading="lazy" />
                        : <span className="thumb" aria-hidden="true" />}
                    </td>
                    <td><Link className="rowlink" href={`/admin/inventory/${i.id}`}>{i.name}</Link><div className="muted small">{[i.brand, i.model].filter(Boolean).join(" ")}</div></td>
                    <td className="small">{label.get(i.category_key) ?? i.category_key}</td>
                    <td className="num">{naira(i.day_rate_kobo)}</td>
                    <td className="num">{naira(i.deposit_kobo)}</td>
                    <td className="num">{naira(i.replacement_value_kobo)}</td>
                    <td className="num">{active}/{i.units.length}{active === 0 && <div><Chip tone="bad">none free</Chip></div>}</td>
                    <td>
                      {edit ? (
                        <ActionForm action={setItemActive} confirm={i.active ? `Hide ${i.name} from renters?` : undefined}>
                          <input type="hidden" name="item_id" value={i.id} />
                          <input type="hidden" name="active" value={String(!i.active)} />
                          <Submit className={i.active ? "btn btn-secondary btn-sm" : "btn btn-quiet btn-sm"} title={i.active ? "Listed: click to hide" : "Hidden: click to list"}>
                            {i.active ? "On" : "Off"}
                          </Submit>
                        </ActionForm>
                      ) : <Chip tone={i.active ? "good" : "neutral"}>{i.active ? "On" : "Off"}</Chip>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
