import { Pencil, UserPlus, Users } from "lucide-react";
import { addStaff, updateStaff } from "@/app/admin/_actions/people";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Callout, Chip, Drawer, EmptyState, ErrorState, Field, PageHead, Section, Switch } from "@/components/admin/ui";
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
  const active = rows.filter((r) => r.active).length;

  return (
    <div className="adm-page">
      <PageHead crumbs={[{ href: "/admin/settings", label: "Settings" }]} title="Staff and roles"
        meta={<span>{active} active · {rows.length - active} off</span>}
        actions={
          <Drawer trigger={{ label: "Add staff", icon: UserPlus, variant: "primary", size: "md" }} title="Add staff" description="They need a Deloo account first (sign up in the app with that email).">
            <ActionForm action={addStaff} className="grid gap-4" resetOnSuccess>
              <Field label="Email"><input className="control" name="email" type="email" required autoComplete="off" /></Field>
              <Field label="Role">
                <select className="control" name="role" defaultValue="ops">
                  {roleOptions().map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}: {ROLE_HELP[r]}</option>)}
                </select>
              </Field>
              <Field label="Display name" note="optional"><input className="control" name="display_name" placeholder="Tunde" /></Field>
              <Field label="Phone" note="riders: matches their jobs"><input className="control" name="phone" inputMode="tel" /></Field>
              <div className="actions"><Submit icon={UserPlus}>Add staff</Submit></div>
            </ActionForm>
          </Drawer>
        } />

      <Section title="Roles" description="What each role can do.">
        <dl className="dl">
          {ROLES.map((r) => <div key={r} className="contents"><dt>{ROLE_LABEL[r]}</dt><dd>{ROLE_HELP[r]}</dd></div>)}
        </dl>
      </Section>

      <Section title="Team">
        {error ? <ErrorState what="staff" error={error.message} /> : rows.length === 0 ? <EmptyState icon={Users} title="No staff yet" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Access</th><th>Since</th><th className="shrink"><span className="sr-only">Edit</span></th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const lockedOwner = r.role === "owner" && me.role !== "owner";
                  const self = r.user_id === me.userId;
                  const name = r.display_name || emails.get(r.user_id) || r.user_id.slice(0, 8);
                  return (
                    <tr key={r.user_id} className={r.active ? undefined : "muted-row"}>
                      <td><b>{name}</b>{self && <> <Chip tone="info">You</Chip></>}{emails.get(r.user_id) && <span className="sub">{emails.get(r.user_id)}</span>}</td>
                      <td>{ROLE_LABEL[r.role]}</td>
                      <td className="mono nowrap">{r.phone || <span className="subtle">No phone</span>}</td>
                      <td><Chip tone={r.active ? "good" : "hollow"}>{r.active ? "Active" : "Off"}</Chip></td>
                      <td className="nowrap">{fmtDateTime(r.created_at)}</td>
                      <td className="shrink">
                        {!lockedOwner && (
                          <Drawer trigger={{ label: `Edit ${name}`, icon: Pencil, variant: "ghost", iconOnly: true }} title={name} description={emails.get(r.user_id)}>
                            <ActionForm action={updateStaff} className="grid gap-4">
                              <input type="hidden" name="user_id" value={r.user_id} />
                              {self && <Callout tone="info">You can’t change your own role or turn yourself off. Ask another owner.</Callout>}
                              <Field label="Role">
                                <select className="control" name="role" defaultValue={r.role} disabled={self}>
                                  {roleOptions(r.role).map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                                </select>
                                {self && <input type="hidden" name="role" value={r.role} />}
                              </Field>
                              <Field label="Display name"><input className="control" name="display_name" defaultValue={r.display_name} /></Field>
                              <Field label="Phone" note="riders: matches their jobs"><input className="control" name="phone" defaultValue={r.phone} inputMode="tel" /></Field>
                              <Switch name="active" defaultChecked={r.active} disabled={self} label="Can sign in to the staff portal"
                                confirmOff={`Turn off ${name}? They lose access to the staff portal straight away.`} />
                              {self && r.active && <input type="hidden" name="active" value="on" />}
                              <div className="actions"><Submit>Save</Submit></div>
                            </ActionForm>
                          </Drawer>
                        )}
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
  );
}
