import { fmtDay, fmtRental, rentalDays } from "./format";

/** Nigerian numbers to wa.me form: 0803… → 234803…; +234… → 234…. Empty when unusable. */
export function waNumber(phone: string): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = `234${d.slice(1)}`;
  if (d.length === 10 && /^[789]/.test(d)) d = `234${d}`;
  return d.length >= 11 ? d : "";
}

export const waLink = (phone: string, text: string) => {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : "";
};

export const telLink = (phone: string) => {
  const d = (phone ?? "").replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : "";
};

export const mapsLink = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, Lagos, Nigeria`)}`;

type B = {
  id: string; ref: string | null; starts_at: string; ends_at: string; delivery: string; address?: string;
  delivery_slot: string; collection_slot: string; rider_name: string; rider_phone: string;
};

/** The renter app's page for a booking. */
export const renterBookingLink = (id: string) => `https://app.deloo.space/booking/${id}`;

/** The app's delivery windows ("8–11am") in words; anything staff typed is used as is. Same as lib/notify. */
const SLOT_NAME: Record<string, string> = { "8–11am": "morning", "12–3pm": "afternoon", "4–7pm": "evening" };
const slotPhrase = (s: string) => (SLOT_NAME[s] ? `in the ${SLOT_NAME[s]} (${s})` : s);

/** Prefilled WhatsApp messages for a booking (A-11 Messages). Each ends with the renter's booking link. */
export function bookingMessages(b: B, name: string) {
  const first = (name || "").split(" ")[0] || "there";
  const ref = b.ref ?? "your booking";
  const { first: day1, last } = rentalDays(b.starts_at, b.ends_at);
  const dates = fmtRental(b.starts_at, b.ends_at);
  const slot = b.delivery_slot ? `, ${slotPhrase(b.delivery_slot)}` : "";
  const rider = b.rider_name ? ` Your rider is ${b.rider_name}${b.rider_phone ? `, ${b.rider_phone}` : ""}.` : "";
  const pickup = b.delivery === "pickup";
  const place = (b.address ?? "").split(/[,\n]/)[0].trim();
  const link = `\n\nYour booking: ${renterBookingLink(b.id)}`;
  return [
    {
      key: "confirmed",
      label: "Booking confirmed",
      text: `Hi ${first}, your Deloo booking ${ref} for ${dates} is confirmed. ${pickup ? `We’ll have it ready for pickup on ${fmtDay(day1)}` : `We deliver on ${fmtDay(day1)}${slot}`}. Reply here if anything changes.${link}`,
    },
    {
      key: "day_before",
      label: "Day before",
      text: pickup
        ? `Hi ${first}, your gear for ${ref} is ready for pickup tomorrow${slot}. Please bring a valid ID.${link}`
        : `Hi ${first}, your gear for ${ref} arrives tomorrow${slot}${place ? `, at ${place}` : ""}. Please make sure someone is there with their phone on. The rider calls before coming. Handover photos take about 3 minutes in the app, so ask the rider to wait.${link}`,
    },
    {
      key: "out",
      label: "Out for delivery",
      text: `Hi ${first}, your gear for ${ref} is on its way.${rider} Please take photos of each item when it arrives, in the Deloo app.${link}`,
    },
    {
      key: "return",
      label: "Return reminder",
      text: `Hi ${first}, a reminder that ${ref} is due back on ${fmtDay(last)}${b.collection_slot ? `, collection ${b.collection_slot}` : ""}. Please pack everything with its batteries, chargers and cables, and copy your footage off the cards. Thank you!${link}`,
    },
  ];
}
