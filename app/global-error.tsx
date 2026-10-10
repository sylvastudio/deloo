"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Last-resort error screen when the root layout itself fails. Reports to Sentry when it's set up. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 520, margin: "10vh auto", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Something went wrong</h1>
        <p>Deloo hit an unexpected problem. It has been reported. Try again, or come back in a few minutes.</p>
        <button type="button" onClick={() => retry()} style={{ padding: "10px 16px", fontSize: 15 }}>Try again</button>
      </body>
    </html>
  );
}
