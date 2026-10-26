import { MapPin, Pencil, Plus, UserCog } from "lucide-react";
import { saveSettings, saveZone } from "@/app/admin/_actions/people";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ButtonLink, Callout, Chip, DescriptionList, Drawer, EmptyState, ErrorState, Field, PageHead, Section, Switch } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { fmtDateTime, naira } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

type Settings = { protection_rate: number; hold_minutes: number; turnaround_hours: number; pickup_address: string; support_whatsapp: string; updated_at: string };
type Zone = { id: string; name: string; areas: string[]; price_kobo: number; active: boolean; sort: number };

function ZoneForm({ z }: { z?: Zone }) {
  return (
    <ActionForm action={saveZone} className="grid gap-4" resetOnSuccess={!z}>
      {z && <input type="hidden" name="zone_id" value={z.id} />}
      <Field label="Name"><input className="control" name="name" defaultValue={z?.name ?? ""} required placeholder="Mainland" /></Field>
      <div className="cols-2">
        <Field label="Price one way" note="₦" hint="Delivery and collection are charged separately.">
          <input className="control" name="price" inputMode="decimal" defaultValue={z ? String(z.price_kobo / 100) : ""} required />
        </Field>
        <Field label="Sort" hint="Lower comes first in the app."><input className="control" name="sort" type="number" defaultValue={z?.sort ?? 0} /></Field>
      </div>
      <Field label="Areas" note="comma separated"><input className="control" name="areas" defaultValue={(z?.areas ?? []).join(", ")} placeholder="Ikeja, Yaba, Surulere" /></Field>
      <Switch name="active" defaultChecked={z?.active ?? true} label="Renters can choose this zone"
        confirmOff={z ? `Turn off ${z.name}? Renters can’t pick it for new bookings. Existing bookings keep their price.` : undefined} />
      <div className="actions"><Submit>{z ? "Save zone" : "Add zone"}</Submit></div>
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
  const flatPct = s ? Math.round(Number(s.protection_rate) * 1000) / 10 : 0;

  return (
    <div className="adm-page narrow">
      <PageHead title="Settings" meta={s ? <span>Last saved {fmtDateTime(s.updated_at)}</span> : undefined}
        actions={can(staff.role, "staff.manage") ? <ButtonLink variant="secondary" icon={UserCog} href="/admin/settings/staff">Staff and roles</ButtonLink> : undefined} />
      {!edit && <Callout tone="info">View only. Owners and admins can change settings.</Callout>}

      <Section title="Pricing and timing" description="Applies to new bookings straight away.">
        {sRes.error ? <ErrorState what="settings" error={sRes.error.message} /> : !s ? (
          <EmptyState compact title="No settings saved yet. Ask the owner to set them up." />
        ) : edit ? (
          <ActionForm action={saveSettings} className="grid gap-4" confirm="Save settings? They apply to new bookings straight away.">
            <div className="cols-2">
              <Field label="Hold time" note="minutes" hint="How long a renter has to pay before the gear is released.">
                <input className="control" name="hold_minutes" type="number" min={5} max={240} defaultValue={s.hold_minutes} />
              </Field>
              <Field label="Turnaround" note="hours" hint="Time after the last rental day a unit stays reserved for collection, checking and charging. Existing reservations don’t move.">
                <input className="control" name="turnaround_hours" type="number" min={0} max={72} defaultValue={s.turnaround_hours} />
              </Field>
            </div>
            <Field label="Pickup address"><input className="control" name="pickup_address" defaultValue={s.pickup_address} /></Field>
            <Field label="Support WhatsApp"><input className="control" name="support_whatsapp" defaultValue={s.support_whatsapp} inputMode="tel" placeholder="0803 000 0000" /></Field>
            <Field label="Flat Protection" note="%" hint="Not used any more: each item has its own Protection rate in Inventory.">
              <input className="control" name="protection_pct" type="number" step="0.1" min={0} max={50} defaultValue={flatPct} />
            </Field>
            <div className="actions"><Submit>Save settings</Submit></div>
          </ActionForm>
        ) : (
          <DescriptionList items={[
            ["Hold time", `${s.hold_minutes} minutes`],
            ["Turnaround", `${s.turnaround_hours} hours`],
            ["Pickup address", s.pickup_address],
            ["Support WhatsApp", s.support_whatsapp ? <span className="mono">{s.support_whatsapp}</span> : null],
            ["Flat Protection", `${flatPct}% (not used; set per item)`],
          ]} />
        )}
      </Section>

      <Section title="Delivery zones" description="Where we deliver and what it costs."
        actions={edit ? <Drawer trigger={{ label: "Add zone", icon: <Plus aria-hidden="true" />, variant: "secondary", size: "sm" }} title="Add a delivery zone"><ZoneForm /></Drawer> : undefined}>
        {zRes.error ? <ErrorState what="delivery zones" error={zRes.error.message} /> : zones.length === 0 ? (
          <EmptyState icon={MapPin} title="No delivery zones" action={edit ? <Drawer trigger={{ label: "Add the first zone", icon: <Plus aria-hidden="true" />, variant: "primary", size: "md" }} title="Add a delivery zone"><ZoneForm /></Drawer> : undefined}>
            Until there is one, renters can only pick up.
          </EmptyState>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Zone</th><th>Areas</th><th className="num">One way</th><th className="num">Both ways</th><th>Status</th>{edit && <th className="shrink"><span className="sr-only">Edit</span></th>}</tr></thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td className="nowrap"><b>{z.name}</b></td>
                    <td className="wrap">{z.areas.length ? z.areas.join(", ") : <span className="subtle">None listed</span>}</td>
                    <td className="num money">{naira(z.price_kobo)}</td>
                    <td className="num">{naira(z.price_kobo * 2)}</td>
                    <td><Chip tone={z.active ? "good" : "hollow"}>{z.active ? "On" : "Off"}</Chip></td>
                    {edit && (
                      <td className="shrink">
                        <Drawer trigger={{ label: `Edit ${z.name}`, icon: <Pencil aria-hidden="true" />, variant: "ghost", iconOnly: true }} title={`Edit ${z.name}`}><ZoneForm z={z} /></Drawer>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
