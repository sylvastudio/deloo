import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/org";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { removeMember } from "./actions";
import { InviteForm, UnitForm } from "./forms";

export const metadata = { title: "Members · Deloo" };

export default async function Members() {
  const m = await requireMembership();
  if (m.role !== "admin") redirect("/");
  const supabase = await createClient();
  const [{ data: units }, { data: members }] = await Promise.all([
    supabase.from("units").select("id, name, type").eq("org_id", m.org.id).order("name"),
    supabase.from("memberships").select("user_id, role, unit_id, created_at").eq("org_id", m.org.id).order("created_at"),
  ]);
  // Emails live in auth.users, which the anon API can't read. Admin-only page, rows already scoped by RLS above.
  const { data: list } = await createServiceClient().auth.admin.listUsers({ perPage: 1000 });
  const emailOf = new Map((list?.users ?? []).map((u) => [u.id, { email: u.email, pending: !u.last_sign_in_at }]));
  const unitName = new Map((units ?? []).map((u) => [u.id, u.name]));

  return (
    <div className="page">
      <h1 className="h1">Members</h1>
      <section className="card grid gap-3">
        <h2 className="h2">Branches and departments</h2>
        {units?.length ? <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{units.map((u) => <li key={u.id} className="badge">{u.name} · {u.type}</li>)}</ul> : <p className="hint">None yet.</p>}
        <UnitForm />
      </section>
      <InviteForm units={units ?? []} />
      <section className="card grid gap-2">
        <h2 className="h2">People</h2>
        <ul className="m-0 grid list-none gap-0 p-0">
          {(members ?? []).map((row) => {
            const who = emailOf.get(row.user_id);
            return (
              <li key={row.user_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 last:border-0">
                <div className="grid min-w-0">
                  <span className="truncate">{who?.email ?? row.user_id}{row.user_id === m.userId && " (you)"}</span>
                  <span className="hint">{row.role === "admin" ? "HQ admin" : `Volunteer · ${unitName.get(row.unit_id) ?? ""}`}{who?.pending ? " · invite pending" : ""}</span>
                </div>
                {row.user_id !== m.userId && (
                  <form action={removeMember}><input type="hidden" name="user_id" value={row.user_id} /><button className="btn btn-quiet btn-sm" type="submit">Remove</button></form>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
