"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  bookings: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  jobs: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  inventory: <><path d="M4 8l8-4 8 4-8 4z" /><path d="M4 8v8l8 4 8-4V8" /><path d="M12 12v8" /></>,
  availability: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16M15 4v16" /></>,
  payments: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  customers: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><circle cx="17" cy="8" r="2.4" /><path d="M16 13.5c2.3 0 4 1.2 4.6 3.5" /></>,
  demand: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; sub?: boolean };

/**
 * The portal frame: top bar, sidebar (a drop-down sheet on phones) and main area. Items are filtered by
 * role on the server; `top` and `children` are server-rendered.
 */
export function AdminShell({ items, top, children }: { items: NavItem[]; top: ReactNode; children: ReactNode }) {
  const path = usePathname();
  // The phone menu is open for the path it was opened on, so navigating closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  // On admin.deloo.space the browser path has no /admin prefix; compare without it.
  const here = path.replace(/^\/admin(?=\/|$)/, "") || "/";
  const isCurrent = (href: string) => {
    const h = href.replace(/^\/admin(?=\/|$)/, "") || "/";
    if (h === "/") return here === "/";
    // The most specific item wins (Payments vs Payments › Refunds).
    const best = items.map((i) => i.href.replace(/^\/admin(?=\/|$)/, "") || "/").filter((x) => x !== "/" && (here === x || here.startsWith(x + "/")))
      .sort((a, b) => b.length - a.length)[0];
    return best === h;
  };
  return (
    <div className="adm">
      <header className="adm-top">
      <button type="button" className="adm-menu-btn" aria-expanded={open} aria-controls="adm-side" onClick={() => setOpenAt(open ? null : path)}>
        <span className="sr-only">Menu</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {top}
      </header>
      <aside id="adm-side" className="adm-side" data-open={open} aria-label="Admin sections">
        <ul className="adm-nav">
          {items.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className={i.sub ? "sub" : undefined} aria-current={isCurrent(i.href) ? "page" : undefined}>
                {!i.sub && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{ICONS[i.icon]}</svg>
                )}
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <main className="adm-main">{children}</main>
    </div>
  );
}
