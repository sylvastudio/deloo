import Link from "next/link";
import {
  ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Inbox, Info, TriangleAlert, X, type LucideIcon,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cx } from "./button";

export type Crumb = { href: string; label: string };

/**
 * Top of a page: breadcrumb (parent pages), title, a meta row (dates, counts, chips) and actions.
 * `kicker` is kept for older pages and shows as the first meta item, in sentence case.
 */
export function PageHead({ title, kicker, crumbs, actions, meta }: {
  title: ReactNode; kicker?: ReactNode; crumbs?: Crumb[]; actions?: ReactNode; meta?: ReactNode;
}) {
  return (
    <header className="adm-head">
      <div className="head-main">
        {crumbs && crumbs.length > 0 && (
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, n) => (
              <span key={c.href} className="inline-flex items-center gap-1">
                {n === 0 && <ChevronLeft aria-hidden="true" />}
                <Link href={c.href}>{c.label}</Link>
                {n < crumbs.length - 1 && <ChevronRight aria-hidden="true" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="t-title">{title}</h1>
        {(kicker || meta) && <div className="meta">{kicker && <span>{kicker}</span>}{meta}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

/**
 * A titled part of a page. Not a box: sections are separated by space and a hairline, so tables and
 * forms inside them don't end up box-in-a-box.
 */
export function Section({ title, description, actions, children, id, className }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string; className?: string;
}) {
  return (
    <section className={cx("sec", className)} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="sec-head">
        <div className="sec-title">
          <h2 className="t-heading" id={id ? `${id}-h` : undefined}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** A surface for things that are objects in their own right: KPI tiles, job cards, media. */
export function Card({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" | "li" }) {
  return <Tag className={cx("card", className)}>{children}</Tag>;
}

/** KPI tile: label, a big tabular number, an optional detail line. A link when `href` is given. */
export function Kpi({ label, value, detail, href, alert }: { label: string; value: ReactNode; detail?: ReactNode; href?: string; alert?: boolean }) {
  const inner = (<><span className="l">{label}</span><span className="n">{value}</span>{detail && <span className="d">{detail}</span>}</>);
  return href
    ? <Link href={href} className="kpi" data-alert={alert ? "true" : undefined}>{inner}</Link>
    : <div className="kpi" data-alert={alert ? "true" : undefined}>{inner}</div>;
}

/** Label/value pairs. Pass [label, value] rows; empty values show "Not set". */
export function DescriptionList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx("dl", className)}>
      {items.map(([k, v], n) => (
        <Fragment key={n}>
          <dt>{k}</dt>
          <dd>{v === null || v === undefined || v === "" ? <span className="subtle">Not set</span> : v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

const CALLOUT_ICON: Record<string, LucideIcon> = { info: Info, ok: CircleCheck, warn: TriangleAlert, bad: CircleAlert };

/** An inline message about this page: info, ok, warn or bad. */
export function Callout({ tone = "info", title, children, role }: { tone?: "info" | "ok" | "warn" | "bad"; title?: ReactNode; children?: ReactNode; role?: "alert" | "status" }) {
  const Icon = CALLOUT_ICON[tone];
  return (
    <div className={cx("callout", tone)} role={role}>
      <Icon aria-hidden="true" />
      <div className="c-body">{title && <span className="c-title">{title}</span>}{children && <div>{children}</div>}</div>
    </div>
  );
}

/** Nothing to show: an icon, a title, one line, and the action that fixes it. */
export function EmptyState({ icon: Icon = Inbox, title, children, action, compact }: {
  icon?: LucideIcon; title: ReactNode; children?: ReactNode; action?: ReactNode; compact?: boolean;
}) {
  return (
    <div className={cx("empty-state", compact && "compact")}>
      {!compact && <span className="es-icon" aria-hidden="true"><Icon /></span>}
      {compact ? <p className="es-title">{title}</p> : <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action && <div className="actions">{action}</div>}
    </div>
  );
}

/** Something failed to load. Says what, and what to do. */
export function ErrorState({ what = "this", error, action }: { what?: string; error?: string; action?: ReactNode }) {
  return (
    <div className="empty-state bad" role="alert">
      <span className="es-icon" aria-hidden="true"><CircleAlert /></span>
      <h3>Couldn’t load {what}</h3>
      <p>{error ? `${error} ` : ""}Reload the page. If it keeps happening, tell the owner.</p>
      {action && <div className="actions">{action}</div>}
    </div>
  );
}

export function Skeleton({ w = "100%", h = 14, className }: { w?: string | number; h?: number; className?: string }) {
  return <span className={cx("skel", className)} style={{ width: w, height: h }} aria-hidden="true" />;
}

export type TimelineItem = { key: string; title: ReactNode; meta?: ReactNode; body?: ReactNode; tone?: "ok" | "bad" | "info" | "warn" };

/** Vertical history: status changes, notes, handovers. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="timeline">
      {items.map((i) => (
        <li key={i.key}>
          <span className="dot" data-tone={i.tone} aria-hidden="true" />
          <div className="grid gap-1 min-w-0">
            <span className="tl-title">{i.title}</span>
            {i.meta && <span className="tl-meta">{i.meta}</span>}
            {i.body}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Lifecycle progress: done stages lagoon, the current one marigold. */
export function StageStepper({ stages, current, failed }: { stages: { key: string; label: string }[]; current: string; failed?: boolean }) {
  const at = stages.findIndex((s) => s.key === current);
  return (
    <ol className="stepper" aria-label="Progress">
      {stages.map((s, n) => {
        const state = n < at ? "done" : n === at ? (failed ? "bad" : "current") : "todo";
        return <li key={s.key} data-state={state} aria-current={n === at ? "step" : undefined}>{s.label}</li>;
      })}
    </ol>
  );
}

export type TabItem = { href: string; label: ReactNode; count?: number | null; current?: boolean };

/** Underline tabs: links with aria-current (they change the URL), used for saved views and sub-pages. */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav className="tabs-u" aria-label={label}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.current ? "page" : undefined} scroll={false}>
          {t.label}{t.count != null && <span className="n">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** A segmented switch made of links (Today / Tomorrow, 7 / 30 / 90 days). */
export function SegmentedLinks({ items, label, size }: { items: TabItem[]; label: string; size?: "lg" }) {
  return (
    <nav className={cx("seg", size)} aria-label={label}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.current ? "page" : undefined} scroll={false}>{t.label}</Link>
      ))}
    </nav>
  );
}

/** Active filters as removable chips. Each chip links to the same page without that filter. */
export function ActiveFilters({ items, clearHref }: { items: { label: ReactNode; href: string }[]; clearHref?: string }) {
  if (!items.length) return null;
  return (
    <div className="fchips" aria-label="Active filters">
      {items.map((f, n) => (
        <Link key={n} className="fchip" href={f.href} scroll={false}>
          {f.label}<span className="x" aria-hidden="true"><X /></span><span className="sr-only"> (remove filter)</span>
        </Link>
      ))}
      {clearHref && items.length > 1 && <Link className="btn btn-ghost btn-sm" href={clearHref} scroll={false}>Clear all</Link>}
    </div>
  );
}

/** "1–50 of 312" with previous/next links. */
export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number | null; hrefFor: (page: number) => string }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total == null ? page * pageSize : Math.min(total, page * pageSize);
  const last = total == null ? page + 1 : Math.max(1, Math.ceil(total / pageSize));
  if (total != null && total <= pageSize && page === 1) return <div className="tbl-foot"><span>{total} {total === 1 ? "row" : "rows"}</span></div>;
  return (
    <div className="tbl-foot">
      <span className="tabular">{from}–{to}{total != null && ` of ${total}`}</span>
      <nav className="pager" aria-label="Pages">
        {page > 1
          ? <Link className="btn btn-secondary btn-sm" href={hrefFor(page - 1)} rel="prev"><ChevronLeft aria-hidden="true" />Previous</Link>
          : <span className="btn btn-secondary btn-sm" aria-disabled="true"><ChevronLeft aria-hidden="true" />Previous</span>}
        {page < last
          ? <Link className="btn btn-secondary btn-sm" href={hrefFor(page + 1)} rel="next">Next<ChevronRight aria-hidden="true" /></Link>
          : <span className="btn btn-secondary btn-sm" aria-disabled="true">Next<ChevronRight aria-hidden="true" /></span>}
      </nav>
    </div>
  );
}
