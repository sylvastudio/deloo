import type { Metadata } from "next";
import s from "@/components/landing/landing.module.css";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Terms of rental · Deloo" },
  description: "Draft terms for renting camera, light and sound gear from Deloo in Lagos.",
  alternates: { canonical: "https://deloo.space/terms" },
};

// DRAFT: placeholder until the founder and a lawyer sign off the real terms.
export default function Terms() {
  return (
    <article>
      <h1>Terms of rental</h1>
      <p className={s.draft}><strong>Draft.</strong> These terms are a placeholder and not yet final. Questions? Chat with us on WhatsApp.</p>

      <h2>Bookings and holds</h2>
      <p>When you start checkout we hold the gear for 30 minutes. The booking is confirmed once Paystack confirms your payment. The earliest start date is tomorrow.</p>

      <h2>No deposit</h2>
      <p>We don&apos;t take a refundable deposit. Every booking pays the rental, Deloo Protection (damage cover) and delivery if you choose it, all shown before you pay. Nothing is held back and nothing comes back after the rental. Bookings made before 10 October 2026 keep the deposit they were made with, and it comes back within 48 hours after we check the gear.</p>

      <h2 id="protection">Deloo Protection (damage cover)</h2>
      <p>Protection is part of every booking. It costs 10–20% of the rental, depending on the gear (cameras 20%, lenses and lights 15%, audio and stands 10%), worked out for each item and shown as one line before you pay.</p>
      <p>Protection is Deloo&apos;s own damage waiver, not insurance. If gear is accidentally damaged during your rental, Protection pays most of the repair or replacement cost, up to a limit. We show you the before-and-after handover photos and you can reply before anything is charged.</p>
      <p>Protection doesn&apos;t cover:</p>
      <ul>
        <li>Careless loss, like leaving gear in a taxi</li>
        <li>Theft without a police report</li>
        <li>Water damage</li>
        <li>Missing accessories: batteries, chargers, caps, cables</li>
      </ul>
      <p>For careless loss, or theft without a police report, you pay the gear&apos;s replacement value. If gear is stolen, report it to the police straight away and send us the report. The cap will be confirmed here.</p>

      <h2 id="cancellation">Cancellation and refunds</h2>
      <ul>
        <li>More than 72 hours before your start: full refund. The same applies 24–72 hours before if you booked less than an hour ago.</li>
        <li>24–72 hours before your start: we keep half the rental and refund the rest (delivery and Protection in full).</li>
        <li>Under 24 hours before your start: we keep the rental and refund delivery and Protection.</li>
        <li>After the gear has been sent out: chat with us on WhatsApp.</li>
      </ul>

      <h2>Handover and return</h2>
      <p>At delivery and return, you and our rider photograph each item. These photos are the record of the gear&apos;s condition.</p>
    </article>
  );
}
