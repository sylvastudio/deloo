"use server";
import type { ActionResult } from "@/lib/admin/action-result";
import { friendlyError } from "@/lib/admin/data";
import { act, isUuid, str } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

/**
 * Set (or clear) the rider on one or many bookings from the dispatch board. Same fields and permission
 * as updateDelivery (bookings.edit); the rider is looked up from staff_members rather than trusted from
 * the form. Form: one or more "booking_id", and "rider" = a rider's user id, or "none" to clear.
 */
export async function assignRider(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("bookings.edit", async () => {
    const ids = [...new Set(form.getAll("booking_id").map(String).filter(isUuid))].slice(0, 100);
    if (!ids.length) return { error: "Tick at least one booking." };
    const pick = str(form, "rider");
    const db = await createClient();
    let patch = { rider_name: "", rider_phone: "" };
    if (pick !== "none") {
      if (!isUuid(pick)) return { error: "Choose a rider." };
      const { data: r, error } = await db.from("staff_members").select("display_name, phone, role, active").eq("user_id", pick).maybeSingle();
      if (error) return { error: friendlyError(error) };
      if (!r || r.role !== "rider" || !r.active) return { error: "That rider isn’t active any more. Reload the page." };
      patch = { rider_name: String(r.display_name ?? "").slice(0, 80), rider_phone: String(r.phone ?? "").slice(0, 30) };
    }
    const { data, error } = await db.from("bookings").update(patch).in("id", ids)
      .not("status", "in", "(expired,cancelled,closed)").select("id");
    if (error) return { error: friendlyError(error) };
    const n = data?.length ?? 0;
    if (!n) return { error: "Nothing changed: those bookings are closed or cancelled." };
    const who = pick === "none" ? "Rider cleared" : `${patch.rider_name} assigned`;
    return { ok: n === 1 ? `${who}.` : `${who} on ${n} bookings.` };
  });
}
