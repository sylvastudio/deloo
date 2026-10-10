import Link from "next/link";
import { notFound } from "next/navigation";
import { addUnit, changeItemPhoto, saveItem, saveUnit } from "@/app/admin/_actions/inventory";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ItemForm, type Category } from "@/components/admin/item-form";
import { ItemPhotoUpload } from "@/components/admin/item-photos";
import { Chip, Empty, ErrorBox, PageHead, Section } from "@/components/admin/ui";
import { UnitStatusSelect } from "@/components/admin/unit-status-select";
import { pageStaff } from "@/lib/admin/auth";
import { itemPhotoUrl } from "@/lib/admin/data";
import { fmtRental } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import type { ItemRow, UnitRow } from "@/lib/admin/types";
import { one } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Item" };

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await pageStaff("inventory.view");
  const db = await createClient();
  const [itemRes, unitsRes, catsRes] = await Promise.all([
    db.from("items").select("*").eq("id", id).maybeSingle(),
    db.from("units").select("id, item_id, tag, serial, condition, notes, status, created_at").eq("item_id", id).order("created_at"),
    db.from("categories").select("key, label, grp, spec_schema").order("sort"),
  ]);
  if (itemRes.error) return <div className="adm-page"><ErrorBox what="this item" error={itemRes.error.message} /></div>;
  if (!itemRes.data) notFound();
  const item = itemRes.data as ItemRow;
  const units = (unitsRes.data ?? []) as UnitRow[];

  // Upcoming bookings per unit: a unit leaving `active` warns about these.
  const future = new Map<string, { ref: string; id: string; starts_at: string; ends_at: string }[]>();
  if (units.length) {
    const { data: res } = await db.from("reservations").select("unit_id, bookings(id, ref, starts_at, ends_at, status)")
      .in("unit_id", units.map((u) => u.id)).eq("live", true).not("booking_id", "is", null).overlaps("period", `[${new Date().toISOString()},)`);
    for (const r of res ?? []) {
      const b = one(r.bookings as { id: string; ref: string; starts_at: string; ends_at: string } | { id: string; ref: string; starts_at: string; ends_at: string }[] | null);
      if (!b) continue;
      const list = future.get(r.unit_id as string) ?? [];
      list.push(b);
      future.set(r.unit_id as string, list);
    }
  }

  const edit = can(staff.role, "inventory.edit");
  const price = can(staff.role, "inventory.price");

  return (
    <div className="adm-page">
      <PageHead crumbs={[{ href: "/admin/inventory", label: "Inventory" }]} title={item.name}
        actions={<><Chip tone={item.active ? "good" : "neutral"}>{item.active ? "Listed" : "Hidden"}</Chip><Link className="btn btn-secondary btn-sm" href={`/admin/availability?item=${id}`}>Availability</Link></>} />
      {sp.new && <p className="ok-box">Item added. It stays hidden until you add units and photos and tick “Listed”.</p>}

      <div className="split">
        <Section title="Details">
          <ItemForm item={item} categories={(catsRes.data ?? []) as Category[]} action={saveItem} canEdit={edit} canPrice={price} submitLabel="Save item" />
        </Section>

        <div className="grid gap-4">
          <Section title="Photos" actions={edit ? <ItemPhotoUpload itemId={id} vendorId={item.vendor_id} /> : undefined}>
            {item.photos.length === 0 ? <Empty>No photos yet. The first photo is the cover.</Empty> : (
              <div className="gallery">
                {item.photos.map((p, n) => (
                  <figure key={p}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={itemPhotoUrl(p)} alt={`${item.name} photo ${n + 1}`} loading="lazy" />
                    <figcaption className="flex gap-1 items-center">
                      {n === 0 ? <Chip tone="info">Cover</Chip> : edit && (
                        <ActionForm action={changeItemPhoto} inlineResult={false}>
                          <input type="hidden" name="item_id" value={id} /><input type="hidden" name="path" value={p} /><input type="hidden" name="op" value="cover" />
                          <Submit className="btn btn-quiet btn-sm">Make cover</Submit>
                        </ActionForm>
                      )}
                      {edit && (
                        <ActionForm action={changeItemPhoto} confirm="Delete this photo?" inlineResult={false}>
                          <input type="hidden" name="item_id" value={id} /><input type="hidden" name="path" value={p} /><input type="hidden" name="op" value="remove" />
                          <Submit className="btn btn-quiet btn-sm">Delete</Submit>
                        </ActionForm>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </Section>

          <Section title={`Units (${units.filter((u) => u.status === "active").length} active of ${units.length})`}>
            {unitsRes.error ? <ErrorBox what="units" error={unitsRes.error.message} /> : units.length === 0 ? <Empty>No units. Renters can’t book an item without one.</Empty> : (
              <div className="grid gap-3">
                {units.map((u) => {
                  const up = future.get(u.id) ?? [];
                  return (
                    <ActionForm key={u.id} action={saveUnit} className="card grid gap-2" confirm={undefined}>
                      <input type="hidden" name="unit_id" value={u.id} />
                      <div className="cols-2">
                        <label className="field"><span className="field-label">Tag</span><input className="control" name="tag" defaultValue={u.tag} placeholder="FX3-01" readOnly={!edit} /></label>
                        <label className="field"><span className="field-label">Serial</span><input className="control mono" name="serial" defaultValue={u.serial} readOnly={!edit} /></label>
                        <label className="field"><span className="field-label">Condition</span>
                          <input className="control" name="condition" defaultValue={u.condition} list="conditions" placeholder="A / B / C" readOnly={!edit} /></label>
                        <div className="field"><span className="field-label">Status</span>
                          <UnitStatusSelect current={u.status} futureBookings={up.length} canRetire={price} disabled={!edit} /></div>
                      </div>
                      <label className="field"><span className="field-label">Notes</span>
                        <textarea className="control" name="notes" rows={2} defaultValue={u.notes} style={{ minHeight: 50 }} readOnly={!edit} placeholder="Marks, missing parts, repair history" /></label>
                      {up.length > 0 && (
                        <p className="small muted" style={{ margin: 0 }}>Upcoming: {up.map((b, n) => (
                          <span key={b.id}>{n > 0 && ", "}<Link href={`/admin/bookings/${b.id}`} style={{ color: "var(--lagoon)" }}>{b.ref}</Link> ({fmtRental(b.starts_at, b.ends_at)})</span>
                        ))}</p>
                      )}
                      {edit && <div className="actions"><Submit className="btn btn-secondary btn-sm">Save unit</Submit></div>}
                    </ActionForm>
                  );
                })}
              </div>
            )}
            <datalist id="conditions"><option value="A" /><option value="B" /><option value="C" /></datalist>
            {edit && (
              <details className="inline">
                <summary>+ Add a unit</summary>
                <ActionForm action={addUnit} className="grid gap-2" resetOnSuccess>
                  <input type="hidden" name="item_id" value={id} />
                  <div className="cols-2">
                    <label className="field"><span className="field-label">Tag</span><input className="control" name="tag" placeholder="FX3-02" /></label>
                    <label className="field"><span className="field-label">Serial</span><input className="control mono" name="serial" /></label>
                    <label className="field"><span className="field-label">Condition</span><input className="control" name="condition" list="conditions" defaultValue="A" /></label>
                  </div>
                  <label className="field"><span className="field-label">Notes</span><input className="control" name="notes" /></label>
                  <div className="actions"><Submit className="btn btn-sm">Add unit</Submit></div>
                </ActionForm>
              </details>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
