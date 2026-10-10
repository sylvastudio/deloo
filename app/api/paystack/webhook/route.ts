import { settle, validSignature } from "@/lib/paystack";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 30;

type Event = { event?: string; data?: { id?: number; reference?: string; status?: string } };

/**
 * Paystack webhook (Dashboard → Settings → API Keys & Webhooks → https://deloo.space/api/paystack/webhook).
 * The source of truth for payments: signature checked, every event logged once, and a successful charge
 * re-verified with Paystack before the booking is confirmed. Always answers 200 once the signature is
 * valid, so Paystack doesn't retry events we've already stored.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-paystack-signature"))) {
    return new Response("bad signature", { status: 401 });
  }
  const event = JSON.parse(raw) as Event;
  const type = event.event ?? "unknown";
  const reference = event.data?.reference ?? "";
  const db = createServiceClient();

  const { data: logged, error: dup } = await db.from("payment_events")
    .insert({ dedupe_key: `${type}:${reference}:${event.data?.id ?? ""}`, event_type: type, reference, payload: event })
    .select("id").single();
  if (dup?.code === "23505") return new Response("ok (seen)");
  if (dup) console.error("[paystack/webhook] log", dup);

  let error = "";
  try {
    if (type === "charge.success" && reference) {
      const result = await settle(reference);
      if (result.gear_gone || result.duplicate || result.error) console.warn("[paystack/webhook] needs attention", reference, result);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error("[paystack/webhook]", e);
  }
  if (logged) await db.from("payment_events").update({ processed_at: new Date().toISOString(), error }).eq("id", logged.id);
  // A failure to settle is retried by the app's verify call and visible to staff in payment_events.
  return new Response("ok");
}
