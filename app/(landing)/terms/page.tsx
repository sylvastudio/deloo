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
      <p>Protection is Deloo&apos;s own damage waiver, not insurance. If gear is accidentally damaged during your rental, you pay the repair cost, but never more than 10% of that item&apos;s replacement value (at least ₦15,000). For a ₦4.9m camera that&apos;s ₦490,000 at most. We show you the before-and-after handover photos and you can reply before anything is charged.</p>
      <p>Robbery or burglary: if gear is taken by force or in a break-in, report it to the police within 24 hours and send us the report. You pay 30% of the item&apos;s replacement value. This applies to renters whose ID we have verified, once in any 12 months.</p>
      <p>You pay the full replacement value for:</p>
      <ul>
        <li>Theft with no police report</li>
        <li>Careless loss, like leaving gear in a taxi</li>
        <li>Gear that isn&apos;t returned</li>
        <li>Water damage or misuse</li>
      </ul>
      <p>Missing accessories (batteries, chargers, caps, cables) are charged at their own price.</p>

      <h2 id="verification">ID verification</h2>
      <p>Before we hand over a camera, a lens, or more than ₦400,000 of gear, we check your ID once: a photo of your NIN slip, driver&apos;s licence, voter&apos;s card or passport and a selfie holding it. You can pay while we check. If we can&apos;t verify you, we cancel the booking and refund you in full. Only Deloo staff see your photos, and we delete them 90 days after your last return unless a claim is open.</p>

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
