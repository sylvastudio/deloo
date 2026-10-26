"use client";
import {
  CalendarDays, CalendarRange, ChartLine, ChevronRight, CreditCard, Ellipsis, IdCard, LayoutDashboard, LogOut, Mail, Monitor, Moon, Package, Route,
  Search, Settings, Sun, Truck, Undo2, UserCog, Users, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmProvider, Drawer } from "./ui/dialog";
import { ToastProvider } from "./ui/toast";

const ICONS = {
  dashboard: LayoutDashboard, jobs: Truck, dispatch: Route, bookings: CalendarDays, availability: CalendarRange, inventory: Package,
  payments: CreditCard, refunds: Undo2, customers: Users, verification: IdCard, messages: Mail, staff: UserCog, demand: ChartLine, settings: Settings,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon: NavIcon; count?: number | null; countTone?: "bad" | "warn" | "info"; countLabel?: string };
export type NavGroup = { label: string; items: NavItem[] };
export type Theme = "light" | "dark" | "system";
export type ShellUser = { name: string; email: string; role: string; initials: string };

const strip = (p: string) => p.replace(/^\/admin(?=\/|$)/, "") || "/";

/** The nav item for this path: the most specific match wins (Payments vs Refunds, Settings vs Staff). */
function currentHref(path: string, items: NavItem[]): string | null {
  const here = strip(path);
  if (here === "/") return items.find((i) => strip(i.href) === "/")?.href ?? null;
  const best = items
    .filter((i) => strip(i.href) !== "/" && (here === strip(i.href) || here.startsWith(strip(i.href) + "/")))
    .sort((a, b) => strip(b.href).length - strip(a.href).length)[0];
  return best?.href ?? null;
}

function NavLink({ item, current, onNavigate }: { item: NavItem; current: boolean; onNavigate?: () => void }) {
  const Icon = ICONS[item.icon];
  return (
    <Link href={item.href} aria-current={current ? "page" : undefined} onClick={onNavigate}>
      <Icon aria-hidden="true" />
      <span className="label">{item.label}</span>
      {item.count ? (
        <span className="adm-count" data-tone={item.countTone}>
          {item.count > 99 ? "99+" : item.count}<span className="sr-only"> {item.countLabel ?? ""}</span>
        </span>
      ) : null}
    </Link>
  );
}

