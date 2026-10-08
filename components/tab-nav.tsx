"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  plan: <><path d="M5 4h10l4 4v12H5z" /><path d="M9 11h6M9 15h4" /></>,
  bookings: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  gear: <><rect x="6" y="3" width="12" height="18" rx="2" /><circle cx="12" cy="14" r="3.5" /><circle cx="12" cy="7" r="1.3" /></>,
  account: <><circle cx="12" cy="9" r="3.5" /><path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5" /></>,
  ops: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
};

export function TabNav({ items }: { items: { href: string; label: string; icon: keyof typeof ICONS }[] }) {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {items.map((i) => {
        const current = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={current ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{ICONS[i.icon]}</svg>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
