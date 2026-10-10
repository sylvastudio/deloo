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

export type Tone = "neutral" | "info" | "warn" | "good" | "bad";
export const STATUS_TONE: Record<BookingStatus, Tone> = {
  hold: "warn", expired: "neutral", confirmed: "info", preparing: "info", out_for_delivery: "info", delivered: "good",
  collected: "info", inspected: "good", closed: "neutral", cancelled: "neutral", disputed: "bad", out: "neutral", returned: "neutral",
};

type Move = { to: BookingStatus; from: BookingStatus[]; roles: StaffRole[]; label: string; note?: "required" | "optional"; danger?: boolean };

/**
 * Mirrors public.staff_set_booking_status (0011): the database is the referee, this only decides which
 * buttons to show. Owner always passes.
 */
export const MOVES: Move[] = [
  { to: "preparing", from: ["confirmed"], roles: ["admin", "ops"], label: "Start preparing" },
  { to: "out_for_delivery", from: ["confirmed", "preparing"], roles: ["admin", "ops", "rider"], label: "Start trip" },
  { to: "delivered", from: ["preparing", "out_for_delivery"], roles: ["admin", "ops", "rider"], label: "Mark delivered" },
  { to: "collected", from: ["delivered"], roles: ["admin", "ops", "rider"], label: "Mark collected" },
  { to: "inspected", from: ["collected"], roles: ["admin", "ops"], label: "Inspected: all OK" },
  { to: "disputed", from: ["collected", "inspected"], roles: ["admin", "ops"], label: "Inspection issue", note: "required", danger: true },
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

/** Moves that need handover photos of every unit first, and which handover kind proves them. */
export const EVIDENCE_FOR: Partial<Record<BookingStatus, "dispatch" | "delivery" | "collection" | "inspection">> = {
  out_for_delivery: "dispatch",
  delivered: "delivery",
  collected: "collection",
};

export const HANDOVER_KINDS = ["dispatch", "delivery", "collection", "inspection"] as const;
export type HandoverKind = (typeof HANDOVER_KINDS)[number];
export const HANDOVER_LABEL: Record<HandoverKind, string> = {
  dispatch: "Dispatch (at base)", delivery: "Delivery (at the door)", collection: "Collection", inspection: "Return inspection",
};

export const UNIT_STATUSES = ["active", "repair", "quarantine", "retired", "lost"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const PAYMENT_STATUSES = ["initialized", "success", "failed", "abandoned", "mismatch"] as const;
export const REFUND_STATUSES = ["queued", "processing", "success", "failed"] as const;
export const REFUND_METHODS = ["manual", "transfer", "paystack_refund"] as const;
export const REFUND_PURPOSE_LABEL: Record<string, string> = {
  deposit: "Deposit release", cancellation: "Cancellation", duplicate: "Duplicate payment", gear_gone: "Paid after hold (gear gone)",
  claim_balance: "Claim balance", goodwill: "Goodwill",
};
