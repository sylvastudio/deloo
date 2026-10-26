import { CalendarRange, ImageOff, Pencil, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addUnit, changeItemPhoto, saveItem, saveUnit } from "@/app/admin/_actions/inventory";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ItemForm, type Category } from "@/components/admin/item-form";
import { ItemPhotoUpload } from "@/components/admin/item-photos";
import {
  ButtonLink, Callout, Chip, DescriptionList, Drawer, EmptyState, ErrorState, Field, PageHead, Section, UnitStatusChip,
} from "@/components/admin/ui";
import { UnitStatusSelect } from "@/components/admin/unit-status-select";
import { pageStaff } from "@/lib/admin/auth";
import { itemPhotoUrl } from "@/lib/admin/data";
import { fmtRental, itemProtectionPct, naira } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import type { ItemRow, UnitRow } from "@/lib/admin/types";
import { one } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Item" };

type Upcoming = { ref: string; id: string; starts_at: string; ends_at: string };

function UnitFields({ u, edit, price, upcoming }: { u?: UnitRow; edit: boolean; price: boolean; upcoming: number }) {
  return (
    <>
      <div className="cols-2">
        <Field label="Tag" hint="Painted or stickered on the unit, e.g. FX3-01."><input className="control" name="tag" defaultValue={u?.tag ?? ""} readOnly={!edit} /></Field>
        <Field label="Serial"><input className="control mono" name="serial" defaultValue={u?.serial ?? ""} readOnly={!edit} /></Field>
        <Field label="Condition" note="A, B or C"><input className="control" name="condition" defaultValue={u?.condition ?? "A"} list="conditions" readOnly={!edit} /></Field>
        {u && (
          <Field as="div" label="Status">
            <UnitStatusSelect current={u.status} futureBookings={upcoming} canRetire={price} disabled={!edit} />
          </Field>
        )}
      </div>
      <Field label="Notes" note="optional">
        <textarea className="control" name="notes" rows={2} defaultValue={u?.notes ?? ""} readOnly={!edit} placeholder="Marks, missing parts, repair history" />
      </Field>
    </>
  );
}

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
  if (itemRes.error) return <div className="adm-page"><ErrorState what="this item" error={itemRes.error.message} /></div>;
  if (!itemRes.data) notFound();
  const item = itemRes.data as ItemRow;
  const units = (unitsRes.data ?? []) as UnitRow[];
  const cats = (catsRes.data ?? []) as Category[];

  // Upcoming bookings per unit: a unit leaving `active` warns about these.
  const future = new Map<string, Upcoming[]>();
  if (units.length) {
    const { data: res } = await db.from("reservations").select("unit_id, bookings(id, ref, starts_at, ends_at, status)")
      .in("unit_id", units.map((u) => u.id)).eq("live", true).not("booking_id", "is", null).overlaps("period", `[${new Date().toISOString()},)`);
    for (const r of res ?? []) {
      const b = one(r.bookings as Upcoming | Upcoming[] | null);
      if (!b) continue;
      future.set(r.unit_id as string, [...(future.get(r.unit_id as string) ?? []), b]);
    }
  }

  const edit = can(staff.role, "inventory.edit");
  const price = can(staff.role, "inventory.price");
  const activeUnits = units.filter((u) => u.status === "active").length;
  const catLabel = cats.find((c) => c.key === item.category_key)?.label ?? item.category_key;
  const specs = Object.entries(item.specs ?? {});

  return (
    <div className="adm-page">
      <PageHead crumbs={[{ href: "/admin/inventory", label: "Inventory" }]} title={item.name}
        meta={<>
          <Chip tone={item.active ? "good" : "hollow"}>{item.active ? "Listed" : "Hidden"}</Chip>
          <span>{catLabel}</span>
          <span className="tabular">{naira(item.day_rate_kobo)} a day</span>
          <span className="tabular">{activeUnits} of {units.length} unit{units.length === 1 ? "" : "s"} active</span>
        </>}
        actions={<ButtonLink variant="secondary" icon={CalendarRange} href={`/admin/availability?item=${id}`}>Availability</ButtonLink>} />
      {sp.new && <Callout tone="ok" title="Item added">It stays hidden until you add units and photos and switch on Listed.</Callout>}

      <div className="split">
        <Section title="Details">
          {edit ? (
            <ItemForm item={item} categories={cats} action={saveItem} canEdit={edit} canPrice={price} submitLabel="Save item" />
          ) : (
            <DescriptionList items={[
              ["Category", catLabel],
              ["Brand", item.brand],
              ["Model", item.model],
              ["Description", item.description ? <span className="whitespace-pre-wrap">{item.description}</span> : null],
              ["Day rate", <span key="r" className="tabular">{naira(item.day_rate_kobo)}</span>],
              ["Protection", `${itemProtectionPct(item.protection_rate, item.category_key)}% of the rental`],
              ["Replacement value", <span key="v" className="tabular">{naira(item.replacement_value_kobo)}</span>],
              ["Specs", specs.length ? <>{specs.map(([k, v]) => <span key={k} className="block"><span className="muted">{k}:</span> {String(v)}</span>)}</> : null],
              ["In the box", item.in_the_box?.length ? <>{item.in_the_box.map((x) => <span key={x} className="block">{x}</span>)}</> : null],
            ]} />
          )}
        </Section>

        <div className="stack">
          <Section title="Photos" description="The first photo is the cover in the app." actions={edit ? <ItemPhotoUpload itemId={id} vendorId={item.vendor_id} /> : undefined}>
            {item.photos.length === 0 ? <EmptyState compact icon={ImageOff} title="No photos yet." /> : (
              <div className="gallery">
                {item.photos.map((p, n) => (
                  <figure key={p}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={itemPhotoUrl(p)} alt={`${item.name}, photo ${n + 1}`} loading="lazy" />
                    <figcaption className="flex items-center gap-1">
                      {n === 0 ? <Chip tone="info">Cover</Chip> : edit && (
                        <ActionForm action={changeItemPhoto} inlineResult={false}>
                          <input type="hidden" name="item_id" value={id} /><input type="hidden" name="path" value={p} /><input type="hidden" name="op" value="cover" />
                          <Submit variant="ghost" size="sm" icon={<Star aria-hidden="true" />}>Make cover</Submit>
                        </ActionForm>
                      )}
                      {edit && (
                        <ActionForm action={changeItemPhoto} confirm={`Delete photo ${n + 1} of ${item.name}? Renters stop seeing it straight away.`} confirmLabel="Delete photo" inlineResult={false}>
                          <input type="hidden" name="item_id" value={id} /><input type="hidden" name="path" value={p} /><input type="hidden" name="op" value="remove" />
                          <button type="submit" className="btn btn-danger-ghost btn-sm icon-btn" aria-label={`Delete photo ${n + 1}`} title="Delete photo"><Trash2 aria-hidden="true" /></button>
                        </ActionForm>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </Section>

          <Section title="Units" description={`${activeUnits} of ${units.length} can be booked. Each unit is one physical piece of gear.`}
            actions={edit ? (
              <Drawer trigger={{ label: "Add unit", icon: <Plus aria-hidden="true" />, variant: "secondary", size: "sm" }} title="Add a unit" description={item.name}>
                <ActionForm action={addUnit} className="grid gap-4" resetOnSuccess>
                  <input type="hidden" name="item_id" value={id} />
                  <UnitFields edit price={price} upcoming={0} />
                  <div className="actions"><Submit icon={<Plus aria-hidden="true" />}>Add unit</Submit></div>
                </ActionForm>
              </Drawer>
            ) : undefined}>
            <datalist id="conditions"><option value="A" /><option value="B" /><option value="C" /></datalist>
            {unitsRes.error ? <ErrorState what="units" error={unitsRes.error.message} /> : units.length === 0 ? (
              <EmptyState compact title="No units yet. Renters can’t book an item without one." />
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Tag</th><th>Serial</th><th>Condition</th><th>Status</th><th>Upcoming</th><th className="shrink"><span className="sr-only">Edit</span></th></tr></thead>
                  <tbody>
                    {units.map((u) => {
                      const up = future.get(u.id) ?? [];
                      return (
                        <tr key={u.id}>
                          <td className="mono nowrap">{u.tag || <span className="subtle">No tag</span>}</td>
                          <td className="mono">{u.serial || <span className="subtle">Not set</span>}</td>
                          <td>{u.condition || <span className="subtle">Not set</span>}</td>
                          <td><UnitStatusChip status={u.status} /></td>
                          <td>
                            {up.length ? up.slice(0, 2).map((b) => (
                              <span key={b.id} className="block"><Link className="link mono" href={`/admin/bookings/${b.id}`}>{b.ref}</Link> <span className="muted">{fmtRental(b.starts_at, b.ends_at)}</span></span>
                            )) : <span className="subtle">None</span>}
                            {up.length > 2 && <span className="sub">+{up.length - 2} more</span>}
                          </td>
                          <td className="shrink">
                            <Drawer trigger={{ label: edit ? `Edit unit ${u.tag || u.serial}` : `Unit ${u.tag || u.serial}`, icon: <Pencil aria-hidden="true" />, variant: "ghost", iconOnly: true }}
                              title={`Unit ${u.tag || u.serial || ""}`} description={item.name}>
                              <ActionForm action={saveUnit} className="grid gap-4">
                                <input type="hidden" name="unit_id" value={u.id} />
                                <UnitFields u={u} edit={edit} price={price} upcoming={up.length} />
                                {up.length > 0 && (
                                  <p className="hint">Upcoming: {up.map((b, k) => <span key={b.id}>{k > 0 && ", "}<Link className="link" href={`/admin/bookings/${b.id}`}>{b.ref}</Link> ({fmtRental(b.starts_at, b.ends_at)})</span>)}</p>
                                )}
                                {edit && <div className="actions"><Submit>Save unit</Submit></div>}
                              </ActionForm>
                            </Drawer>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
