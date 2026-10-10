import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compose, type NotifyKind, type NotifyPayload } from "@/lib/notify/templates";
import type { MessageVars } from "@/lib/notify/staff-templates";
import { fmtRental, naira } from "./format";
import type { Tone } from "./status";

/** Emails to renters (public.notifications, 0017 + 0021), as the portal lists them. */

export const MESSAGE_STATUSES = ["queued", "sending", "sent", "failed", "cancelled", "skipped"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  queued: "Queued", sending: "Sending", sent: "Sent", failed: "Failed", cancelled: "Cancelled", skipped: "Skipped",
};
export const MESSAGE_STATUS_TONE: Record<MessageStatus, Tone> = {
  queued: "info", sending: "info", sent: "good", failed: "bad", cancelled: "neutral", skipped: "neutral",
};

export const MESSAGE_KINDS: NotifyKind[] = ["confirmed", "day_before", "return_tomorrow", "deposit_sent", "custom"];
export const MESSAGE_KIND_LABEL: Record<NotifyKind, string> = {
  confirmed: "Booking confirmed",
  day_before: "Day before",
  return_tomorrow: "Return reminder",
  deposit_sent: "Deposit sent",
  custom: "Custom",
};

/** One row of staff_notifications(). */
export type MessageRow = {
  id: string; kind: NotifyKind; channel: string; status: MessageStatus; send_after: string; sent_at: string | null; attempts: number;
  error: string; payload: NotifyPayload | null; created_at: string; created_by: string | null; cancelled_by: string | null;
  cancelled_at: string | null; retried_by: string | null; retried_at: string | null; user_id: string; email: string; full_name: string;
  booking_id: string | null; ref: string | null; booking_status: string | null; starts_at: string | null; ends_at: string | null;
  delivery: string | null; address: string | null; delivery_slot: string | null; collection_slot: string | null;
  deposit_kobo: number | null; support_whatsapp: string | null; pickup_address: string | null;
};

export type MessageFilters = {
  status?: string; kind?: string; q?: string; from?: string; to?: string; booking?: string; limit?: number;
};

const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export async function loadMessages(db: SupabaseClient, f: MessageFilters): Promise<{ rows: MessageRow[]; error: string | null }> {
  const { data, error } = await db.rpc("staff_notifications", {
    p_status: (MESSAGE_STATUSES as readonly string[]).includes(f.status ?? "") ? f.status : null,
    p_kind: (MESSAGE_KINDS as string[]).includes(f.kind ?? "") ? f.kind : null,
    p_q: f.q || null,
    p_from: day(f.from),
    p_to: day(f.to),
    p_booking: f.booking ?? null,
    p_limit: f.limit ?? 200,
  });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as MessageRow[], error: null };
}

/** Subject and plain text of a message, written exactly as the sender will (lib/notify/templates.ts). */
export function preview(r: MessageRow): { subject: string; text: string } {
  try {
    const m = compose({
      id: r.id, kind: r.kind, channel: r.channel, payload: r.payload, attempts: r.attempts, send_after: r.send_after,
      booking_id: r.booking_id, ref: r.ref, status: r.booking_status, starts_at: r.starts_at, ends_at: r.ends_at,
      delivery: r.delivery, address: r.address, delivery_slot: r.delivery_slot, collection_slot: r.collection_slot,
      deposit_kobo: r.deposit_kobo, email: r.email, full_name: r.full_name, support_whatsapp: r.support_whatsapp,
      pickup_address: r.pickup_address,
    });
    return { subject: m.subject, text: m.text };
  } catch {
    return { subject: r.payload?.subject ?? MESSAGE_KIND_LABEL[r.kind] ?? r.kind, text: "" };
  }
}

const firstName = (full: string) => (full ?? "").trim().split(/\s+/)[0] || "there";

/** Who a message goes to and the values for {first} … {total}. */
export type MessageTarget = {
  bookingId: string | null; userId: string; label: string; vars: Partial<MessageVars>;
};

/** Target for a booking: its renter, with the booking's values filled in. */
export async function bookingTarget(db: SupabaseClient, bookingId: string): Promise<MessageTarget | null> {
  const { data: b } = await db.from("bookings")
    .select("id, ref, renter_id, starts_at, ends_at, total_kobo, booking_items(item_name, kind)")
    .eq("id", bookingId).maybeSingle();
  if (!b) return null;
  const { data: p } = await db.from("profiles").select("full_name").eq("id", b.renter_id).maybeSingle();
  const items = ((b.booking_items ?? []) as { item_name: string; kind: string }[]).filter((i) => i.kind === "rental").map((i) => i.item_name);
  const name = (p?.full_name as string | undefined) ?? "";
  return {
    bookingId: b.id as string,
    userId: b.renter_id as string,
    label: `${b.ref ?? (b.id as string).slice(0, 8)}${name ? ` · ${name}` : ""}`,
    vars: {
      first: firstName(name),
      ref: (b.ref as string | null) ?? "",
      dates: fmtRental(b.starts_at as string, b.ends_at as string),
      items: items.join(", "),
      total: naira(Number(b.total_kobo ?? 0)),
    },
  };
}

/** Target for a renter by account id (no booking): only {first} can be filled. */
export async function renterTarget(db: SupabaseClient, userId: string, email = ""): Promise<MessageTarget> {
  const { data: p } = await db.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const name = (p?.full_name as string | undefined) ?? "";
  return { bookingId: null, userId, label: [name, email].filter(Boolean).join(" · ") || userId.slice(0, 8), vars: { first: firstName(name) } };
}
