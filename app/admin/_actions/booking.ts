"use server";
import type { ActionResult } from "@/lib/admin/action-result";
import { evidenceCoverage, friendlyError, riderOwns } from "@/lib/admin/data";
import { fmtWeekday, koboFromNaira, naira } from "@/lib/admin/format";
import { act, bool, isUuid, str } from "@/lib/admin/guard";
import { can } from "@/lib/admin/roles";
import { canInspect, canMove, collectTooEarly, EVIDENCE_FOR, HANDOVER_KINDS, STATUS_LABEL, type BookingStatus, type HandoverKind } from "@/lib/admin/status";
import { createClient } from "@/lib/supabase/server";

/** Move a booking to its next status via staff_set_booking_status (role-checked in the database too). */
export async function setBookingStatus(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("bookings.move", async (staff) => {
    const id = str(form, "booking_id");
    const to = str(form, "to") as BookingStatus;
    const note = str(form, "note").slice(0, 500);
    if (!isUuid(id)) return { error: "Unknown booking." };
    const db = await createClient();
    const { data: b, error } = await db.from("bookings").select("id, ref, status, ends_at, rider_name, rider_phone").eq("id", id).maybeSingle();
    if (error || !b) return { error: friendlyError(error) || "Booking not found." };
    if (!riderOwns(staff, b)) return { error: "This job isn’t assigned to you." };
    if (!canMove(b.status as BookingStatus, to, staff.role)) return { error: `Can’t move from ${STATUS_LABEL[b.status as BookingStatus]} to ${STATUS_LABEL[to] ?? to} with your role.` };
    if ((to === "cancelled" || to === "disputed") && note.length < 3) return { error: "Add a short note saying why." };
    if (to === "collected") {
      const early = collectTooEarly(staff.role, b.ends_at as string);
      if (early) return { error: `Collection opens on the last rental day (${fmtWeekday(early)}). Ask ops if the renter wants to return early.` };
    }

    // Hand-offs need a staff handover with a photo of every unit (riders always; others can override with a note).
    const kind = EVIDENCE_FOR[to];
    let overrideNote = "";
    if (kind) {
      const cov = await evidenceCoverage(db, id, kind);
      const override = staff.role !== "rider" && bool(form, "override");
      if (!cov.complete && !override) {
        return { error: cov.units.length === 0
          ? "This booking has no units assigned yet."
          : `First add a ${kind} handover with at least one photo of each unit (${cov.missing.length} of ${cov.units.length} still missing).` };
      }
      if (!cov.complete) {
        overrideNote = str(form, "override_note").slice(0, 500);
        if (overrideNote.length < 3) return { error: "Say why you’re continuing without the photos." };
      }
    }

    if (to === "cancelled") {
      // staff_cancel (0020) cancels and queues the refund in one go. Only Finance roles may change the amount.
      const typed = can(staff.role, "refunds.process") ? koboFromNaira(form.get("refund")) : null;
      const { data, error: cErr } = await db.rpc("staff_cancel", { p_booking: id, p_note: note, p_refund_kobo: typed });
      if (cErr) return { error: friendlyError(cErr) };
      const refund = Number((data as { refund_kobo?: number } | null)?.refund_kobo ?? 0);
      return { ok: refund > 0 ? `Cancelled. Refund of ${naira(refund)} queued for Finance.` : "Cancelled. No refund due." };
    }

    const { error: moveErr } = await db.rpc("staff_set_booking_status", { p_booking: id, p_status: to, p_note: note });
    if (moveErr) return { error: friendlyError(moveErr) };
    if (overrideNote) {
      await db.from("booking_notes").insert({ booking_id: id, body: `Moved to ${STATUS_LABEL[to]} without ${kind} photos of every unit: ${overrideNote}` });
    }
    return { ok: `Moved to ${STATUS_LABEL[to]}.` };
  });
}

/**
 * Return inspection (A-42) through staff_inspect (0020): one result per unit, Problem units go to
 * quarantine, any problem makes the booking disputed, and all OK closes it when there's no deposit or
 * open refund left. Form: unit ids in "unit", and per unit "result_<id>" (ok | problem) and "note_<id>".
 */
export async function inspectReturn(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("bookings.move", async (staff) => {
    const id = str(form, "booking_id");
    if (!isUuid(id)) return { error: "Unknown booking." };
    if (!canInspect(staff.role)) return { error: "Only ops, admin or the owner can inspect returns." };
    const unitIds = form.getAll("unit").map(String).filter(isUuid);
    if (!unitIds.length) return { error: "No units to inspect." };
    const results: { unit_id: string; ok: boolean; note: string }[] = [];
    for (const u of unitIds) {
      const r = str(form, `result_${u}`);
      const note = str(form, `note_${u}`).slice(0, 500);
      if (r !== "ok" && r !== "problem") return { error: "Mark every unit OK or Problem." };
      if (r === "problem" && note.length < 3) return { error: "Describe the problem on each unit marked Problem." };
      results.push({ unit_id: u, ok: r === "ok", note });
    }
    const overrideNote = staff.role === "owner" && bool(form, "override") ? str(form, "override_note").slice(0, 500) : "";
    const db = await createClient();
    const { data, error } = await db.rpc("staff_inspect", { p_booking: id, p_results: results, p_override_note: overrideNote });
    if (error) return { error: friendlyError(error) };
    const out = data as { status?: string; problems?: number } | null;
    if (out?.status === "disputed") {
      const n = out.problems ?? 0;
      return { ok: `Inspected: ${n} unit${n === 1 ? "" : "s"} quarantined and the booking is disputed. Add the claim details in Notes.` };
    }
    return { ok: out?.status === "closed" ? "Inspected: all OK. No deposit to return, so the booking is closed." : "Inspected: all OK. Finance closes it once the deposit or open refund is settled." };
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

/**
 * Start a handover. The browser makes the id, so a retry after a lost response finds the same row
 * instead of making a second one (insert … on conflict do nothing).
 */
export async function createHandover(input: { id: string; bookingId: string; kind: HandoverKind; result: "ok" | "issue"; note: string }): Promise<{ id?: string; error?: string }> {
  const r = await act("handover.capture", async (staff) => {
    if (!isUuid(input.bookingId) || !isUuid(input.id)) return { error: "Unknown booking." };
    if (!HANDOVER_KINDS.includes(input.kind)) return { error: "Choose the kind of handover." };
    const result = input.result === "issue" ? "issue" : "ok";
    const note = String(input.note ?? "").trim().slice(0, 2000);
    if (result === "issue" && note.length < 3) return { error: "Describe the problem in the note." };
    const db = await createClient();
    const { data: b } = await db.from("bookings").select("rider_name, rider_phone").eq("id", input.bookingId).maybeSingle();
    if (!b) return { error: "Booking not found." };
    if (!riderOwns(staff, b)) return { error: "This job isn’t assigned to you." };
    const { error } = await db.from("handovers").upsert(
      { id: input.id, booking_id: input.bookingId, kind: input.kind, party: "staff", result, problem_note: note, device_completed_at: new Date().toISOString() },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) return { error: friendlyError(error) };
    const { data } = await db.from("handovers").select("id, booking_id").eq("id", input.id).maybeSingle();
    if (!data || data.booking_id !== input.bookingId) return { error: "Couldn’t start the handover. Reload the page and try again." };
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
