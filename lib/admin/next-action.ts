/**
 * The one thing staff should do next on a booking, worked out from its status, rider and unit
 * assignment, handover photo coverage, the time in Lagos, open refunds and payment problems.
 * Pure (no database, no "server-only"): the Today inbox, the dispatch board and the booking page all
 * call it, and lib/admin/__tests__/next-action.test.ts covers the main cases. Safe on the client.
 */
import { daysBetween, fmtTime, fmtWeekday, lagosDay, naira, rentalDays } from "./format";
import type { StaffRole } from "./roles";
import type { BookingStatus, HandoverKind } from "./status";

export type Severity = "info" | "warn" | "bad";

export type NextAction = {
  /** Short imperative, e.g. "Assign rider (delivers tomorrow 8–11am)". */
  label: string;
  /** Who should act. */
  role: StaffRole;
  /** When it's due (ISO instant), if there is a deadline. */
  due?: string;
  severity: Severity;
  /** Where on the booking page it's done ("#delivery", "#inspect", …); "" when there's nothing to do. */
  anchor: string;
  /** The status move that does it, when the action is a move. */
  move?: BookingStatus;
  /** Money items sort first for finance. */
  money?: boolean;
};

export type NextActionBooking = {
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  hold_expires_at: string | null;
  delivery: string;
  delivery_slot: string;
  collection_slot: string;
  rider_name: string;
  needs_refund?: boolean;
  total_kobo?: number;
  deposit_kobo?: number;
};

export type NextActionCtx = {
  now?: Date;
  /** Rental lines on the booking, and how many have a unit. */
  units?: { total: number; assigned: number };
  /** Staff photo coverage per handover kind: units with at least one photo, out of all units. */
  coverage?: Partial<Record<HandoverKind, { covered: number; total: number }>>;
  /** Refunds on the booking. */
  refunds?: { status: string; amount_kobo: number; purpose: string; created_at: string }[];
  /** A payment marked mismatch or duplicate. */
  paymentMismatch?: boolean;
  /** The renter marked a problem in their delivery handover. */
  renterProblem?: boolean;
  /** When the gear came back (collection handover or audit); falls back to the end of the rental. */
  collectedAt?: string | null;
};

const DAY_MS = 86_400_000;

/** "8–11am" → { start: 8, end: 11 }; "12–3pm" → 12–15; "4–7pm" → 16–19. Null when it isn't a time window. */
export function parseSlot(slot: string | null | undefined): { start: number; end: number } | null {
  const m = (slot ?? "").toLowerCase().match(/(\d{1,2})(?::\d\d)?\s*(am|pm)?\s*[–—-]\s*(\d{1,2})(?::\d\d)?\s*(am|pm)/);
  if (!m) return null;
  const h = (n: number, mer: string) => (n % 12) + (mer === "pm" ? 12 : 0);
  const end = h(Number(m[3]), m[4]);
  const s = Number(m[1]);
  let start: number;
  if (m[2]) start = h(s, m[2]);
  else if (s === 12) start = 12;
  else start = m[4] === "pm" && s <= Number(m[3]) % 12 ? s + 12 : s;
  return { start, end: end <= start ? end + 12 : end };
}

/** Sort key for a slot: its start hour, unknown slots last. */
export const slotOrder = (slot: string | null | undefined) => parseSlot(slot)?.start ?? 99;

/** "morning" / "afternoon" / "evening" for a slot, else the slot text. */
export function slotWord(slot: string | null | undefined): string {
  const p = parseSlot(slot);
  if (!p) return slot ?? "";
  return p.start < 12 ? "morning" : p.start < 16 ? "afternoon" : "evening";
}

/** "today" / "tomorrow" / "yesterday" / "Mon 12 Oct". */
export function relDay(day: string, today: string): string {
  const d = daysBetween(today, day);
  return d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : fmtWeekday(day);
}

