"use client";
import * as Sentry from "@sentry/nextjs";
import { CircleAlert, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/**
 * A page in the staff portal failed to render. The admin shell (sidebar and top bar) stays, so staff
 * can try again or go elsewhere. Reported to Sentry when it's set up, like app/global-error.tsx.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="adm-page narrow">
      <div className="empty-state bad" role="alert">
        <span className="es-icon" aria-hidden="true"><CircleAlert /></span>
        <h1 className="t-heading">Something went wrong on this page</h1>
        <p>It has been reported. Try again; on a weak signal, wait a moment first. If it keeps happening, reload the page.</p>
        {error.digest && <p className="mono subtle">Ref {error.digest}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => retry()}><RotateCcw aria-hidden="true" />Try again</button>
          <Link className="btn btn-secondary" href="/admin/jobs">Jobs</Link>
          <Link className="btn btn-ghost" href="/admin">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
