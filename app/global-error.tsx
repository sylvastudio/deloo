"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { fontVariables } from "./fonts";
import "./globals.css";

/**
 * Last-resort error screen when the root layout itself fails. Reports to Sentry when it's set up.
 * It replaces the root layout, so it loads the brand fonts and global styles itself.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en-NG" className={fontVariables}>
      <body>
        <main className="solo">
          <div className="solo-top"><p className="wordmark">deloo<span className="dot">.</span></p></div>
          <div className="solo-main">
            <section className="solo-step">
              <h1 className="h1">Something went wrong</h1>
              <p className="hint" style={{ fontSize: 15 }}>Deloo hit an unexpected problem and we&apos;ve been told about it. Try again, or come back in a few minutes.</p>
              <div className="actions"><button type="button" className="btn" onClick={() => retry()}>Try again</button></div>
            </section>
          </div>
        </main>
      </body>
    </html>
  );
}
