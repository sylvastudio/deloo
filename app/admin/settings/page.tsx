import Link from "next/link";
import { saveSettings, saveZone } from "@/app/admin/_actions/people";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Empty, ErrorBox, PageHead, Section } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { fmtDateTime, naira } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

type Settings = { protection_rate: number; hold_minutes: number; turnaround_hours: number; pickup_address: string; support_whatsapp: string; updated_at: string };
type Zone = { id: string; name: string; areas: string[]; price_kobo: number; active: boolean; sort: number };

function ZoneForm({ z, edit }: { z?: Zone; edit: boolean }) {
  return (
    <ActionForm action={saveZone} className="grid gap-2" resetOnSuccess={!z}>
      {z && <input type="hidden" name="zone_id" value={z.id} />}
      <div className="cols-3">
        <label className="field"><span className="field-label">Name</span><input className="control" name="name" defaultValue={z?.name ?? ""} required readOnly={!edit} /></label>
        <label className="field"><span className="field-label">Price one way (₦)</span>
          <input className="control" name="price" inputMode="decimal" defaultValue={z ? String(z.price_kobo / 100) : ""} required readOnly={!edit} /></label>
        <label className="field"><span className="field-label">Sort</span><input className="control" name="sort" type="number" defaultValue={z?.sort ?? 0} readOnly={!edit} /></label>
      </div>
      <label className="field"><span className="field-label">Areas <span className="opt">comma separated</span></span>
        <input className="control" name="areas" defaultValue={(z?.areas ?? []).join(", ")} readOnly={!edit} placeholder="Ikeja, Yaba, Surulere" /></label>
      <div className="actions">
        <label className="switch"><input type="checkbox" name="active" defaultChecked={z?.active ?? true} disabled={!edit} /> Active</label>
        <span className="spacer" />
        {z && <span className="hint">Delivery + collection = {naira(z.price_kobo * 2)}</span>}
        {edit && <Submit className="btn btn-secondary btn-sm">{z ? "Save zone" : "Add zone"}</Submit>}
      </div>
    </ActionForm>
  );
}

export default async function SettingsPage() {
  const staff = await pageStaff("settings.view");
  const edit = can(staff.role, "settings.edit");
  const db = await createClient();
  const [sRes, zRes] = await Promise.all([
    db.from("app_settings").select("protection_rate, hold_minutes, turnaround_hours, pickup_address, support_whatsapp, updated_at").eq("id", 1).maybeSingle(),
    db.from("delivery_zones").select("id, name, areas, price_kobo, active, sort").order("sort"),
  ]);
  const s = sRes.data as Settings | null;
  const zones = (zRes.data ?? []) as Zone[];

  return (
    <div className="adm-page narrow">
      <PageHead title="Settings" actions={can(staff.role, "staff.manage") ? <Link className="btn btn-secondary" href="/admin/settings/staff">Staff and roles</Link> : undefined} />
      {!edit && <p className="notice">View only. Owners and admins can change settings.</p>}

      <Section title="Pricing and timing">
        {sRes.error ? <ErrorBox what="settings" error={sRes.error.message} /> : !s ? <Empty>No settings row. Run migration 0011.</Empty> : (
          <ActionForm action={saveSettings} className="grid gap-3" confirm="Save settings? They apply to new bookings straight away.">
            <div className="cols-3">
              <label className="field"><span className="field-label">Protection (% of rental)</span>
                <input className="control" name="protection_pct" type="number" step="0.1" min={0} max={50} defaultValue={Math.round(Number(s.protection_rate) * 1000) / 10} readOnly={!edit} /></label>
              <label className="field"><span className="field-label">Hold time (minutes)</span>
                <input className="control" name="hold_minutes" type="number" min={5} max={240} defaultValue={s.hold_minutes} readOnly={!edit} /></label>
              <label className="field"><span className="field-label">Turnaround (hours)</span>
                <input className="control" name="turnaround_hours" type="number" min={0} max={72} defaultValue={s.turnaround_hours} readOnly={!edit} /></label>
            </div>
            <label className="field"><span className="field-label">Pickup address</span>
              <input className="control" name="pickup_address" defaultValue={s.pickup_address} readOnly={!edit} /></label>
            <label className="field"><span className="field-label">Support WhatsApp</span>
              <input className="control" name="support_whatsapp" defaultValue={s.support_whatsapp} inputMode="tel" readOnly={!edit} placeholder="0803 000 0000" /></label>
            <p className="hint">Turnaround is the time after the last rental day that a unit stays reserved (collection, checking, charging). Changing it doesn’t move existing reservations. Last saved {fmtDateTime(s.updated_at)}.</p>
            {edit && <div className="actions"><Submit>Save settings</Submit></div>}
          </ActionForm>
        )}
      </Section>

      <Section title="Delivery zones">
        {zRes.error ? <ErrorBox what="delivery zones" error={zRes.error.message} /> : (
          <div className="grid gap-3">
            {zones.length === 0 && <Empty>No zones. Renters can only pick up until you add one.</Empty>}
            {zones.map((z) => <div key={z.id} className="card"><ZoneForm z={z} edit={edit} /></div>)}
            {edit && (
              <details className="inline">
                <summary>+ Add a zone</summary>
                <div className="card" style={{ marginTop: 8 }}><ZoneForm edit={edit} /></div>
              </details>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
