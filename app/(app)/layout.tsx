import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { TabNav } from "@/components/tab-nav";
import { requireMembership } from "@/lib/org";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const m = await requireMembership();
  const items = [
    { href: "/", label: "Home", icon: "home" as const },
    { href: "/brand-kit", label: "Brand kit", icon: "brand" as const },
    ...(m.role === "admin" ? [{ href: "/settings/members", label: "Members", icon: "members" as const }] : []),
  ];
  return (
    <div className="shell">
      <header className="topbar">
        <div className="flex min-w-0 items-baseline gap-3">
          <Link href="/" className="wordmark">deloo<span className="dot">.</span></Link>
          <span className="org">{m.org.name}{m.unit ? ` · ${m.unit.name}` : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${m.role === "admin" ? "warm" : ""}`}>{m.role === "admin" ? "HQ admin" : "Volunteer"}</span>
          <form action={signOut}><button className="btn btn-quiet btn-sm" type="submit">Sign out</button></form>
        </div>
      </header>
      <TabNav items={items} />
      <main>{children}</main>
    </div>
  );
}
