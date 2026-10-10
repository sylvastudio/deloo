import type { StaffRole } from "./roles";

export type BookingStatus =
  | "hold" | "expired" | "confirmed" | "preparing" | "out_for_delivery" | "delivered"
  | "collected" | "inspected" | "closed" | "cancelled" | "disputed" | "out" | "returned";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  hold: "Awaiting payment", expired: "Hold expired", confirmed: "Confirmed", preparing: "Preparing",
  out_for_delivery: "Out for delivery", delivered: "Delivered", collected: "Collected", inspected: "Inspected",
  closed: "Closed", cancelled: "Cancelled", disputed: "Disputed", out: "Out (old)", returned: "Returned (old)",
};

/** Filter order in the bookings list. */
export const STATUS_ORDER: BookingStatus[] = [
  "hold", "confirmed", "preparing", "out_for_delivery", "delivered", "collected", "inspected", "disputed", "closed", "cancelled", "expired",
];

/** Stages that still need staff work. */
export const LIVE_STATUSES: BookingStatus[] = ["confirmed", "preparing", "out_for_delivery", "delivered", "collected", "disputed"];
/** Paid and not cancelled: counts as revenue. */
export const PAID_STATUSES: BookingStatus[] = ["confirmed", "preparing", "out_for_delivery", "delivered", "collected", "inspected", "closed", "disputed"];

/**
 * Chip tones (app/admin/admin.css .st.*). `field` (indigo) means "with the renter"; `solid` is a finished
 * record (closed) and `hollow` one that never happened (cancelled, expired). `ok` is an alias of `good`.
 */
export type Tone = "neutral" | "info" | "warn" | "good" | "ok" | "bad" | "field" | "solid" | "hollow";
export const STATUS_TONE: Record<BookingStatus, Tone> = {
  hold: "warn", expired: "hollow", confirmed: "info", preparing: "info", out_for_delivery: "field", delivered: "field",
  collected: "good", inspected: "good", closed: "solid", cancelled: "hollow", disputed: "bad", out: "neutral", returned: "neutral",
};

type Move = { to: BookingStatus; from: BookingStatus[]; roles: StaffRole[]; label: string; note?: "required" | "optional"; danger?: boolean };

/**
 * Mirrors public.staff_set_booking_status (0011, 0020): the database is the referee, this only decides
 * which buttons to show. Owner always passes. Inspecting a collected booking (OK or problem) goes through
 * the Inspect return panel (staff_inspect), and cancelling through staff_cancel, which queues the refund.
 */
export const MOVES: Move[] = [
  { to: "preparing", from: ["confirmed"], roles: ["admin", "ops"], label: "Start preparing" },
  { to: "out_for_delivery", from: ["confirmed", "preparing"], roles: ["admin", "ops", "rider"], label: "Start trip" },
  { to: "delivered", from: ["preparing", "out_for_delivery"], roles: ["admin", "ops", "rider"], label: "Mark delivered" },
  { to: "collected", from: ["delivered"], roles: ["admin", "ops", "rider"], label: "Mark collected" },
  { to: "disputed", from: ["inspected"], roles: ["admin", "ops"], label: "Report an issue", note: "required", danger: true },
  { to: "closed", from: ["inspected", "disputed"], roles: ["admin", "finance"], label: "Close booking", note: "optional" },
  { to: "cancelled", from: ["hold", "confirmed", "preparing"], roles: ["admin", "ops"], label: "Cancel booking", note: "required", danger: true },
  { to: "cancelled", from: ["out_for_delivery", "delivered"], roles: ["admin"], label: "Cancel booking", note: "required", danger: true },
];

export function movesFor(status: BookingStatus, role: StaffRole) {
  return MOVES.filter((m) => m.from.includes(status) && (role === "owner" || m.roles.includes(role)));
}

export function canMove(status: BookingStatus, to: BookingStatus, role: StaffRole) {
  return movesFor(status, role).some((m) => m.to === to);
}

/** Who can inspect a return (staff_inspect, 0020). */
export const canInspect = (role: StaffRole) => role === "owner" || role === "admin" || role === "ops";

