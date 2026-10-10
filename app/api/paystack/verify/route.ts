import { userFromBearer } from "@/lib/api-auth";
import { settle } from "@/lib/paystack";

export const maxDuration = 20;

/**
 * The app is back from checkout: asks Paystack directly instead of waiting for the webhook, and
 * confirms the booking if it's paid. GET ?reference=DLO-XXXXX-1. Returns { status, paid, ... }.
 */
export async function GET(request: Request) {
  const auth = await userFromBearer(request);
  if (auth instanceof Response) return auth;
  const reference = new URL(request.url).searchParams.get("reference") ?? "";
  if (!reference) return Response.json({ error: "Missing reference." }, { status: 400 });

  // As the renter (RLS): the payment must be on their own booking.
  const { data: payment } = await auth.supabase.from("payments").select("id, booking_id").eq("reference", reference).maybeSingle();
  if (!payment) return Response.json({ error: "Payment not found." }, { status: 404 });

  try {
    const result = await settle(reference);
    const { data: booking } = await auth.supabase.from("bookings").select("status, needs_refund").eq("id", payment.booking_id).single();
    return Response.json({ ...result, booking_status: booking?.status, needs_refund: booking?.needs_refund ?? false, paid: result.ok === true });
  } catch (e) {
    console.error("[paystack/verify]", e);
    return Response.json({ error: "Couldn’t check the payment yet. We’ll confirm it as soon as Paystack tells us." }, { status: 502 });
  }
}
