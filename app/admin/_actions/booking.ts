"use server";
import type { ActionResult } from "@/lib/admin/action-result";
import { evidenceCoverage, friendlyError, riderOwns } from "@/lib/admin/data";
import { koboFromNaira, naira } from "@/lib/admin/format";
import { act, bool, isUuid, str } from "@/lib/admin/guard";
import { can } from "@/lib/admin/roles";
import { canMove, EVIDENCE_FOR, HANDOVER_KINDS, STATUS_LABEL, type BookingStatus, type HandoverKind } from "@/lib/admin/status";
import { createClient } from "@/lib/supabase/server";

/** Move a booking to its next status via staff_set_booking_status (role-checked in the database too). */
export async function setBookingStatus(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("bookings.move", async (staff) => {
    const id = str(form, "booking_id");
    const to = str(form, "to") as BookingStatus;
    const note = str(form, "note").slice(0, 500);
    if (!isUuid(id)) return { error: "Unknown booking." };
    const db = await createClient();
    const { data: b, error } = await db.from("bookings").select("id, status, rider_name, rider_phone").eq("id", id).maybeSingle();
    if (error || !b) return { error: friendlyError(error) || "Booking not found." };
    if (!riderOwns(staff, b)) return { error: "This job isn’t assigned to you." };
    if (!canMove(b.status as BookingStatus, to, staff.role)) return { error: `Can’t move from ${STATUS_LABEL[b.status as BookingStatus]} to ${STATUS_LABEL[to] ?? to} with your role.` };
    if ((to === "cancelled" || to === "disputed") && note.length < 3) return { error: "Add a short note saying why." };

    // Hand-offs need a staff handover with a photo of every unit (riders always; others can override).
    const kind = EVIDENCE_FOR[to];
    if (kind) {
      const cov = await evidenceCoverage(db, id, kind);
      const override = staff.role !== "rider" && bool(form, "override");
      if (!cov.complete && !override) {
        return { error: cov.units.length === 0
          ? "This booking has no units assigned yet."
          : `First add a ${kind} handover with at least one photo of each unit (${cov.missing.length} of ${cov.units.length} still missing).` };
      }
    }

    // Cancelling: work out the refund before the status changes (the policy depends on timing).
    let refund = 0;
    if (to === "cancelled") {
      const { data: q } = await db.rpc("quote_cancellation", { p_booking: id });
      refund = Number((q as { refund_kobo?: number } | null)?.refund_kobo ?? 0);
      const typed = koboFromNaira(form.get("refund"));
      if (typed != null && can(staff.role, "refunds.process")) refund = typed;
    }

    const { error: moveErr } = await db.rpc("staff_set_booking_status", { p_booking: id, p_status: to, p_note: note });
    if (moveErr) return { error: friendlyError(moveErr) };

    if (to === "cancelled" && refund > 0) {
      if (can(staff.role, "refunds.process")) {
        const { error: rErr } = await db.from("refunds").insert({ booking_id: id, purpose: "cancellation", amount_kobo: refund, reason: `Cancelled by staff: ${note}`.slice(0, 500) });
        if (rErr) return { error: `Cancelled, but the refund couldn’t be queued: ${friendlyError(rErr)}` };
        return { ok: `Cancelled. Refund of ${naira(refund)} queued for Finance.` };
      }
      await db.from("booking_notes").insert({ booking_id: id, body: `Refund due after cancellation: ${naira(refund)}. Finance to queue it.` });
      return { ok: `Cancelled. Finance needs to queue a refund of ${naira(refund)} (noted on the booking).` };
    }
    return { ok: `Moved to ${STATUS_LABEL[to]}.` };
  });
}

/** Address, zone, slots, contact and rider (A-11 Delivery). */
export async function updateDelivery(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("bookings.edit", async () => {
    const id = str(form, "booking_id");
    if (!isUuid(id)) return { error: "Unknown booking." };
    const zone = str(form, "delivery_zone_id");
    const patch: Record<string, unknown> = {
      address: str(form, "address").slice(0, 500),
      contact_phone: str(form, "contact_phone").slice(0, 30),
      delivery_slot: str(form, "delivery_slot").slice(0, 60),
      collection_slot: str(form, "collection_slot").slice(0, 60),
      rider_name: str(form, "rider_name").slice(0, 80),
      rider_phone: str(form, "rider_phone").slice(0, 30),
    };
    if (form.has("delivery_zone_id")) patch.delivery_zone_id = isUuid(zone) ? zone : null;
    // A rider picked from the staff list overrides the typed name and phone.
    const pick = str(form, "rider_pick");
    if (pick.includes("|")) {
      const [name, phone] = pick.split("|");
      patch.rider_name = name.slice(0, 80);
      patch.rider_phone = phone.slice(0, 30);
    }
    const db = await createClient();
    const { error } = await db.from("bookings").update(patch).eq("id", id);
    return error ? { error: friendlyError(error) } : { ok: "Delivery details saved." };
  });
}

