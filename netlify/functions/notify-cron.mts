/**
 * Netlify scheduled function: every 15 minutes, asks the site to send due booking messages
 * (app/api/cron/notify/route.ts). Scheduled functions run on the published deploy only, not on previews.
 * Env (Netlify, scope including Functions): CRON_SECRET (secret), shared with the route.
 * The schedule runs in UTC; send times come from the outbox rows, so it needn't know Lagos.
 */
export default async function notifyCron(): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[notify-cron] CRON_SECRET is not set");
    return new Response("CRON_SECRET is not set", { status: 500 });
  }
  // URL is the site's main address, set by Netlify.
  const base = process.env.URL || "https://deloo.space";
  const res = await fetch(`${base}/api/cron/notify`, { method: "POST", headers: { "x-cron-secret": secret } });
  const body = await res.text();
  if (!res.ok) console.error("[notify-cron]", res.status, body.slice(0, 500));
  else console.log("[notify-cron]", body.slice(0, 500));
  return new Response(body, { status: res.status });
}

export const config = { schedule: "*/15 * * * *" };
