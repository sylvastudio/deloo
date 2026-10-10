import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/(auth)/actions";
import { AdminShell, type NavItem } from "@/components/admin/nav";
import { getStaff, homeFor } from "@/lib/admin/auth";
import { can, ROLE_LABEL, type StaffRole } from "@/lib/admin/roles";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Deloo Admin", template: "%s · Deloo Admin" },
  robots: { index: false, follow: false },
};

function navFor(role: StaffRole): NavItem[] {
  const items: (NavItem & { show: boolean })[] = [
    { href: "/admin", label: "Dashboard", icon: "dashboard", show: can(role, "dashboard") },
    { href: "/admin/bookings", label: "Bookings", icon: "bookings", show: can(role, "bookings.view") },
    { href: "/admin/jobs", label: role === "rider" ? "My jobs" : "Dispatch / Jobs", icon: "jobs", show: can(role, "handover.capture") || role === "readonly" },
    { href: "/admin/inventory", label: "Inventory", icon: "inventory", show: can(role, "inventory.view") },
    { href: "/admin/availability", label: "Availability", icon: "availability", show: can(role, "inventory.view"), sub: true },
    { href: "/admin/payments", label: "Payments", icon: "payments", show: can(role, "payments.view") },
    { href: "/admin/payments/refunds", label: "Refunds", icon: "payments", show: can(role, "payments.view"), sub: true },
    { href: "/admin/customers", label: "Customers", icon: "customers", show: can(role, "customers.view") },
    { href: "/admin/demand", label: "Demand", icon: "demand", show: can(role, "demand.view") },
    { href: "/admin/settings", label: "Settings", icon: "settings", show: can(role, "settings.view") },
    { href: "/admin/settings/staff", label: "Staff", icon: "settings", show: can(role, "staff.manage"), sub: true },
  ];
  return items.filter((i) => i.show).map((i) => ({ href: i.href, label: i.label, icon: i.icon, sub: i.sub }));
}

/** Every /admin page: signed-in staff only. Anyone else sees "No access" and no data. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await getStaff();
  if (!staff) return <NoAccess />;
  const top = (
    <>
      <Link href={homeFor(staff.role)} className="wordmark" style={{ fontSize: 20 }}>deloo<span className="dot">.</span></Link>
      <span className="badge">admin</span>
      <div className="who">
        <span className="name" title={staff.email}>{staff.displayName}</span>
        <span className="badge warm">{ROLE_LABEL[staff.role]}</span>
        <form action={signOut}><button className="btn btn-quiet btn-sm" type="submit">Sign out</button></form>
      </div>
    </>
  );
  return <AdminShell items={navFor(staff.role)} top={top}>{children}</AdminShell>;
}

function NoAccess() {
  return (
    <main className="solo">
      <div className="solo-top"><span className="wordmark">deloo<span className="dot">.</span></span></div>
      <div className="solo-main">
        <div className="solo-step card" style={{ maxWidth: 440 }}>
          <h1 className="h2">No access</h1>
          <p className="hint" style={{ fontSize: 14 }}>
            This is Deloo’s staff portal. Your account isn’t on the staff list, or it has been turned off. Ask an owner to add you.
          </p>
          <div className="actions">
            <form action={signOut}><button className="btn btn-secondary" type="submit">Sign out and switch account</button></form>
          </div>
        </div>
      </div>
    </main>
  );
}
