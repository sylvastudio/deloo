import type { Metadata } from "next";
import { pct } from "@/components/landing/faq";
import s from "@/components/landing/landing.module.css";
import { getLandingData } from "@/lib/landing/data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Terms of rental · Deloo" },
  description: "Draft terms for renting camera, light and sound gear from Deloo in Lagos.",
  alternates: { canonical: "https://deloo.space/terms" },
};

// DRAFT: placeholder until the founder and a lawyer sign off the real terms.
export default async function Terms() {
  const d = await getLandingData();
  const rate = d.protectionRate != null ? pct(d.protectionRate) : "a share";
  return (
    <article>
      <h1>Terms of rental</h1>
      <p className={s.draft}><strong>Draft.</strong> These terms are a placeholder and not yet final. Questions? Chat with us on WhatsApp.</p>

      <h2>Bookings and holds</h2>
      <p>When you start checkout we hold the gear for 30 minutes. The booking is confirmed once Paystack confirms your payment. The earliest start date is tomorrow.</p>

      <h2>Deposit</h2>
      <p>Each item has a refundable deposit, shown separately before you pay. It is held, not spent, and comes back within 48 hours after we check the gear.</p>

      <h2 id="protection">Deloo Protection</h2>
      <p>For {rate} of the rental, accidental damage during your rental is covered up to a limit. It is a damage waiver, not insurance. It doesn&apos;t cover loss through carelessness or theft without a police report. The cap and exclusions will be confirmed here.</p>

      <h2 id="cancellation">Cancellation and refunds</h2>
      <ul>
        <li>More than 72 hours before your start: full refund. The same applies 24–72 hours before if you booked less than an hour ago.</li>
        <li>24–72 hours before your start: we keep half the rental and refund the rest.</li>
        <li>Under 24 hours before your start: we keep the rental and refund the rest.</li>
        <li>After the gear has been sent out: chat with us on WhatsApp.</li>
      </ul>

      <h2>Handover and return</h2>
      <p>At delivery and return, you and our rider photograph each item. These photos are the record of the gear&apos;s condition.</p>
    </article>
  );
}