const when = (day: string, today: string, slot: string) => `${relDay(day, today)}${slot ? ` ${slot}` : ""}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** Severity for something due on `day`: overdue or today is bad, tomorrow warns, later is info. */
const urgency = (day: string, today: string): Severity => {
  const d = daysBetween(today, day);
  return d <= 0 ? "bad" : d === 1 ? "warn" : "info";
};
/** The instant a slot ends on a day (Lagos is UTC+1), or the end of that day. */
function slotEnd(day: string, slot: string): string {
  const p = parseSlot(slot);
  const base = Date.parse(`${day}T00:00:00Z`) - 3_600_000;
  return new Date(base + (p ? p.end : 24) * 3_600_000).toISOString();
}

function refundAction(ctx: NextActionCtx, now: Date): NextAction | null {
  const refunds = ctx.refunds ?? [];
  const failed = refunds.filter((r) => r.status === "failed");
  if (failed.length) {
    const sum = failed.reduce((s, r) => s + Number(r.amount_kobo), 0);
    return { label: `Refund failed ${naira(sum)}: retry`, role: "finance", severity: "bad", anchor: "#money", money: true };
  }
  const open = refunds.filter((r) => r.status === "queued" || r.status === "processing");
  if (open.length) {
    const sum = open.reduce((s, r) => s + Number(r.amount_kobo), 0);
    const oldest = Math.min(...open.map((r) => Date.parse(r.created_at)));
    const age = now.getTime() - oldest;
    return {
      label: `Pay refund ${naira(sum)}${age > DAY_MS ? ` (queued ${Math.floor(age / DAY_MS)}d)` : ""}`,
      role: "finance", severity: age > DAY_MS ? "bad" : "warn", anchor: "#money", money: true,
      due: new Date(oldest + DAY_MS).toISOString(),
    };
  }
  return null;
}

export function nextAction(b: NextActionBooking, ctx: NextActionCtx = {}): NextAction {
  const now = ctx.now ?? new Date();
  const today = lagosDay(now);
  const { first, last } = rentalDays(b.starts_at, b.ends_at);
  const pickup = b.delivery === "pickup";
  const hasRider = !!b.rider_name?.trim();
  const units = ctx.units;
  const cov = (k: HandoverKind) => ctx.coverage?.[k];
  const hasRefund = (ctx.refunds ?? []).some((r) => r.status !== "failed");

  if (ctx.paymentMismatch) {
    return { label: "Payment mismatch: check with Paystack", role: "finance", severity: "bad", anchor: "#money", money: true };
  }
  if (b.needs_refund && !hasRefund && b.status !== "hold" && b.status !== "expired") {
    return { label: `Queue refund ${naira(b.total_kobo ?? 0)} (paid, can’t honour)`, role: "finance", severity: "bad", anchor: "#money", money: true };
  }

  switch (b.status) {
    case "hold": {
      if (!b.hold_expires_at) return { label: "Awaiting payment", role: "ops", severity: "info", anchor: "#renter" };
      const exp = Date.parse(b.hold_expires_at);
      if (exp <= now.getTime()) return { label: "Hold lapsed: nothing to do", role: "ops", severity: "info", anchor: "" };
      return {
        label: `Hold expires ${fmtTime(b.hold_expires_at)} — nudge renter`, role: "ops",
        severity: exp - now.getTime() <= 15 * 60_000 ? "warn" : "info", anchor: "#renter", due: b.hold_expires_at,
      };
    }
    case "expired":
    case "cancelled":
    case "closed":
      return refundAction(ctx, now) ?? { label: "Nothing to do", role: "ops", severity: "info", anchor: "" };

    case "confirmed":
    case "preparing": {
      const sev = urgency(first, today);
      const slot = b.delivery_slot;
      const due = slotEnd(first, slot);
      const dd = daysBetween(today, first);
      if (units && units.assigned < units.total) {
        return { label: units.assigned === 0 ? "Assign units" : `Assign units: ${units.assigned} of ${units.total}`, role: "ops", severity: dd <= 1 ? sev : "warn", anchor: "#gear", due };
      }
      if (!pickup && !hasRider) {
        return { label: `Assign rider (delivers ${when(first, today, slot)})`, role: "ops", severity: sev, anchor: "#delivery", due };
      }
      if (dd > 1) {
        return { label: `${pickup ? "Pickup" : "Deliver"} ${when(first, today, slot)}`, role: "ops", severity: "info", anchor: "", due };
      }
      if (dd === 1 && b.status === "confirmed") {
        return { label: `Prepare for ${when(first, today, slot)}`, role: "ops", severity: "warn", anchor: "#evidence", move: "preparing", due };
      }
      const d = cov("dispatch");
      if (d && d.covered < d.total) {
        return { label: `Dispatch photos: ${d.covered} of ${plural(d.total, "unit")}`, role: "ops", severity: sev, anchor: "#evidence", due };
      }
      if (dd === 1) return { label: `Ready: ${pickup ? "pickup" : "delivers"} ${when(first, today, slot)}`, role: "ops", severity: "info", anchor: "", due };
      if (pickup) {
        const sev2: Severity = dd < 0 ? "bad" : "warn";
        const at = dd < 0 ? `(was due ${fmtWeekday(first)})` : when(first, today, slot);
        // Pickups skip the trip: confirmed → preparing → delivered.
        return b.status === "confirmed"
          ? { label: `Prepare for pickup ${at}`, role: "ops", severity: sev2, anchor: "#evidence", move: "preparing", due }
          : { label: `Hand over at base ${at}`, role: "ops", severity: sev2, anchor: "#evidence", move: "delivered", due };
      }
      if (dd < 0) return { label: `Late: start trip (was due ${fmtWeekday(first)})`, role: "rider", severity: "bad", anchor: "#evidence", move: "out_for_delivery", due };
      return { label: `Start trip${slot ? ` (${slot})` : ""}`, role: "rider", severity: now.toISOString() > due ? "bad" : "warn", anchor: "#evidence", move: "out_for_delivery", due };
    }

    case "out_for_delivery": {
      const slot = b.delivery_slot;
      const due = slotEnd(first, slot);
      const d = cov("delivery");
      if (d && d.covered < d.total) {
        return { label: `Delivery photos: ${d.covered} of ${plural(d.total, "unit")}`, role: "rider", severity: "warn", anchor: "#evidence", due };
      }
      const late = now.toISOString() > due;
      return { label: `Deliver ${when(first, today, slot)}${late ? " (late)" : ""}`, role: "rider", severity: late ? "bad" : "info", anchor: "#evidence", move: "delivered", due };
    }

    case "delivered": {
      if (ctx.renterProblem) return { label: "Renter reported a problem: call", role: "ops", severity: "bad", anchor: "#renter" };
      const slot = b.collection_slot;
      const due = slotEnd(last, slot);
      const dd = daysBetween(today, last);
      if (dd < 0) {
        const n = -dd;
        return { label: `Overdue ${plural(n, "day")}: call renter`, role: "ops", severity: "bad", anchor: "#renter", due: b.ends_at };
      }
      if (!pickup && !hasRider && dd <= 1) {
        return { label: `Assign rider (collects ${when(last, today, slot)})`, role: "ops", severity: dd === 0 ? "bad" : "warn", anchor: "#delivery", due };
      }
      if (dd === 0) {
        return { label: pickup ? "Renter returns to base today" : `Collect today${slot ? ` ${slot}` : ""}`, role: pickup ? "ops" : "rider", severity: "warn", anchor: "#evidence", move: "collected", due };
      }
      if (dd === 1) {
        return { label: pickup ? "Renter returns to base tomorrow" : `Collect tomorrow${slot ? ` ${slotWord(slot)}` : ""}`, role: pickup ? "ops" : "rider", severity: "info", anchor: "", due };
      }
      return { label: `With renter until ${fmtWeekday(last)}`, role: "ops", severity: "info", anchor: "", due };
    }

    case "collected": {
      const at = ctx.collectedAt ?? b.ends_at;
      const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(at)) / 3_600_000));
      const ago = hours < 1 ? "just now" : hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
      return {
        label: `Inspect (collected ${ago})`, role: "ops", severity: hours >= 24 ? "bad" : "warn", anchor: "#inspect",
        due: new Date(Date.parse(at) + DAY_MS).toISOString(),
      };
    }

    case "inspected": {
      const r = refundAction(ctx, now);
      if (r) return r;
      const deposit = Number(b.deposit_kobo ?? 0);
      const depositQueued = (ctx.refunds ?? []).some((x) => x.purpose === "deposit" && x.status !== "failed");
      if (deposit > 0 && !depositQueued) {
        return { label: `Queue refund ${naira(deposit)} (deposit)`, role: "finance", severity: "warn", anchor: "#money", money: true };
      }
      return { label: "Close", role: "finance", severity: "info", anchor: "", move: "closed", money: true };
    }

    case "disputed":
      return { label: "Assess dispute", role: "admin", severity: "bad", anchor: "#compare" };

    default:
      return { label: "Nothing to do", role: "ops", severity: "info", anchor: "" };
  }
}

/** The day a booking's next trip happens: delivery day while it's going out, last day while it's out. */
export function tripDay(b: { status: BookingStatus; starts_at: string; ends_at: string }): { day: string; dir: "out" | "in" } {
  const { first, last } = rentalDays(b.starts_at, b.ends_at);
  return ["delivered", "collected", "inspected", "closed", "disputed"].includes(b.status) ? { day: last, dir: "in" } : { day: first, dir: "out" };
}

