/**
 * Demo bookings (incubator demo, user-flows §6): the full book → pay → track flow with no real money.
 * Stored on the phone only and always labelled "Demo". Replaced by real bookings + Paystack in the pilot (N4).
 */
export type DemoVendorPart = {
  vendorId: string; vendorName: string; items: { title: string; units: number }[];
  rentalKobo: number; depositKobo: number; delivery: 'pickup' | 'delivery'; technician: boolean;
};
export type DemoBooking = {
  id: string; createdAt: string; title: string; startsAt?: string; endsAt?: string; area?: string;
  parts: DemoVendorPart[]; deliveryKobo: number; protectionKobo: number; totalKobo: number;
  /** Index into STEPS. Advanced by hand in the demo ("Simulate next step"). */
  step: number;
};

export const STEPS = [
  'Request sent', 'Owners confirmed', 'Ready for pickup / on the way', 'Handed over', 'Event', 'Returned', 'Deposit back',
] as const;

const KEY = 'deloo.demo.bookings';

export function listDemoBookings(): DemoBooking[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as DemoBooking[]; } catch { return []; }
}
function write(all: DemoBooking[]) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}
export function getDemoBooking(id: string) {
  return listDemoBookings().find((b) => b.id === id);
}
export function addDemoBooking(b: Omit<DemoBooking, 'id' | 'createdAt' | 'step'>): DemoBooking {
  const booking: DemoBooking = { ...b, id: `demo-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), step: 0 };
  write([booking, ...listDemoBookings()]);
  return booking;
}
export function advanceDemoBooking(id: string): DemoBooking | undefined {
  const all = listDemoBookings();
  const b = all.find((x) => x.id === id);
  if (!b) return undefined;
  b.step = Math.min(STEPS.length - 1, b.step + 1);
  write(all);
  return b;
}
export function cancelDemoBooking(id: string) {
  write(listDemoBookings().filter((b) => b.id !== id));
}
