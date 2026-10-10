import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * Paystack (https://paystack.com/docs/api). The secret key never leaves the server; card details
 * never touch Deloo (checkout is Paystack's hosted page). Test keys start sk_test_.
 */
const API = "https://api.paystack.co";

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !body?.status) throw new Error(`Paystack ${path}: ${body?.message ?? res.status}`);
  return body.data as T;
}

export type PaystackTransaction = {
  id: number;
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "processing" | "queued" | "reversed";
  reference: string;
  amount: number;          // kobo
  currency: string;
  channel: string;
  fees: number | null;     // kobo
  paid_at: string | null;
  metadata?: Record<string, unknown> | string | null;
};

/** Payment methods the renter can pick; each opens Paystack on just that method. Empty = all of them. */
export const PAY_CHANNELS = ["card", "bank_transfer"] as const;
export type PayChannel = (typeof PAY_CHANNELS)[number];

export function initialize(input: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: Record<string, unknown>; channel?: PayChannel }) {
  return call<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: input.channel ? [input.channel] : ["card", "bank_transfer"],
      metadata: input.metadata,
    }),
  });
}

export function verify(reference: string) {
  return call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Webhook signature: HMAC-SHA512 of the raw body with the secret key. */
export function validSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Re-checks a transaction with Paystack and, if it succeeded in naira, confirms the booking. Same path
 * for the webhook and the app's "I'm back from checkout" check, and safe to run twice (confirm_payment
 * is idempotent). Returns confirm_payment's result, or the Paystack status when not yet successful.
 */
export async function settle(reference: string): Promise<Record<string, unknown>> {
  const tx = await verify(reference);
  if (tx.status !== "success") return { ok: false, paystack_status: tx.status };
  if (tx.currency !== "NGN") return { ok: false, error: "wrong_currency" };
  const db = createServiceClient();
  const { data, error } = await db.rpc("confirm_payment", {
    p_reference: tx.reference,
    p_amount: tx.amount,
    p_paystack_id: String(tx.id),
    p_channel: tx.channel ?? "",
    p_paid_at: tx.paid_at ?? new Date().toISOString(),
    p_fees: tx.fees ?? 0,
  });
  if (error) throw new Error(`confirm_payment: ${error.message}`);
  return data as Record<string, unknown>;
}
