"use server";
import type { ActionResult } from "@/lib/admin/action-result";
import { friendlyError } from "@/lib/admin/data";
import { act, bool, isUuid, str } from "@/lib/admin/guard";
import { ROLES, type StaffRole } from "@/lib/admin/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Block or unblock a renter (profiles.blocked). Renters can't write that column and RLS gives staff no
 * update on profiles, so this uses the service role, only after the owner/admin check in act(), and
 * writes the reason to audit_log.
 */
export async function setBlocked(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("customers.block", async (staff) => {
    const id = str(form, "profile_id");
    const blocked = str(form, "blocked") === "true";
    const reason = str(form, "reason").slice(0, 500);
    if (!isUuid(id)) return { error: "Unknown customer." };
    if (reason.length < 3) return { error: "Add a reason (it goes in the audit log)." };
    if (id === staff.userId) return { error: "You can’t block yourself." };
    const admin = createServiceClient();
    const { data: before } = await admin.from("profiles").select("blocked").eq("id", id).maybeSingle();
    if (!before) return { error: "Customer not found." };
    const { error } = await admin.from("profiles").update({ blocked }).eq("id", id);
    if (error) return { error: friendlyError(error) };
    await admin.from("audit_log").insert({
      actor_id: staff.userId, action: blocked ? "block" : "unblock", entity: "profiles", entity_id: id,
      before: { blocked: before.blocked }, after: { blocked, reason },
    });
    return { ok: blocked ? "Blocked: they can’t place new bookings." : "Unblocked." };
  });
}

// ---------------------------------------------------------------------------
// Settings (admin): app_settings and delivery_zones, written with the user's session (RLS: admin)
// ---------------------------------------------------------------------------
export async function saveSettings(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("settings.edit", async () => {
    const rate = Number(str(form, "protection_pct")) / 100;
    const hold = Math.round(Number(str(form, "hold_minutes")));
    const turnaround = Math.round(Number(str(form, "turnaround_hours")));
    if (!Number.isFinite(rate) || rate < 0 || rate > 0.5) return { error: "Protection must be between 0% and 50%." };
    if (!Number.isFinite(hold) || hold < 5 || hold > 240) return { error: "Hold time must be 5–240 minutes." };
    if (!Number.isFinite(turnaround) || turnaround < 0 || turnaround > 72) return { error: "Turnaround must be 0–72 hours." };
    const db = await createClient();
    const { error, count } = await db.from("app_settings").update({
      protection_rate: Math.round(rate * 10000) / 10000, hold_minutes: hold, turnaround_hours: turnaround,
      pickup_address: str(form, "pickup_address").slice(0, 300), support_whatsapp: str(form, "support_whatsapp").slice(0, 30),
      updated_at: new Date().toISOString(),
    }, { count: "exact" }).eq("id", 1);
    if (error) return { error: friendlyError(error) };
    return count ? { ok: "Settings saved. New bookings use them; existing bookings keep theirs." } : { error: "Your role can’t change settings." };
  });
}

export async function saveZone(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("settings.edit", async () => {
    const id = str(form, "zone_id");
    const name = str(form, "name").slice(0, 60);
    const price = Number(str(form, "price").replace(/[₦,\s]/g, ""));
    if (!name) return { error: "Name the zone." };
    if (!Number.isFinite(price) || price < 0) return { error: "Price must be a number of naira." };
    const row = {
      name,
      areas: str(form, "areas").split(",").map((a) => a.trim()).filter(Boolean).slice(0, 60),
      price_kobo: Math.round(price * 100),
      active: bool(form, "active"),
      sort: Math.round(Number(str(form, "sort")) || 0),
    };
    const db = await createClient();
    const { error } = isUuid(id) ? await db.from("delivery_zones").update(row).eq("id", id) : await db.from("delivery_zones").insert(row);
    return error ? { error: friendlyError(error) } : { ok: isUuid(id) ? "Zone saved." : "Zone added." };
  });
}

// ---------------------------------------------------------------------------
// Staff (owner/admin). Rows are written with the user's session (RLS staff_write: admin); the service
// role is only used to find an auth user by email.
// ---------------------------------------------------------------------------
async function findUserByEmail(email: string): Promise<string | null> {
  const admin = createServiceClient();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function addStaff(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("staff.manage", async (staff) => {
    const email = str(form, "email").toLowerCase();
    const role = str(form, "role") as StaffRole;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter their email address." };
    if (!ROLES.includes(role)) return { error: "Choose a role." };
    if (role === "owner" && staff.role !== "owner") return { error: "Only an owner can add another owner." };
    const userId = await findUserByEmail(email);
    if (!userId) return { error: "No Deloo account uses that email. Ask them to sign up first (deloo.space/signup), then add them." };
    const db = await createClient();
    const { error } = await db.from("staff_members").upsert({
      user_id: userId, role, active: true,
      display_name: str(form, "display_name").slice(0, 80), phone: str(form, "phone").slice(0, 30),
    }, { onConflict: "user_id" });
    return error ? { error: friendlyError(error) } : { ok: `${email} added as ${role}.` };
  });
}

export async function updateStaff(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("staff.manage", async (staff) => {
    const id = str(form, "user_id");
    const role = str(form, "role") as StaffRole;
    const active = bool(form, "active");
    if (!isUuid(id)) return { error: "Unknown staff member." };
    if (!ROLES.includes(role)) return { error: "Choose a role." };
    const db = await createClient();
    const { data: cur } = await db.from("staff_members").select("role").eq("user_id", id).maybeSingle();
    if (!cur) return { error: "Staff member not found." };
    if ((cur.role === "owner" || role === "owner") && staff.role !== "owner") return { error: "Only an owner can change an owner." };
    if (id === staff.userId && (!active || role !== staff.role)) return { error: "You can’t change your own role or turn yourself off. Ask another owner." };
    const { error } = await db.from("staff_members").update({
      role, active, display_name: str(form, "display_name").slice(0, 80), phone: str(form, "phone").slice(0, 30),
    }).eq("user_id", id);
    return error ? { error: friendlyError(error) } : { ok: "Saved." };
  });
}
