import type { ActionResult } from "@/lib/admin/action-result";
import { defaultProtectionPct, nairaInput } from "@/lib/admin/format";
import type { ItemRow } from "@/lib/admin/types";
import { ActionForm, Submit } from "./action-form";
import { SpecsEditor } from "./specs-editor";

export type Category = { key: string; label: string; grp: string; spec_schema: { fields?: { key: string; label: string; type?: string; options?: string[] }[] } };

/** Item fields (A-31). Prices are read-only unless `canPrice`. */
export function ItemForm({ item, categories, action, canEdit, canPrice, submitLabel }: {
  item: Partial<ItemRow>; categories: Category[]; action: (p: ActionResult, f: FormData) => Promise<ActionResult>;
  canEdit: boolean; canPrice: boolean; submitLabel: string;
}) {
  const cat = categories.find((c) => c.key === item.category_key);
  const ro = !canEdit;
  return (
    <ActionForm action={action} className="grid gap-3">
      {item.id && <input type="hidden" name="item_id" value={item.id} />}
      <div className="cols-2">
        <label className="field"><span className="field-label">Name</span>
          <input className="control" name="name" defaultValue={item.name ?? ""} required readOnly={ro} /></label>
        <label className="field"><span className="field-label">Category</span>
          <select className="control" name="category_key" defaultValue={item.category_key ?? ""} required disabled={ro}>
            <option value="" disabled>Choose…</option>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select></label>
        <label className="field"><span className="field-label">Brand</span>
          <input className="control" name="brand" defaultValue={item.brand ?? ""} readOnly={ro} /></label>
        <label className="field"><span className="field-label">Model</span>
          <input className="control" name="model" defaultValue={item.model ?? ""} readOnly={ro} /></label>
      </div>
      <label className="field"><span className="field-label">Description</span>
        <textarea className="control" name="description" rows={3} defaultValue={item.description ?? ""} readOnly={ro} /></label>

      <fieldset className="grid gap-2" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">Pricing {!canPrice && <span className="opt">owner/admin only</span>}</legend>
        <div className="cols-3">
          <label className="field"><span className="field-label">Day rate (₦)</span>
            <input className="control" name="day_rate" inputMode="decimal" defaultValue={nairaInput(item.day_rate_kobo)} disabled={!canPrice} required={canPrice} /></label>
          <label className="field"><span className="field-label">Protection rate (%) <span className="opt">blank = category default</span></span>
            <input className="control" name="protection_pct" type="number" step="0.5" min={0} max={50} inputMode="decimal"
              defaultValue={item.protection_rate == null ? "" : Math.round(Number(item.protection_rate) * 1000) / 10}
              placeholder={String(defaultProtectionPct(item.category_key))} disabled={!canPrice} /></label>
          <label className="field"><span className="field-label">Replacement value (₦)</span>
            <input className="control" name="replacement_value" inputMode="decimal" defaultValue={nairaInput(item.replacement_value_kobo)} disabled={!canPrice} required={canPrice} /></label>
        </div>
        <p className="hint">Deloo Protection (damage cover) is charged on the rental: cameras 20%, lenses, lights and gimbals 15%, audio, grip and backdrops 10%. There is no deposit.</p>
        {item.id && <p className="hint">Bookings keep the price they were made at; changes apply to new bookings.</p>}
      </fieldset>

      <div className="field">
        <span className="field-label">Specs</span>
        <SpecsEditor initial={item.specs ?? {}} suggestions={cat?.spec_schema?.fields ?? []} disabled={ro} />
      </div>
      <label className="field"><span className="field-label">What’s in the box <span className="opt">one per line; used as the handover checklist</span></span>
        <textarea className="control" name="in_the_box" rows={4} defaultValue={(item.in_the_box ?? []).join("\n")} readOnly={ro}
          placeholder={"Camera body\n2 × NP-FZ100 battery\nCharger\n128 GB card"} /></label>
      {item.id && (
        <label className="switch"><input type="checkbox" name="active" defaultChecked={item.active ?? true} disabled={ro} /> Listed (renters can book it)</label>
      )}
      {canEdit && <div className="actions"><Submit>{submitLabel}</Submit></div>}
    </ActionForm>
  );
}
