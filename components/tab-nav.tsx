"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  brand: <><circle cx="12" cy="12" r="8" /><circle cx="9" cy="10" r="1.3" /><circle cx="14.5" cy="9" r="1.3" /><circle cx="15" cy="14" r="1.3" /></>,
  members: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><circle cx="17" cy="8" r="2.3" /><path d="M16 13.2c2.2 0 3.9 1.3 4.5 3.8" /></>,
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
