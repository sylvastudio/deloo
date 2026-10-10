"use client";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * A page in the staff portal failed to render. The admin shell (top bar and menu) stays, so staff can
 * try again or go elsewhere. Reported to Sentry when it's set up, like app/global-error.tsx.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="adm-page narrow">
      <div className="card grid gap-3" role="alert">
        <h1 className="h2">Something went wrong on this page</h1>
        <p className="hint" style={{ fontSize: 14, margin: 0 }}>
          It has been reported. Try again; if you’re on a weak signal, wait a moment first. If it keeps happening, reload the page.
        </p>
        {error.digest && <p className="muted small mono" style={{ margin: 0 }}>Ref: {error.digest}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => retry()}>Try again</button>
          <Link className="btn btn-secondary" href="/admin/jobs">Jobs</Link>
          <Link className="btn btn-quiet" href="/admin">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
