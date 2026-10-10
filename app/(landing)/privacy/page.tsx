import type { Metadata } from "next";
import s from "@/components/landing/landing.module.css";

export const metadata: Metadata = {
  title: { absolute: "Privacy · Deloo" },
  description: "Draft privacy notice for Deloo gear rental in Lagos.",
  alternates: { canonical: "https://deloo.space/privacy" },
};

// DRAFT: placeholder until the real privacy policy (NDPA-compliant) is written.
export default function Privacy() {
  return (
    <article>
      <h1>Privacy</h1>
      <p className={s.draft}><strong>Draft.</strong> This notice is a placeholder and not yet final.</p>

      <h2>What we collect</h2>
      <p>Your name, email, WhatsApp number, delivery address and booking details, plus the handover photos and videos taken at delivery and return.</p>

      <h2>How we use it</h2>
      <p>To run your rental: confirm bookings, deliver and collect gear, send refunds and help you on WhatsApp. We don&apos;t sell your data.</p>

      <h2>Payments</h2>
      <p>Payments go through Paystack. We never see or store your card details.</p>

      <h2>Your choices</h2>
      <p>Ask us on WhatsApp to see, correct or delete your data.</p>
    </article>
  );
}
