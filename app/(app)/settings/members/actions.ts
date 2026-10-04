"use server";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/org";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type FormState = { error?: string; notice?: string } | undefined;

export async function addUnit(_: FormState, form: FormData): Promise<FormState> {
  const m = await requireMembership();
  const name = String(form.get("name") ?? "").trim();
  const type = String(form.get("type") ?? "branch");
  if (!name) return { error: "Name the branch or department." };
  const supabase = await createClient();
  // RLS (units_write) refuses this unless the caller is an admin of the org.
  const { error } = await supabase.from("units").insert({ org_id: m.org.id, name, type });
  if (error) return { error: error.code === "23505" ? `${name} already exists.` : "Couldn't add it. Only HQ admins can add units." };
  revalidatePath("/settings/members");
  return { notice: `Added ${name}.` };
}

export async function inviteVolunteer(_: FormState, form: FormData): Promise<FormState> {
  const m = await requireMembership();
  if (m.role !== "admin") return { error: "Only HQ admins can invite people." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const unitId = String(form.get("unit") ?? "");
  if (!email || !email.includes("@")) return { error: "Add their email address." };
  if (!unitId) return { error: "Choose the branch or department they'll design for." };

  // Check the unit is in this org with the caller's own rights before using the service role.
  const supabase = await createClient();
  const { data: unit } = await supabase.from("units").select("id, name").eq("id", unitId).eq("org_id", m.org.id).single();
  if (!unit) return { error: "That branch or department isn't in your organisation." };

  const admin = createServiceClient();
  let userId: string | undefined;
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    data: { invited_to: m.org.name },
  });
  if (inviteErr) {
    // Already has an account: add them without a new invite email.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!userId) return { error: "Couldn't send the invite. Check the address and try again." };
  } else {
    userId = invited.user.id;
  }

  const { data: existing } = await admin.from("memberships").select("org_id").eq("user_id", userId).maybeSingle();
  if (existing && existing.org_id !== m.org.id) return { error: "That person already belongs to another organisation." };
  if (existing) return { error: "They're already a member." };

  // The membership insert runs as the admin, so RLS (memberships_write) still has the final say.
  const { error } = await supabase.from("memberships").insert({ user_id: userId, org_id: m.org.id, unit_id: unit.id, role: "volunteer" });
  if (error) return { error: "Invite sent, but adding them to the unit failed. Try again." };
  revalidatePath("/settings/members");
  return { notice: inviteErr ? `${email} already had an account and is now in ${unit.name}.` : `Invite sent to ${email} for ${unit.name}.` };
}

export async function removeMember(form: FormData) {
  const m = await requireMembership();
  const userId = String(form.get("user_id") ?? "");
  if (userId === m.userId) return;
  const supabase = await createClient();
  await supabase.from("memberships").delete().eq("org_id", m.org.id).eq("user_id", userId);
  revalidatePath("/settings/members");
}
