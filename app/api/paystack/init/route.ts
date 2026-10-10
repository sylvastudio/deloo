import { userFromBearer } from "@/lib/api-auth";
import { initialize } from "@/lib/paystack";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 20;

/** Where the web app may ask Paystack to send the renter back to. */
const WEB_ORIGINS = ["https://app.deloo.space", "http://localhost:8081", ...(process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];

/**
 * The app has a booking on hold and wants to pay: creates a payment row and a Paystack checkout.
 * Body: { booking_id, return_to?: "web" }. Returns { authorization_url, reference }. Reuses a checkout
 * made in the last 20 minutes for the same amount and return target, so tapping Pay twice doesn't make
 * two transactions. Paystack adds ?reference=… to the callback URL.
 *   Native app: callback deloo.space/pay/return, which hands over to deloo://pay.
 *   Web app (app.deloo.space): callback <web origin>/pay, handled by the app's own /pay route.
 */
export async function POST(request: Request) {
  const auth = await userFromBearer(request);
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => null)) as { booking_id?: unknown; return_to?: unknown } | null;
  const bookingId = typeof body?.booking_id === "string" ? body.booking_id : "";
  const origin = request.headers.get("origin") ?? "";
  const webOrigin = body?.return_to === "web" ? (WEB_ORIGINS.includes(origin) ? origin : WEB_ORIGINS[0]) : null;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const callbackUrl = webOrigin ? `${webOrigin}/pay` : `${site}/pay/return`;
  if (!bookingId) return Response.json({ error: "Missing booking." }, { status: 400 });

  // The three lookups run together: on a cold start the whole call has to fit in Netlify's function
  // time limit (10 s by default), or the browser gets Netlify's error page and the app thinks it's offline.
  const db = createServiceClient();
  const [{ data: booking }, { data: recent }, { count }] = await Promise.all([
    // As the renter (RLS): only their own booking is visible.
    auth.supabase.from("bookings").select("id, ref, status, total_kobo, hold_expires_at").eq("id", bookingId).maybeSingle(),
    db.from("payments")
      .select("reference, authorization_url, amount_kobo, created_at, callback_url").eq("booking_id", bookingId).eq("status", "initialized")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("payments").select("id", { count: "exact", head: true }).eq("booking_id", bookingId),
  ]);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "hold" || !booking.hold_expires_at || Date.parse(booking.hold_expires_at) < Date.now()) {
    return Response.json({ error: "Your hold has ended. Go back and check the gear is still free." }, { status: 409 });
  }
  if (recent?.authorization_url && recent.amount_kobo === booking.total_kobo && recent.callback_url === callbackUrl && Date.now() - Date.parse(recent.created_at) < 20 * 60_000) {
    return Response.json({ authorization_url: recent.authorization_url, reference: recent.reference });
  }

  const reference = `${booking.ref}-${(count ?? 0) + 1}`;
  const { data: payment, error } = await db.from("payments")
    .insert({ booking_id: booking.id, reference, amount_kobo: booking.total_kobo, callback_url: callbackUrl }).select("id").single();
  if (error || !payment) return Response.json({ error: "Couldn’t start the payment. Try again." }, { status: 500 });

  try {
    const checkout = await initialize({
      email: auth.user.email ?? `${auth.user.id}@renters.deloo.space`,
      amountKobo: booking.total_kobo,
      reference,
      callbackUrl,
      metadata: { booking_id: booking.id, payment_id: payment.id, booking_ref: booking.ref },
    });
    await db.from("payments").update({ authorization_url: checkout.authorization_url }).eq("id", payment.id);
    return Response.json({ authorization_url: checkout.authorization_url, reference });
  } catch (e) {
    console.error("[paystack/init]", e);
    await db.from("payments").update({ status: "failed", flags: ["init_failed"] }).eq("id", payment.id);
    return Response.json({ error: "Payments are unavailable right now. Try again in a minute." }, { status: 502 });
  }
}
