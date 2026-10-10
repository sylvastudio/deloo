import { naira } from "@/lib/format";
import type { LandingData } from "@/lib/landing/data";

/** Percent like "7%" from a 0–1 rate. */
export const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

/** FAQ §1.2. Zone prices come from the DB; text falls back when they're missing. Protection rates mirror 0019. */
export function faqItems(d: LandingData): { q: string; a: string }[] {
  const zones = d.zones.length
    ? `Yes, across Lagos. ${d.zones.map((z) => `${z.name} ${naira(z.priceKobo * 2)}`).join(", ")} for drop-off and collection together. Or pick up for free.`
    : "Yes, across Lagos. You see the delivery price for your area before you pay. Or pick up for free.";
  return [
    {
      q: "Is there a deposit?",
      a: "No. You pay the rental, Deloo Protection (damage cover) and delivery if you choose it. Nothing is held back, and nothing comes back after your rental.",
    },
    {
      // TODO(founder): confirm the cap.
      q: "What does Deloo Protection cover?",
      a: "Accidental damage during your rental, up to a limit. It costs 10–20% of the rental, depending on the gear (cameras 20%, lenses and lights 15%, audio and stands 10%). It doesn't cover careless loss, theft without a police report, water damage or missing accessories; those are charged at the gear's replacement value.",
    },
    { q: "Do you deliver? How much?", a: zones },
    {
      q: "Can I cancel?",
      a: "Yes, before we send the gear out. More than 3 days before your start date, you get everything back. Between 1 and 3 days, you get half the rental back, plus delivery and Protection. Less than a day before, the rental is kept and delivery and Protection are refunded.",
    },
    {
      // TODO(founder): confirm; KYC is P1.
      q: "Do I need ID?",
      a: "Bring a valid ID (NIN slip, driver's licence, international passport or voter's card) when you receive the gear. For high-value kits we may ask you to verify before delivery.",
    },
    { q: "How do I pay?", a: "Card or bank transfer through Paystack. We never see your card details." },
    {
      q: "What if the gear doesn't work?",
      a: "Tell us on WhatsApp straight away. We'll swap it or refund that item. Your handover photos and video show it arrived like that.",
    },
    { q: "How early do I need to book?", a: "Any time up to the day before. Popular cameras go fast at weekends, so book early." },
  ];
}
