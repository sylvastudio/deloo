"use server";
import type { ActionResult } from "@/lib/admin/action-result";
import { friendlyError } from "@/lib/admin/data";
import { act, isUuid, str } from "@/lib/admin/guard";
import { REFUND_METHODS, REFUND_STATUSES } from "@/lib/admin/status";
import { settle } from "@/lib/paystack";
import { createClient } from "@/lib/supabase/server";

/**
 * "Re-check with Paystack": the same idempotent path as the webhook (lib/paystack.ts settle → confirm_payment).
 * Finance/admin/owner only; settle uses the service role, so the role check above it is what guards it.
 */
export async function recheckPayment(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("payments.verify", async () => {
    const reference = str(form, "reference");
    if (!reference || reference.length > 100) return { error: "Unknown reference." };
    // Only references we issued (the user's own session must be able to see the payment).
    const db = await createClient();
    const { data: pay } = await db.from("payments").select("id").eq("reference", reference).maybeSingle();
    if (!pay) return { error: "No payment with that reference." };
    try {
      const r = await settle(reference);
      if (r.ok === false) {
        if (r.paystack_status) return { ok: `Paystack says: ${r.paystack_status}. Nothing changed.` };
        return { error: `Not confirmed: ${String(r.error ?? "unknown")}.` };
      }
      const bits = [r.already ? "Already confirmed" : "Confirmed", r.status ? `booking ${String(r.status)}` : "", r.late ? "late payment" : "",
        r.duplicate ? "duplicate: refund queued" : "", r.gear_gone ? "gear gone: refund queued" : ""].filter(Boolean);
      return { ok: `${bits.join(" · ")}.` };
    } catch (e) {
      return { error: e instanceof Error ? e.message.replace(/sk_(test|live)_\w+/g, "sk_…") : "Paystack check failed." };
    }
  });
}

/** Finance records a refund done in the Paystack dashboard or by bank transfer (P0 is manual). */
export async function updateRefund(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("refunds.process", async (staff) => {
    const id = str(form, "refund_id");
    const status = str(form, "status") as (typeof REFUND_STATUSES)[number];
    const method = str(form, "method") as (typeof REFUND_METHODS)[number];
    const providerRef = str(form, "provider_ref").slice(0, 120);
    if (!isUuid(id)) return { error: "Unknown refund." };
    if (!REFUND_STATUSES.includes(status) || status === "queued") return { error: "Choose processing, done or failed." };
    if (!REFUND_METHODS.includes(method)) return { error: "Choose how it was paid back." };
    if (status === "success" && !providerRef) return { error: "Add the Paystack refund or transfer reference." };
    const db = await createClient();
    const done = status === "success" || status === "failed";
    const { error } = await db.from("refunds").update({
      status, method, provider_ref: providerRef,
      processed_by: done ? staff.userId : null,
      processed_at: done ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) return { error: friendlyError(error) };
    return { ok: status === "success" ? "Refund marked as paid." : status === "failed" ? "Marked as failed." : "Marked as processing." };
  });
}
