import { timingSafeEqual } from "node:crypto";

import { sendDue } from "@/lib/notify/send";

export const maxDuration = 30;

/** Constant-time check of the shared secret (header x-cron-secret, or Authorization: Bearer …). */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sends the messages that are due from the notifications outbox (confirmed, day before, return
 * tomorrow, deposit sent). Called every 15 minutes by netlify/functions/notify-cron.mts; safe to call
 * by hand too (curl -X POST -H "x-cron-secret: …" https://deloo.space/api/cron/notify).
 * A row is claimed before sending, so overlapping runs never send the same message twice.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return new Response("unauthorised", { status: 401 });
  try {
    const result = await sendDue(50);
    if (result.errors.length) console.warn("[cron/notify]", result.errors);
    return Response.json(result);
  } catch (e) {
    console.error("[cron/notify]", e);
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
