import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { can, type Capability, type StaffRole } from "./roles";

export type Staff = {
  userId: string;
  email: string;
  role: StaffRole;
  displayName: string;
  phone: string;
};

/**
 * The signed-in user (null when signed out). Cached per request. getClaims verifies the session token
 * locally (signing keys) instead of a round trip to Supabase Auth on every admin page; the database
 * still checks the same token on every query (RLS), so a forged token gets nothing.
 */
const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: String(c.sub), email: typeof c.email === "string" ? c.email : "" } : null;
});

/**
 * The signed-in user's active staff_members row, read with their own session (RLS: a user can read
 * their own row). Null when signed out or not staff. Cached per request.
 */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members").select("role, display_name, phone, active")
    .eq("user_id", user.id).maybeSingle();
  if (!data || !data.active) return null;
  return {
    userId: user.id,
    email: user.email ?? "",
    role: data.role as StaffRole,
    displayName: data.display_name || user.email || "Staff",
    phone: data.phone ?? "",
  };
});

export class AccessError extends Error {}

/** Shown on a form when the session ran out while the page was open. */
export const SIGNED_OUT = "Your session ended. Sign in again in a new tab, then come back and try again.";

/**
 * For pages and server actions: the caller must be active staff, and (optionally) hold a capability.
 * Throws AccessError otherwise. Pages are already behind app/admin/layout.tsx, but server actions are
 * reachable by direct POST, so every action calls this again.
 */
export async function requireStaff(cap?: Capability): Promise<Staff> {
  const s = await getStaff();
  if (!s) throw new AccessError((await getUser()) ? "No access." : SIGNED_OUT);
  if (cap && !can(s.role, cap)) throw new AccessError("Your role can’t do that.");
  return s;
}

/** Where a role lands: riders only have Jobs. */
export const homeFor = (role: StaffRole) => (role === "rider" ? "/admin/jobs" : "/admin");

/**
 * For Server Component pages: the staff member, or a redirect to their home when their role can't see
 * this page. (The layout has already shown "No access" to non-staff.)
 */
export async function pageStaff(cap?: Capability): Promise<Staff> {
  const s = await getStaff();
  if (!s) redirect("/admin/no-access");
  if (cap && !can(s.role, cap)) redirect(homeFor(s.role));
  return s;
}
