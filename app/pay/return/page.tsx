export const metadata = { title: "Payment · Deloo" };

/**
 * Paystack sends the renter here after checkout (callback_url). The app's in-app browser closes on the
 * deloo:// link and checks the payment itself; this page is only seen if the app isn't installed or
 * the browser didn't hand over.
 */
export default async function PayReturn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const reference = typeof params.reference === "string" ? params.reference : typeof params.trxref === "string" ? params.trxref : "";
  const back = `deloo://pay?reference=${encodeURIComponent(reference)}`;
  return (
    <main className="solo">
      <meta httpEquiv="refresh" content={`0;url=${back}`} />
      <div className="solo-top"><p className="wordmark">deloo<span className="dot">.</span></p></div>
      <div className="solo-main">
        <section className="solo-step">
          <h1 className="h1">Back to the app</h1>
          <p className="hint" style={{ fontSize: 15 }}>
            We&apos;re confirming your payment{reference ? ` (${reference})` : ""}. Open the Deloo app to see your booking.
          </p>
          <p><a className="btn" href={back}>Open Deloo</a></p>
        </section>
      </div>
    </main>
  );
}
