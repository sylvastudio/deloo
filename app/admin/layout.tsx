import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { signOut } from "@/app/(auth)/actions";
import { AdminShell, type NavGroup, type NavItem, type Theme } from "@/components/admin/nav";
import { getStaff, homeFor, type Staff } from "@/lib/admin/auth";
import { addDays, dayStart, lagosDay } from "@/lib/admin/format";
import { can, ROLE_LABEL } from "@/lib/admin/roles";
import { createServiceClient } from "@/lib/supabase/server";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Deloo Admin", template: "%s · Deloo Admin" },
  robots: { index: false, follow: false },
};

type Counts = { jobsToday: number | null; refundsQueued: number | null; paymentsAttention: number | null };

/**
 * The sidebar's numbers, shared by all staff and cached for a minute, so clicking around the portal
 * doesn't run four count queries per page. Read with the service client (no cookies in a cache);
 * which badges a role sees is decided outside, in navCounts.
 */
const sharedCounts = unstable_cache(async (today: string) => {
  const db = createServiceClient();
  const t0 = dayStart(today), t1 = dayStart(addDays(today, 1));
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    try { const r = await q; return r.error ? null : r.count; } catch { return null; }
  };
  const [out, back, refunds, attention] = await Promise.all([
    count(db.from("bookings").select("id", { count: "exact", head: true }).gte("starts_at", t0).lt("starts_at", t1).in("status", ["confirmed", "preparing", "out_for_delivery"])),
    count(db.from("bookings").select("id", { count: "exact", head: true }).gt("ends_at", t0).lte("ends_at", t1).eq("status", "delivered")),
    count(db.from("refunds").select("id", { count: "exact", head: true }).in("status", ["queued", "processing"])),
    count(db.from("payments").select("id", { count: "exact", head: true }).or("status.eq.mismatch,flags.cs.{duplicate}")),
  ]);
  return { out, back, refunds, attention };
}, ["admin-nav-counts"], { revalidate: 60 });

/** Badge counts for the sidebar, only the ones this role may see. */
async function navCounts(staff: Staff): Promise<Counts> {
  const jobs = (can(staff.role, "handover.capture") || staff.role === "readonly") && staff.role !== "rider";
  const money = can(staff.role, "payments.view");
  if (!jobs && !money) return { jobsToday: null, refundsQueued: null, paymentsAttention: null };
  const { out, back, refunds, attention } = await sharedCounts(lagosDay());
  return {
    jobsToday: !jobs || (out == null && back == null) ? null : (out ?? 0) + (back ?? 0),
    refundsQueued: money ? refunds : null,
    paymentsAttention: money ? attention : null,
  };
}

function navFor(staff: Staff, c: Counts): { groups: NavGroup[]; settings?: NavItem } {
  const r = staff.role;
  const show = <T,>(ok: boolean, v: T) => (ok ? [v] : []);
  const groups: NavGroup[] = [
    { label: "Today", items: [
      ...show(can(r, "dashboard"), { href: "/admin", label: "Dashboard", icon: "dashboard" as const }),
      ...show(can(r, "handover.capture") || r === "readonly", { href: "/admin/jobs", label: "Jobs", icon: "jobs" as const, count: c.jobsToday, countTone: "info" as const, countLabel: "jobs today" }),
      ...show(can(r, "dispatch.view"), { href: "/admin/dispatch", label: "Dispatch", icon: "dispatch" as const }),
    ] },
    { label: "Operations", items: [
      ...show(can(r, "bookings.view"), { href: "/admin/bookings", label: "Bookings", icon: "bookings" as const }),
      ...show(can(r, "inventory.view"), { href: "/admin/availability", label: "Availability", icon: "availability" as const }),
    ] },
    { label: "Catalogue", items: [
      ...show(can(r, "inventory.view"), { href: "/admin/inventory", label: "Inventory", icon: "inventory" as const }),
    ] },
    { label: "Money", items: [
      ...show(can(r, "payments.view"), { href: "/admin/payments", label: "Payments", icon: "payments" as const, count: c.paymentsAttention, countTone: "bad" as const, countLabel: "need attention" }),
      ...show(can(r, "payments.view"), { href: "/admin/payments/refunds", label: "Refunds", icon: "refunds" as const, count: c.refundsQueued, countTone: "warn" as const, countLabel: "queued" }),
    ] },
    { label: "People", items: [
      ...show(can(r, "customers.view"), { href: "/admin/customers", label: "Customers", icon: "customers" as const }),
      ...show(can(r, "messages.view"), { href: "/admin/messages", label: "Messages", icon: "messages" as const }),
      ...show(can(r, "staff.manage"), { href: "/admin/settings/staff", label: "Staff", icon: "staff" as const }),
    ] },
    { label: "Insights", items: [
      ...show(can(r, "demand.view"), { href: "/admin/demand", label: "Demand", icon: "demand" as const }),
    ] },
  ];
  return {
    groups: groups.filter((g) => g.items.length),
    settings: can(r, "settings.view") ? { href: "/admin/settings", label: "Settings", icon: "settings" } : undefined,
  };
}

const initials = (name: string) => {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "")).toUpperCase();
};

/** Every /admin page: signed-in staff only. Anyone else sees "No access" and no data. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await getStaff();
  if (!staff) return <NoAccess />;
  const jar = await cookies();
  const t = jar.get("adm-theme")?.value;
  const theme: Theme = t === "light" || t === "dark" ? t : "system";
  const rider = staff.role === "rider";
  const { groups, settings } = navFor(staff, rider ? { jobsToday: null, refundsQueued: null, paymentsAttention: null } : await navCounts(staff));
  return (
    <AdminShell groups={groups} settings={settings} theme={theme} rider={rider} home={homeFor(staff.role)} signOut={signOut}
      user={{ name: staff.displayName, email: staff.email, role: ROLE_LABEL[staff.role], initials: initials(staff.displayName) }}>
      {children}
    </AdminShell>
  );
}

function NoAccess() {
  return (
    <main className="adm adm-solo">
      <div className="panel">
        <span className="wordmark">deloo<span className="dot">.</span></span>
        <h1 className="t-title">No access</h1>
        <p className="muted">
          This is Deloo’s staff portal. Your account isn’t on the staff list, or it has been turned off. Ask an owner to add you.
        </p>
        <form action={signOut}><button className="btn btn-secondary" type="submit">Sign out and switch account</button></form>
      </div>
    </main>
  );
}
