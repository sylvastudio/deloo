/**
 * Run: npx tsx --test lib/admin/__tests__/next-action.test.ts
 * Clock: Sat 10 Oct 2026, 10:00 Lagos (09:00Z).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, dayStart } from "../format";
import { nextAction, parseSlot, slotOrder, type NextActionBooking } from "../next-action";

const now = new Date("2026-10-10T09:00:00Z");
const today = "2026-10-10";

/** A booking whose first rental day is today + `from`, lasting `days`. */
function booking(over: Partial<NextActionBooking> & { from?: number; days?: number } = {}): NextActionBooking {
  const { from = 1, days = 2, ...rest } = over;
  const first = addDays(today, from);
  const last = addDays(first, days - 1);
  return {
    status: "confirmed", starts_at: dayStart(first), ends_at: dayStart(addDays(last, 1)), hold_expires_at: null,
    delivery: "delivery", delivery_slot: "8–11am", collection_slot: "4–7pm", rider_name: "", total_kobo: 5_000_000, deposit_kobo: 0,
    ...rest,
  };
}
const full = { units: { total: 2, assigned: 2 } };

test("parseSlot reads the app's windows", () => {
  assert.deepEqual(parseSlot("8–11am"), { start: 8, end: 11 });
  assert.deepEqual(parseSlot("12–3pm"), { start: 12, end: 15 });
  assert.deepEqual(parseSlot("4–7pm"), { start: 16, end: 19 });
  assert.deepEqual(parseSlot("10am-1pm"), { start: 10, end: 13 });
  assert.equal(parseSlot("whenever"), null);
  assert.ok(slotOrder("8–11am") < slotOrder("12–3pm") && slotOrder("12–3pm") < slotOrder(""));
});

test("unassigned units come first", () => {
  const a = nextAction(booking(), { now, units: { total: 2, assigned: 0 } });
  assert.equal(a.label, "Assign units");
  assert.equal(a.anchor, "#gear");
});

test("no rider: assign rider with the day and slot", () => {
  const a = nextAction(booking(), { now, ...full });
  assert.equal(a.label, "Assign rider (delivers tomorrow 8–11am)");
  assert.equal(a.severity, "warn");
  assert.equal(a.anchor, "#delivery");
  assert.equal(nextAction(booking({ from: 0 }), { now, ...full }).severity, "bad");
});

test("pickups don't need a rider", () => {
  const a = nextAction(booking({ delivery: "pickup", status: "preparing", from: 0 }), { now, ...full, coverage: { dispatch: { covered: 2, total: 2 } } });
  assert.match(a.label, /^Hand over at base today/);
  assert.equal(a.move, "delivered");
});

test("tomorrow, confirmed: prepare", () => {
  const a = nextAction(booking({ rider_name: "Tunde" }), { now, ...full });
  assert.equal(a.label, "Prepare for tomorrow 8–11am");
  assert.equal(a.move, "preparing");
});

test("later dates are informational", () => {
  const a = nextAction(booking({ rider_name: "Tunde", from: 3 }), { now, ...full });
  assert.equal(a.severity, "info");
  assert.equal(a.label, "Deliver Tue 13 Oct 8–11am");
});

test("dispatch photos before the trip", () => {
  const a = nextAction(booking({ rider_name: "Tunde", status: "preparing", from: 0, delivery_slot: "12–3pm" }), { now, ...full, coverage: { dispatch: { covered: 1, total: 2 } } });
  assert.equal(a.label, "Dispatch photos: 1 of 2 units");
});

test("start trip once photos are in", () => {
  const a = nextAction(booking({ rider_name: "Tunde", status: "preparing", from: 0, delivery_slot: "12–3pm" }), { now, ...full, coverage: { dispatch: { covered: 2, total: 2 } } });
  assert.equal(a.label, "Start trip (12–3pm)");
  assert.equal(a.move, "out_for_delivery");
  assert.equal(a.role, "rider");
});

test("out for delivery: deliver today", () => {
  const a = nextAction(booking({ rider_name: "Tunde", status: "out_for_delivery", from: 0, delivery_slot: "12–3pm" }), { now, ...full });
  assert.equal(a.label, "Deliver today 12–3pm");
  assert.equal(a.move, "delivered");
});

test("overdue return", () => {
  const a = nextAction(booking({ status: "delivered", from: -3, days: 3, rider_name: "Tunde" }), { now, ...full });
  assert.equal(a.label, "Overdue 1 day: call renter");
  assert.equal(a.severity, "bad");
});

test("collect tomorrow morning", () => {
  const a = nextAction(booking({ status: "delivered", from: -1, days: 3, rider_name: "Tunde", collection_slot: "8–11am" }), { now, ...full });
  assert.equal(a.label, "Collect tomorrow morning");
});

test("collection with no rider", () => {
  const a = nextAction(booking({ status: "delivered", from: -1, days: 2 }), { now, ...full });
  assert.equal(a.label, "Assign rider (collects today 4–7pm)");
  assert.equal(a.severity, "bad");
});

test("inspect, with hours since collection", () => {
  const a = nextAction(booking({ status: "collected", from: -3, days: 2 }), { now, collectedAt: new Date(now.getTime() - 26 * 3_600_000).toISOString() });
  assert.equal(a.label, "Inspect (collected 26h ago)");
  assert.equal(a.severity, "bad");
  assert.equal(a.anchor, "#inspect");
});

test("disputed", () => {
  assert.equal(nextAction(booking({ status: "disputed" }), { now }).label, "Assess dispute");
});

test("inspected: deposit owed, then close", () => {
  const a = nextAction(booking({ status: "inspected", from: -3, deposit_kobo: 2_000_000 }), { now });
  assert.match(a.label, /^Queue refund ₦\s?20,000 \(deposit\)$/);
  const b = nextAction(booking({ status: "inspected", from: -3 }), { now });
  assert.equal(b.label, "Close");
  assert.equal(b.move, "closed");
});

test("refund queued more than a day", () => {
  const a = nextAction(booking({ status: "inspected", from: -3 }), { now, refunds: [{ status: "queued", amount_kobo: 500_000, purpose: "goodwill", created_at: "2026-10-08T09:00:00Z" }] });
  assert.match(a.label, /^Pay refund ₦\s?5,000 \(queued 2d\)$/);
  assert.equal(a.severity, "bad");
});

test("hold expiring", () => {
  const a = nextAction(booking({ status: "hold", hold_expires_at: "2026-10-10T09:10:00Z" }), { now });
  assert.equal(a.label, "Hold expires 10:10, nudge renter");
  assert.equal(a.severity, "warn");
});

test("payment mismatch trumps everything", () => {
  const a = nextAction(booking({ status: "delivered" }), { now, paymentMismatch: true });
  assert.equal(a.role, "finance");
  assert.equal(a.severity, "bad");
});
