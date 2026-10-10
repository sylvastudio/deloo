import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABEL, STATUS_TONE, type BookingStatus, type Tone } from "@/lib/admin/status";

export function StatusChip({ status }: { status: BookingStatus }) {
  return <span className={`st ${STATUS_TONE[status] ?? "neutral"}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`st ${tone}`}>{children}</span>;
}

export function PageHead({ title, kicker, crumbs, actions }: {
  title: ReactNode; kicker?: string; crumbs?: { href: string; label: string }[]; actions?: ReactNode;
}) {
  return (
    <header className="adm-head">
      <div className="grid gap-1 min-w-0">
        {crumbs && (
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c) => <span key={c.href}><Link href={c.href}>{c.label}</Link> /</span>)}
          </nav>
        )}
        {kicker && <p className="kicker">{kicker}</p>}
        <h1 className="h1">{title}</h1>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorBox({ error, what = "this" }: { error: string; what?: string }) {
  return (
    <div className="err-box" role="alert">
      Couldn’t load {what}. {error}
      <br /><span className="small">Reload the page. If it keeps happening, the database may be missing a migration.</span>
    </div>
  );
}

export function Section({ title, actions, children, id }: { title: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="card grid gap-3" id={id}>
      <div className="section-title">
        <h2 className="h2">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Small tone dot + text for yes/no style flags. */
export function Flag({ on, yes, no }: { on: boolean; yes: string; no?: string }) {
  return on ? <Chip tone="bad">{yes}</Chip> : no ? <span className="muted small">{no}</span> : null;
}