export async function swapUnit(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("units.swap", async () => {
    const line = str(form, "booking_item_id");
    const unit = str(form, "unit_id");
    if (!isUuid(line) || !isUuid(unit)) return { error: "Pick a unit." };
    const db = await createClient();
    const { error } = await db.rpc("staff_swap_unit", { p_booking_item: line, p_unit: unit });
    return error ? { error: friendlyError(error) } : { ok: "Unit swapped." };
  });
}

export async function addNote(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("notes.write", async (staff) => {
    const id = str(form, "booking_id");
    const body = str(form, "body").slice(0, 2000);
    if (!isUuid(id)) return { error: "Unknown booking." };
    if (!body) return { error: "Write a note first." };
    const db = await createClient();
    if (staff.role === "rider") {
      const { data: b } = await db.from("bookings").select("rider_name, rider_phone").eq("id", id).maybeSingle();
      if (!b || !riderOwns(staff, b)) return { error: "This job isn’t assigned to you." };
    }
    const { error } = await db.from("booking_notes").insert({ booking_id: id, body });
    return error ? { error: friendlyError(error) } : { ok: "Note added." };
  });
}

// ---------------------------------------------------------------------------
// Handover evidence. The browser uploads files straight to the private bucket (so large videos never
// pass through a server action), between these two calls.
// ---------------------------------------------------------------------------

export async function createHandover(input: { bookingId: string; kind: HandoverKind; result: "ok" | "issue"; note: string }): Promise<{ id?: string; error?: string }> {
  const r = await act("handover.capture", async (staff) => {
    if (!isUuid(input.bookingId)) return { error: "Unknown booking." };
    if (!HANDOVER_KINDS.includes(input.kind)) return { error: "Choose the kind of handover." };
    const result = input.result === "issue" ? "issue" : "ok";
    const note = String(input.note ?? "").trim().slice(0, 2000);
    if (result === "issue" && note.length < 3) return { error: "Describe the problem in the note." };
    const db = await createClient();
    const { data: b } = await db.from("bookings").select("rider_name, rider_phone").eq("id", input.bookingId).maybeSingle();
    if (!b) return { error: "Booking not found." };
    if (!riderOwns(staff, b)) return { error: "This job isn’t assigned to you." };
    const { data, error } = await db.from("handovers")
      .insert({ booking_id: input.bookingId, kind: input.kind, party: "staff", result, problem_note: note, device_completed_at: new Date().toISOString() })
      .select("id").single();
    if (error || !data) return { error: friendlyError(error) };
    return { id: data.id as string, ok: "Handover started." };
  });
  return { id: r?.id, error: r?.error };
}

type MediaInput = {
  unit_id: string | null; shot: string; media_type: "photo" | "video"; storage_path: string;
  sha256: string; bytes: number; width?: number | null; height?: number | null; captured_at?: string | null;
};
const SHOTS = ["overview", "serial", "accessories", "damage", "video_test", "other"];

export async function addHandoverMedia(input: { bookingId: string; handoverId: string; files: MediaInput[] }): Promise<{ error?: string; ok?: string }> {
  const r = await act("handover.capture", async () => {
    if (!isUuid(input.bookingId) || !isUuid(input.handoverId)) return { error: "Unknown handover." };
    const prefix = `${input.bookingId}/${input.handoverId}/`;
    const rows = (input.files ?? []).slice(0, 60).map((f) => ({
      handover_id: input.handoverId,
      booking_id: input.bookingId,
      unit_id: f.unit_id && isUuid(f.unit_id) ? f.unit_id : null,
      shot: SHOTS.includes(f.shot) ? f.shot : "other",
      media_type: f.media_type === "video" ? "video" : "photo",
      storage_path: String(f.storage_path),
      sha256: String(f.sha256 ?? "").slice(0, 64),
      bytes: Math.max(0, Math.round(Number(f.bytes) || 0)),
      width: f.width ?? null,
      height: f.height ?? null,
      captured_at: f.captured_at ?? null,
    }));
    if (!rows.length) return { ok: "Nothing to add." };
    if (rows.some((x) => !x.storage_path.startsWith(prefix) || x.storage_path.includes(".."))) return { error: "Files must be stored under this handover." };
    const db = await createClient();
    const { data: h } = await db.from("handovers").select("id").eq("id", input.handoverId).eq("booking_id", input.bookingId).maybeSingle();
    if (!h) return { error: "Handover not found." };
    const { error } = await db.from("handover_media").insert(rows);
    return error ? { error: friendlyError(error) } : { ok: `${rows.length} file${rows.length === 1 ? "" : "s"} saved.` };
  });
  return { error: r?.error, ok: r?.ok };
}
