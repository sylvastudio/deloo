import { fmtRental, fmtWeekday, rentalDays } from "@/lib/admin/format";
import { naira } from "@/lib/format";

/**
 * Messages to the renter after booking (outbox: public.notifications, sent by /api/cron/notify).
 * Plain words, one job per message, and the booking link at the bottom. Email now; the same text is
 * what WhatsApp and push will say later.
 */

export type NotifyKind = "confirmed" | "day_before" | "return_tomorrow" | "deposit_sent";

/** One claimed row from claim_notifications(). */
export type NotifyRow = {
  id: string; kind: NotifyKind; channel: string; payload: { amount_kobo?: number } | null; attempts: number; send_after: string;
  booking_id: string; ref: string | null; status: string; starts_at: string; ends_at: string; delivery: string; address: string;
  delivery_slot: string; collection_slot: string; deposit_kobo: number; email: string | null; full_name: string;
  support_whatsapp: string; pickup_address: string;
};

export type Message = { subject: string; text: string; html: string };

export const APP_URL = "https://app.deloo.space";
export const bookingUrl = (id: string) => `${APP_URL}/booking/${id}`;

/** The app's delivery windows (stored as "8–11am"), said in words. Anything staff typed is used as is. */
const SLOT_NAME: Record<string, string> = { "8–11am": "morning", "12–3pm": "afternoon", "4–7pm": "evening" };
export function slotPhrase(slot: string): string {
  const s = (slot ?? "").trim();
  if (!s) return "";
  return SLOT_NAME[s] ? `in the ${SLOT_NAME[s]} (${s})` : s;
}

/** "12 Admiralty Way" from "12 Admiralty Way, Lekki Phase 1, near the bank". */
export function shortAddress(address: string): string {
  const first = (address ?? "").split(/[,\n]/)[0].trim();
  return first.length > 48 ? `${first.slice(0, 45).trim()}…` : first;
}

const firstName = (full: string) => (full ?? "").trim().split(/\s+/)[0] || "there";

function waDigits(phone: string): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = `234${d.slice(1)}`;
  return d;
}

export function compose(r: NotifyRow): Message {
  const first = firstName(r.full_name);
  const ref = r.ref ?? "your booking";
  const pickup = r.delivery === "pickup";
  const days = rentalDays(r.starts_at, r.ends_at);
  const dates = fmtRental(r.starts_at, r.ends_at);
  const day = fmtWeekday(days.first);
  const slot = slotPhrase(r.delivery_slot);
  const support = r.support_whatsapp ? `WhatsApp ${r.support_whatsapp}` : "WhatsApp, from your booking in the app";
  const deposit = naira(r.payload?.amount_kobo ?? r.deposit_kobo);

  let subject = "";
  let lines: string[] = [];
  switch (r.kind) {
    case "confirmed":
      subject = `Booking ${ref} is confirmed`;
      lines = [
        `Hi ${first}, booking ${ref} is confirmed for ${dates}.`,
        pickup
          ? `Pick it up on ${day}${slot ? `, ${slot}` : ""}${r.pickup_address ? ` at ${r.pickup_address}` : ""}. Bring a valid ID.`
          : `We deliver on ${day}${slot ? `, ${slot}` : ""}.`,
        `Your ${naira(r.deposit_kobo)} deposit comes back within 48 hours after we check the gear.`,
        `Questions? Reply on ${support}.`,
      ];
      break;
    case "day_before":
      subject = pickup ? `Pick up ${ref} tomorrow` : `Your gear arrives tomorrow (${ref})`;
      lines = pickup
        ? [
          `Hi ${first}, your gear for ${ref} is ready for pickup tomorrow${slot ? `, ${slot}` : ""}${r.pickup_address ? `, at ${r.pickup_address}` : ""}.`,
          "Bring a valid ID.",
          `Questions? Reply on ${support}.`,
        ]
        : [
          `Hi ${first}, your gear arrives tomorrow${slot ? `, ${slot}` : ""}${r.address ? `, at ${shortAddress(r.address)}` : ""}.`,
          "Please make sure someone is there with their phone on. The rider calls before coming.",
          "Handover photos take about 3 minutes in the app. Ask the rider to wait while you take them.",
          `Questions? Reply on ${support}.`,
        ];
      break;
    case "return_tomorrow":
      subject = `${ref} goes back tomorrow morning`;
      lines = [
        `Reminder: ${ref} goes back tomorrow morning${pickup ? ", to our base" : r.collection_slot ? `, collection ${r.collection_slot}` : ""}.`,
        "Pack everything with its batteries, chargers and cables, and copy your footage off the cards.",
        "Need it longer? Ask us on WhatsApp before 6pm today.",
      ];
      break;
    case "deposit_sent":
      subject = `Your ${deposit} deposit is on its way`;
      lines = [
        `Hi ${first}, your ${deposit} deposit for ${ref} is on its way back to the card or account you paid from.`,
        "Card refunds can take a few working days to show.",
        "Thanks for renting with Deloo.",
      ];
      break;
  }

  const link = bookingUrl(r.booking_id);
  const text = `${lines.join("\n\n")}\n\nSee your booking: ${link}\n\nDeloo, camera gear for hire in Lagos.`;
  return { subject, text, html: html(subject, lines, link, r.support_whatsapp) };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Same frame as the Supabase auth emails (supabase/templates): white card on paper, lagoon button. */
function html(subject: string, lines: string[], link: string, support: string): string {
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const para = lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#12161C;">${esc(l)}</p>`).join("\n");
  const wa = waDigits(support);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F3F5F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #D3DADB;border-radius:10px;">
<tr><td style="padding:28px 28px 8px;${font}font-size:24px;font-weight:bold;color:#12161C;letter-spacing:-0.5px;">deloo<span style="color:#F2A900;">.</span></td></tr>
<tr><td style="padding:8px 28px 0;${font}">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#12161C;font-weight:bold;">${esc(subject)}</h1>
${para}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td style="border-radius:6px;background:#0F6B73;">
<a href="${esc(link)}" style="display:inline-block;padding:13px 22px;${font}font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;">See your booking</a>
</td></tr></table>
${wa ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#4A5560;">Questions? <a href="https://wa.me/${wa}" style="color:#0F6B73;">Chat with us on WhatsApp</a>.</p>` : ""}
</td></tr>
<tr><td style="padding:24px 28px 28px;${font}font-size:12px;line-height:1.5;color:#4A5560;border-top:1px solid #E6EAEA;">Deloo: camera gear for hire in Lagos, delivered and collected.<br>You got this email because you booked with Deloo.</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}