/**
 * Riders mark a booking collected on its last rental day or later (staff_set_booking_status, 0020);
 * ops can take gear back early. Returns the first day it's allowed ("YYYY-MM-DD", Lagos) when it's too
 * early for this role, else null.
 */
export function collectTooEarly(role: StaffRole, endsAt: string, now = new Date()): string | null {
  if (role !== "rider") return null;
  const lastDayStart = new Date(endsAt).getTime() - 86_400_000;
  if (now.getTime() >= lastDayStart) return null;
  return new Date(lastDayStart + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Moves that need handover photos of every unit first, and which handover kind proves them. */
export const EVIDENCE_FOR: Partial<Record<BookingStatus, "dispatch" | "delivery" | "collection" | "inspection">> = {
  out_for_delivery: "dispatch",
  delivered: "delivery",
  collected: "collection",
  inspected: "inspection",
};

export const HANDOVER_KINDS = ["dispatch", "delivery", "collection", "inspection"] as const;
export type HandoverKind = (typeof HANDOVER_KINDS)[number];
export const HANDOVER_LABEL: Record<HandoverKind, string> = {
  dispatch: "Dispatch (at base)", delivery: "Delivery (at the door)", collection: "Collection", inspection: "Return inspection",
};

export const UNIT_STATUSES = ["active", "repair", "quarantine", "retired", "lost"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];
export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = { active: "Active", repair: "In repair", quarantine: "Quarantine", retired: "Retired", lost: "Lost" };
export const UNIT_STATUS_TONE: Record<UnitStatus, Tone> = { active: "good", repair: "warn", quarantine: "warn", retired: "hollow", lost: "bad" };

export const PAYMENT_STATUSES = ["initialized", "success", "failed", "abandoned", "mismatch"] as const;
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  initialized: "Started", success: "Paid", failed: "Failed", abandoned: "Abandoned", mismatch: "Amount mismatch",
};
export const PAYMENT_STATUS_TONE: Record<string, Tone> = {
  initialized: "warn", success: "good", failed: "bad", abandoned: "hollow", mismatch: "bad",
};
export const PAYMENT_PURPOSE_LABEL: Record<string, string> = {
  booking: "Booking", extension: "Extension", late_fee: "Late fee", claim: "Damage claim", offline: "Paid offline",
};
export const PAYMENT_CHANNEL_LABEL: Record<string, string> = {
  card: "Card", bank: "Bank", bank_transfer: "Bank transfer", ussd: "USSD", qr: "QR", mobile_money: "Mobile money", apple_pay: "Apple Pay",
};
/** A payment flag in words: "duplicate" → "Duplicate", "amount_1500000" → "Paid ₦15,000" (amount in kobo). */
export function paymentFlagLabel(flag: string, naira: (kobo: number) => string): string {
  if (flag.startsWith("amount_")) return `Paid ${naira(Number(flag.slice(7)) || 0)}`;
  if (flag === "duplicate") return "Duplicate";
  return humanize(flag);
}
export const REFUND_STATUSES = ["queued", "processing", "success", "failed"] as const;
export const REFUND_STATUS_LABEL: Record<string, string> = { queued: "Queued", processing: "Processing", success: "Refunded", failed: "Failed" };
export const REFUND_STATUS_TONE: Record<string, Tone> = { queued: "warn", processing: "info", success: "good", failed: "bad" };
export const REFUND_METHODS = ["manual", "transfer", "paystack_refund"] as const;
export const REFUND_METHOD_LABEL: Record<string, string> = { manual: "Manual", transfer: "Bank transfer", paystack_refund: "Paystack refund" };

/** Last resort for a value with no label: "out_for_delivery" → "Out for delivery". Never shows a raw enum. */
export function humanize(v: string | null | undefined): string {
  const s = String(v ?? "").replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "—";
}
export const REFUND_PURPOSE_LABEL: Record<string, string> = {
  deposit: "Deposit release", cancellation: "Cancellation", duplicate: "Duplicate payment", gear_gone: "Paid after hold (gear gone)",
  claim_balance: "Claim balance", goodwill: "Goodwill",
};
