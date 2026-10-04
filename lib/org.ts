import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "volunteer";
export type Membership = {
  userId: string;
  email: string;
  role: Role;
  org: { id: string; name: string; org_type: string | null; structure: string | null; plan: string };
  unit: { id: string; name: string } | null;
};

/** The signed-in user's membership, or null if they haven't created/joined an org yet. Cached per request. */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("memberships")
    .select("role, organisations(id, name, org_type, structure, plan), units(id, name)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data?.organisations) return null;
  const org = Array.isArray(data.organisations) ? data.organisations[0] : data.organisations;
  const unit = Array.isArray(data.units) ? data.units[0] ?? null : data.units;
  return { userId: user.id, email: user.email ?? "", role: data.role as Role, org, unit };
});

/** For pages inside the app: signed in and in an org, or sent where they need to go. */
export async function requireMembership(): Promise<Membership> {
  const m = await getMembership();
  if (!m) redirect("/onboarding");
  return m;
}
