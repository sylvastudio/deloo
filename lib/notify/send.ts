import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { compose, type NotifyRow } from "./templates";

/**
 * Sends due rows from the public.notifications outbox (supabase/migrations/0017). Email through Resend
 * (https://resend.com/docs/api-reference/emails/send-email), from the deloo.space domain the auth emails
 * already use. Env: RESEND_API_KEY (secret), NOTIFY_FROM (optional, default "Deloo <hello@deloo.space>").
 */
const RESEND = "https://api.resend.com/emails";

export type RunResult = { claimed: number; sent: number; failed: number; skipped: number; errors: string[] };

export async function sendDue(limit = 50): Promise<RunResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const from = process.env.NOTIFY_FROM || "Deloo <hello@deloo.space>";
  const db = createServiceClient();

  const { data, error } = await db.rpc("claim_notifications", { p_limit: limit });
  if (error) throw new Error(`claim_notifications: ${error.message}`);
  const rows = (data ?? []) as NotifyRow[];
  const out: RunResult = { claimed: rows.length, sent: 0, failed: 0, skipped: 0, errors: [] };

  for (const r of rows) {
    let ok = false;
    let err = "";
    try {
      if (r.channel !== "email") {
        err = `Channel ${r.channel} isn't sent yet`;
      } else if (!r.email) {
        err = "No email address on the account";
      } else {
        const m = compose(r);
        const res = await fetch(RESEND, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            // Resend drops a repeat with the same key (within 24 h), so a run that sent but couldn't record it
            // doesn't send twice. send_after is in the key so a reminder re-queued for an extension still goes.
            "Idempotency-Key": `notify-${r.id}-${Date.parse(r.send_after)}`,
          },
          body: JSON.stringify({
            from, to: [r.email], subject: m.subject, html: m.html, text: m.text,
            ...(process.env.NOTIFY_REPLY_TO ? { reply_to: process.env.NOTIFY_REPLY_TO } : {}),
            tags: [{ name: "kind", value: r.kind }],
          }),
        });
        if (res.ok) ok = true;
        else err = `Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }

    const { error: rErr } = await db.rpc("notification_result", { p_id: r.id, p_ok: ok, p_error: err });
    if (rErr) out.errors.push(`${r.id}: result ${rErr.message}`);
    if (ok) out.sent++;
    else if (r.channel !== "email" || !r.email) out.skipped++;
    else { out.failed++; out.errors.push(`${r.id} (${r.kind}): ${err}`); }
  }
  return out;
}
