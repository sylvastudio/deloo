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
  ref: string | null; starts_at: string; ends_at: string; delivery: string; delivery_slot: string; collection_slot: string;
  rider_name: string; rider_phone: string;
};

/** Prefilled WhatsApp messages for a booking (A-11 Messages). */
export function bookingMessages(b: B, name: string) {
  const first = (name || "").split(" ")[0] || "there";
  const ref = b.ref ?? "your booking";
  const { last } = rentalDays(b.starts_at, b.ends_at);
  const dates = fmtRental(b.starts_at, b.ends_at);
  const slot = b.delivery_slot ? ` (${b.delivery_slot})` : "";
  const rider = b.rider_name ? ` Your rider is ${b.rider_name}${b.rider_phone ? `, ${b.rider_phone}` : ""}.` : "";
  const pickup = b.delivery === "pickup";
  return [
    {
      key: "confirmed",
      label: "Booking confirmed",
      text: `Hi ${first}, your Deloo booking ${ref} for ${dates} is confirmed. ${pickup ? "We’ll have it ready for pickup" : `We’ll deliver on the first day${slot}`}. Reply here if anything changes.`,
    },
    {
      key: "out",
      label: "Out for delivery",
      text: `Hi ${first}, your gear for ${ref} is on its way.${rider} Please take photos of each item when it arrives, in the Deloo app.`,
    },
    {
      key: "return",
      label: "Return reminder",
      text: `Hi ${first}, a reminder that ${ref} is due back on ${fmtDay(last)}${b.collection_slot ? `, collection ${b.collection_slot}` : ""}. Please have everything packed with its accessories. Thank you!`,
    },
  ];
}
