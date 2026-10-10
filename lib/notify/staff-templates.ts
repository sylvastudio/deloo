/**
 * Starting points for an email staff write in the portal (/admin/messages, and the booking page).
 * Placeholders are filled from the booking: {first} {ref} {dates} {items} {total}. Staff can edit the
 * text before it goes; whatever placeholders are left are filled again when the message is queued.
 * Safe to import from the client.
 */

export type MessageVars = { first: string; ref: string; dates: string; items: string; total: string };

export const PLACEHOLDERS = ["first", "ref", "dates", "items", "total"] as const;
/** The placeholders that need a booking (only {first} works for a renter without one). */
export const BOOKING_PLACEHOLDERS = ["ref", "dates", "items", "total"] as const;

export type StaffTemplateKey = "payment_retry" | "pickup_ready" | "running_late" | "custom";

export const STAFF_TEMPLATES: { key: StaffTemplateKey; label: string; needsBooking: boolean; subject: string; body: string }[] = [
  {
    key: "payment_retry",
    label: "Payment retry",
    needsBooking: true,
    subject: "Please try paying again for {ref}",
    body: [
      "Hi {first},",
      "Your payment for booking {ref} ({dates}) didn't go through, so the booking isn't confirmed yet.",
      "Please try paying again from your booking in the Deloo app. It's {total} for {items}.",
      "If money left your account but the booking still shows unpaid, reply on WhatsApp and we'll check it for you.",
    ].join("\n\n"),
  },
  {
    key: "pickup_ready",
    label: "Pickup ready",
    needsBooking: true,
    subject: "Your gear for {ref} is ready for pickup",
    body: [
      "Hi {first},",
      "Your gear for {ref} is packed and ready for pickup: {items}.",
      "Please bring a valid ID. We'll check the gear with you before you leave.",
    ].join("\n\n"),
  },
  {
    key: "running_late",
    label: "Running late",
    needsBooking: true,
    subject: "Your delivery for {ref} is running late",
    body: [
      "Hi {first},",
      "Sorry, your delivery for {ref} is running late today. The rider is on the way and will call before arriving.",
      "If the new time doesn't work for you, reply on WhatsApp and we'll sort it out.",
    ].join("\n\n"),
  },
  {
    key: "custom",
    label: "Custom",
    needsBooking: false,
    subject: "",
    body: "Hi {first},\n\n",
  },
];

/** Replace {first} … {total} with the booking's values. Unknown or empty ones are left as they are. */
export function fillPlaceholders(text: string, vars: Partial<MessageVars>): string {
  return text.replace(/\{(first|ref|dates|items|total)\}/g, (whole, key: keyof MessageVars) => {
    const v = vars[key];
    return v ? v : whole;
  });
}

/** Placeholders still in the text (e.g. {ref} when there's no booking). */
export function leftoverPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(first|ref|dates|items|total)\}/g)].map((m) => `{${m[1]}}`))];
}
