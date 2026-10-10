"use server";
import type { ActionResult } from "@/lib/admin/action-result";
import { friendlyError } from "@/lib/admin/data";
import { act, isUuid, str } from "@/lib/admin/guard";
import { bookingTarget, renterTarget } from "@/lib/admin/messages";
import { BOOKING_PLACEHOLDERS, fillPlaceholders, leftoverPlaceholders } from "@/lib/notify/staff-templates";
import { createClient } from "@/lib/supabase/server";

const QUEUED = "Queued. It goes out within 15 minutes, or press Send now.";

/**
 * Queue a one-off email to a renter (staff_notification_send, 0021). With booking_id it goes to that
 * booking's renter; otherwise to user_id. Placeholders still in the text are filled from the booking.
 */
export async function queueMessage(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("messages.send", async () => {
    const bookingId = str(form, "booking_id");
    const userId = str(form, "user_id");
    let subject = str(form, "subject").slice(0, 150);
    let body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 5000);
    if (!isUuid(bookingId) && !isUuid(userId)) return { error: "Pick a booking or a renter first." };
    if (subject.length < 3) return { error: "Write a subject." };
    if (body.length < 3) return { error: "Write the message." };

    const db = await createClient();
    const target = isUuid(bookingId) ? await bookingTarget(db, bookingId) : await renterTarget(db, userId);
    if (!target) return { error: "Booking not found." };
    subject = fillPlaceholders(subject, target.vars);
    body = fillPlaceholders(body, target.vars);

    const left = leftoverPlaceholders(`${subject}\n${body}`);
    if (left.length) {
      const needsBooking = left.some((p) => (BOOKING_PLACEHOLDERS as readonly string[]).includes(p.slice(1, -1)));
      return { error: needsBooking && !target.bookingId
        ? `${left.join(", ")} need a booking. Pick the booking, or take them out of the text.`
        : `Fill in or remove ${left.join(", ")}.` };
    }

    const { error } = await db.rpc("staff_notification_send", {
      p_booking: target.bookingId, p_user: target.userId, p_subject: subject, p_body: body,
    });
    return error ? { error: friendlyError(error) } : { ok: QUEUED };
  });
}

/** Put a failed or cancelled message back in the queue. */
export async function retryMessage(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("messages.send", async () => {
    const id = str(form, "id");
    if (!isUuid(id)) return { error: "Unknown message." };
    const db = await createClient();
    const { error } = await db.rpc("staff_notification_retry", { p_id: id });
    return error ? { error: friendlyError(error) } : { ok: QUEUED };
  });
}

/** Stop a queued message. */
export async function cancelMessage(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("messages.send", async () => {
    const id = str(form, "id");
    if (!isUuid(id)) return { error: "Unknown message." };
    const db = await createClient();
    const { error } = await db.rpc("staff_notification_cancel", { p_id: id });
    return error ? { error: friendlyError(error) } : { ok: "Cancelled. It won’t be sent." };
  });
}

/**
 * Run the sender now instead of waiting for the 15-minute schedule: calls /api/cron/notify on this
 * site, server side, with CRON_SECRET. The address comes from the environment, never from the request,
 * so the secret only ever goes to our own site.
 */
export async function sendNow(): Promise<ActionResult> {
  return act("messages.send", async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return { error: "Sending now isn’t set up here (CRON_SECRET is missing). The scheduled run still sends within 15 minutes." };
    const base = (process.env.URL || process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://deloo.space")).replace(/\/+$/, "");
    let res: Response;
    try {
      res = await fetch(`${base}/api/cron/notify`, {
        method: "POST", headers: { "x-cron-secret": secret }, cache: "no-store", signal: AbortSignal.timeout(28_000),
      });
    } catch (e) {
      return { error: `Couldn’t reach the sender: ${e instanceof Error ? e.message : "network error"}. The scheduled run still sends within 15 minutes.` };
    }
    const out = (await res.json().catch(() => null)) as { claimed?: number; sent?: number; failed?: number; skipped?: number; error?: string } | null;
    if (!res.ok || !out) return { error: `The sender answered ${res.status}${out?.error ? `: ${out.error}` : ""}.` };
    if (!out.claimed) return { ok: "Nothing was due. Queued messages go out at their time." };
    const parts = [`Sent ${out.sent ?? 0}`];
    if (out.failed) parts.push(`${out.failed} failed (tried again later)`);
    if (out.skipped) parts.push(`${out.skipped} skipped`);
    return { ok: `${parts.join(", ")}.` };
  });
}
