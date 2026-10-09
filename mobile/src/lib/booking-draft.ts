import { displayName } from './catalog';
import { lineTitle } from './line-text';
import type { Result } from './plan-result';
import type { DemoVendorPart } from './demo-bookings';

/** Flat delivery estimate per vendor for the demo; real fees come from each vendor's settings in the pilot. */
export const DELIVERY_KOBO = 15_000_00;

/** Groups the chosen gear by vendor: one booking per vendor per event (PRD §6). */
export function partsFromResult(r: Result): DemoVendorPart[] {
  const by = new Map<string, DemoVendorPart>();
  for (const l of r.lines) {
    for (const o of l.chosen) {
      const p = by.get(o.vendorId) ?? { vendorId: o.vendorId, vendorName: displayName(o.vendorName), items: [], rentalKobo: 0, depositKobo: 0, delivery: 'delivery', technician: false };
      p.items.push({ title: lineTitle(l.line, [o]), units: o.units });
      p.rentalKobo += o.rentalKobo;
      p.depositKobo += o.depositKobo;
      // Tier 3 or technician-required gear: the switch is on and locked (inventory decision 4).
      if (o.technicianRequired || o.riskTier === 3) p.technician = true;
      by.set(o.vendorId, p);
    }
  }
  return [...by.values()];
}

export const lockedTechnician = (r: Result, vendorId: string) =>
  r.lines.some((l) => l.chosen.some((o) => o.vendorId === vendorId && (o.technicianRequired || o.riskTier === 3)));

/** Highest risk tier in the setup, for the verification gate (PRD §4.5). */
export const highestTier = (r: Result) => Math.max(1, ...r.lines.flatMap((l) => l.chosen.map((o) => o.riskTier)));

/** Review (R15) → Pay (R17) hand-off. In memory only: if the app restarts, the renter reviews again. */
export type PendingBooking = {
  title: string; startsAt?: string; endsAt?: string; area?: string;
  parts: DemoVendorPart[]; deliveryKobo: number; protectionKobo: number; totalKobo: number; holdUntil: number;
};
let pending: PendingBooking | null = null;
export const setPendingBooking = (p: PendingBooking | null) => { pending = p; };
export const getPendingBooking = () => pending;
