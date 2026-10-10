import { addStaff, updateStaff } from "@/app/admin/_actions/people";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Chip, Empty, ErrorBox, PageHead, Section } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { fmtDateTime } from "@/lib/admin/format";
import { ROLE_LABEL, ROLES, type StaffRole } from "@/lib/admin/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Staff" };

type Row = { user_id: string; role: StaffRole; display_name: string; phone: string; active: boolean; created_at: string };

const ROLE_HELP: Record<StaffRole, string> = {
  owner: "Everything, including staff.",
  admin: "Everything except changing owners.",
  ops: "Bookings, dispatch, inventory (no prices), handovers.",
  rider: "Only their own jobs, on their phone.",
  finance: "Payments, refunds, closing bookings.",
  readonly: "Sees everything, changes nothing; contact details hidden.",
};

export default async function StaffPage() {
  const me = await pageStaff("staff.manage");
  const db = await createClient();
  const { data, error } = await db.from("staff_members").select("user_id, role, display_name, phone, active, created_at").order("created_at");
  const rows = (data ?? []) as Row[];

  // Emails come from auth.users (service role), after the staff.manage check above.
  const emails = new Map<string, string>();
  await Promise.all(rows.map(async (r) => {
    try {
      const { data: u } = await createServiceClient().auth.admin.getUserById(r.user_id);
      if (u.user?.email) emails.set(r.user_id, u.user.email);
    } catch {
      // leave blank
    }
  }));
  const roleOptions = (current?: StaffRole) => ROLES.filter((r) => me.role === "owner" || (r !== "owner" || current === "owner"));

  return (
    <div className="adm-page">
      <PageHead crumbs={[{ href: "/admin/settings", label: "Settings" }]} title="Staff and roles" />
      <Section title="Add staff">
        <ActionForm action={addStaff} className="grid gap-2" resetOnSuccess>
          <div className="cols-2">
            <label className="field"><span className="field-label">Email</span><input className="control" name="email" type="email" required placeholder="They must have a Deloo account" /></label>
            <label className="field"><span className="field-label">Role</span>
              <select className="control" name="role" defaultValue="ops">
                {roleOptions().map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}: {ROLE_HELP[r]}</option>)}
              </select></label>
            <label className="field"><span className="field-label">Display name</span><input className="control" name="display_name" placeholder="Tunde" /></label>
            <label className="field"><span className="field-label">Phone <span className="opt">riders: used to match their jobs</span></span><input className="control" name="phone" inputMode="tel" /></label>
          </div>
          <div className="actions"><Submit>Add staff</Submit></div>
        </ActionForm>
      </Section>

      <Section title={`Team (${rows.filter((r) => r.active).length} active)`}>
        {error ? <ErrorBox what="staff" error={error.message} /> : rows.length === 0 ? <Empty>No staff yet.</Empty> : (
          <div className="grid gap-2">
            {rows.map((r) => {
              const lockedOwner = r.role === "owner" && me.role !== "owner";
              const self = r.user_id === me.userId;
              return (
                <ActionForm key={r.user_id} action={updateStaff} className="card grid gap-2" confirm={undefined}>
                  <input type="hidden" name="user_id" value={r.user_id} />
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{r.display_name || emails.get(r.user_id) || r.user_id.slice(0, 8)}</strong>
                    <span className="muted small">{emails.get(r.user_id)}</span>
                    {!r.active && <Chip tone="neutral">Off</Chip>}
                    {self && <Chip tone="info">You</Chip>}
                    <span className="muted small" style={{ marginLeft: "auto" }}>since {fmtDateTime(r.created_at)}</span>
                  </div>
                  <div className="cols-3">
                    <label className="field"><span className="field-label">Role</span>
                      <select className="control" name="role" defaultValue={r.role} disabled={lockedOwner || self}>
                        {roleOptions(r.role).map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                      </select>
                      {(lockedOwner || self) && <input type="hidden" name="role" value={r.role} />}
                    </label>
                    <label className="field"><span className="field-label">Display name</span><input className="control" name="display_name" defaultValue={r.display_name} readOnly={lockedOwner} /></label>
                    <label className="field"><span className="field-label">Phone</span><input className="control" name="phone" defaultValue={r.phone} inputMode="tel" readOnly={lockedOwner} /></label>
                  </div>
                  <div className="actions">
                    <label className="switch"><input type="checkbox" name="active" defaultChecked={r.active} disabled={lockedOwner || self} /> Active</label>
                    {(lockedOwner || self) && r.active && <input type="hidden" name="active" value="on" />}
                    <span className="spacer" />
                    {!lockedOwner && <Submit className="btn btn-secondary btn-sm">Save</Submit>}
                  </div>
                </ActionForm>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
