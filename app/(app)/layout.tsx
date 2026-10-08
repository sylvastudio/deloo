import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { TabNav } from "@/components/tab-nav";
import { isRenter, isVendor, requireAccount } from "@/lib/account";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const a = await requireAccount();
  const vendor = a.vendors[0];
  // Renters: Plan · Bookings · Account. Vendors: Bookings · Gear · Account. Both get all four (IMPLEMENTATION_PLAN Phase 0).
  const items = [
    ...(isRenter(a) ? [{ href: "/plan", label: "Plan", icon: "plan" as const }] : []),
    { href: "/bookings", label: "Bookings", icon: "bookings" as const },
    ...(isVendor(a) ? [{ href: "/gear", label: "Gear", icon: "gear" as const }] : []),
    { href: "/account", label: "Account", icon: "account" as const },
  ];
  return (
    <div className="shell">
      <header className="topbar">
        <div className="flex min-w-0 items-baseline gap-3">
          <Link href="/" className="wordmark">deloo<span className="dot">.</span></Link>
          {vendor && <span className="org">{vendor.name}</span>}
        </div>
        <div className="flex items-center gap-2">
          {a.profile.is_ops && <span className="badge warm">Ops</span>}
          <form action={signOut}><button className="btn btn-quiet btn-sm" type="submit">Sign out</button></form>
        </div>
      </header>
      <TabNav items={items} />
      <main>{children}</main>
    </div>
  );
}