function ThemeChoice({ theme, onPick }: { theme: Theme; onPick: (t: Theme) => void }) {
  const opts: [Theme, string, LucideIcon][] = [["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]];
  return (
    <div className="seg full" role="group" aria-label="Theme">
      {opts.map(([k, l, I]) => (
        <button key={k} type="button" aria-pressed={theme === k} onClick={() => onPick(k)}>
          <I width={14} height={14} aria-hidden="true" />{l}
        </button>
      ))}
    </div>
  );
}

/**
 * The portal frame. Desktop: grouped sidebar (an icon rail from 900 to 1200px) and a top bar with
 * breadcrumbs and booking search. Phones: a top app bar and a bottom nav (Today, Bookings, Jobs, More);
 * no hamburger. Riders: a single top bar ("My jobs") and their avatar menu, nothing else.
 * Also hosts the toast and confirm-dialog providers.
 */
export function AdminShell({ groups, settings, user, theme: initialTheme, rider, home, signOut, children }: {
  groups: NavGroup[]; settings?: NavItem; user: ShellUser; theme: Theme; rider: boolean; home: string;
  signOut: () => Promise<void>; children: ReactNode;
}) {
  const path = usePathname();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [moreAt, setMoreAt] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const all = [...groups.flatMap((g) => g.items), ...(settings ? [settings] : [])];
  const cur = currentHref(path, all);
  const curItem = all.find((i) => i.href === cur);
  const curGroup = groups.find((g) => g.items.some((i) => i.href === cur));
  const deeper = !!curItem && strip(path) !== strip(curItem.href);

  // "/" focuses the booking search (unless typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      if (!searchRef.current || searchRef.current.offsetParent === null) return;
      e.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const pickTheme = (t: Theme) => {
    setTheme(t);
    document.cookie = `adm-theme=${t}; path=/; max-age=31536000; samesite=lax`;
  };

  // Phone bottom nav: up to three destinations the role has, then More.
  const primary = ["/admin", "/admin/bookings", "/admin/jobs", "/admin/payments"]
    .map((h) => all.find((i) => i.href === h)).filter((i): i is NavItem => !!i).slice(0, 3);
  const moreOpen = moreAt === path;
  const moreCurrent = !!cur && !primary.some((i) => i.href === cur);

  const userMenu = (
    <div id="adm-user-menu" popover="auto" className="adm-pop">
      <div className="pop-head">
        <span className="avatar lg" aria-hidden="true">{user.initials}</span>
        <div className="who"><b>{user.name}</b><span>{user.role} · {user.email}</span></div>
      </div>
      <p className="pop-label">Theme</p>
      <ThemeChoice theme={theme} onPick={pickTheme} />
      <form action={signOut} className="pop-form">
        <button type="submit" className="menu-item"><LogOut aria-hidden="true" />Sign out</button>
      </form>
    </div>
  );

  return (
    <div className="adm" data-theme={theme === "system" ? undefined : theme} data-mode={rider ? "rider" : "staff"}>
      <ToastProvider>
        <ConfirmProvider>
          <a className="adm-skip" href="#main">Skip to content</a>

          {!rider && (
            <aside className="adm-side" aria-label="Sections">
              <Link href={home} className="adm-brand" aria-label="Deloo admin home">
                <span className="wordmark">d<span className="rest">eloo</span><span className="dot">.</span></span>
                <span className="env">Admin</span>
              </Link>
              <nav aria-label="Main">
                {groups.map((g) => (
                  <div key={g.label} className="adm-group" role="group" aria-labelledby={`nav-${g.label}`}>
                    <p className="adm-group-label" id={`nav-${g.label}`}>{g.label}</p>
                    <ul className="adm-nav">
                      {g.items.map((i) => <li key={i.href}><NavLink item={i} current={i.href === cur} /></li>)}
                    </ul>
                  </div>
                ))}
              </nav>
              <div className="adm-side-foot">
                {settings && <ul className="adm-nav"><li><NavLink item={settings} current={settings.href === cur} /></li></ul>}
                <button type="button" className="adm-user" popoverTarget="adm-user-menu" aria-label={`Account: ${user.name}, ${user.role}`}>
                  <span className="avatar" aria-hidden="true">{user.initials}</span>
                  <span className="who"><b>{user.name}</b><span>{user.role}</span></span>
                </button>
              </div>
            </aside>
          )}

          <header className="adm-top">
            {rider ? (
              <Link href={home} className="bar-title">My jobs</Link>
            ) : (
              <>
                <nav className="top-crumbs" aria-label="You are here">
                  {curGroup && <span>{curGroup.label}</span>}
                  {curGroup && curItem && <ChevronRight aria-hidden="true" />}
                  {curItem && (deeper ? <Link href={curItem.href}>{curItem.label}</Link> : <span aria-current="page">{curItem.label}</span>)}
                </nav>
                <Link href={home} className="phone-only adm-brand" aria-label="Deloo admin home">
                  <span className="wordmark">deloo<span className="dot">.</span></span>
                </Link>
              </>
            )}
            <div className="top-actions">
              {!rider && (
                <form className="adm-search" action="/admin/bookings" method="get" role="search">
                  <Search aria-hidden="true" />
                  <input ref={searchRef} type="search" name="q" placeholder="Search bookings: ref, phone, name, serial" aria-label="Search bookings by ref, phone, name or serial" />
                  <kbd aria-hidden="true">/</kbd>
                </form>
              )}
              {!rider && (
                <Link href="/admin/bookings?focus=1" className="phone-only btn btn-ghost neutral icon-btn" aria-label="Search bookings"><Search aria-hidden="true" /></Link>
              )}
              <button type="button" className="phone-only adm-user compact" popoverTarget="adm-user-menu" aria-label={`Account: ${user.name}, ${user.role}`}>
                <span className="avatar" aria-hidden="true">{user.initials}</span>
              </button>
            </div>
          </header>

          {userMenu}

          <main id="main" className="adm-main" tabIndex={-1}>{children}</main>

          {!rider && (
            <nav className="adm-bottom" aria-label="Main">
              {primary.map((i) => {
                const Icon = ICONS[i.icon];
                return (
                  <Link key={i.href} href={i.href} aria-current={i.href === cur ? "page" : undefined}>
                    <Icon aria-hidden="true" />{i.href === "/admin" ? "Today" : i.label}
                    {i.count ? <span className="adm-count" data-tone={i.countTone}>{i.count > 99 ? "99+" : i.count}</span> : null}
                  </Link>
                );
              })}
              <button type="button" aria-haspopup="dialog" aria-current={moreCurrent ? "page" : undefined} onClick={() => setMoreAt(path)}>
                <Ellipsis aria-hidden="true" />More
              </button>
            </nav>
          )}
          {!rider && (
            <Drawer title="More" open={moreOpen} onOpenChange={(o) => setMoreAt(o ? path : null)}>
              {groups.map((g) => {
                const rest = g.items.filter((i) => !primary.includes(i));
                if (!rest.length) return null;
                return (
                  <div key={g.label}>
                    <p className="sheet-group">{g.label}</p>
                    <ul className="sheet-nav">
                      {rest.map((i) => {
                        const Icon = ICONS[i.icon];
                        return (
                          <li key={i.href}>
                            <Link href={i.href} aria-current={i.href === cur ? "page" : undefined} onClick={() => setMoreAt(null)}>
                              <Icon aria-hidden="true" /><span className="label">{i.label}</span>
                              {i.count ? <span className="adm-count" data-tone={i.countTone}>{i.count}</span> : null}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {settings && (
                <ul className="sheet-nav">
                  <li><Link href={settings.href} aria-current={settings.href === cur ? "page" : undefined} onClick={() => setMoreAt(null)}><Settings aria-hidden="true" /><span className="label">Settings</span></Link></li>
                </ul>
              )}
            </Drawer>
          )}
        </ConfirmProvider>
      </ToastProvider>
    </div>
  );
}
