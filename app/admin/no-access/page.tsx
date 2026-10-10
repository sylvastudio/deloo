import Link from "next/link";
import { getStaff, homeFor } from "@/lib/admin/auth";

export const metadata = { title: "No access" };

/** Pages send non-staff here; the layout already shows "No access" to them. Staff just get a way back. */
export default async function NoAccessPage() {
  const staff = await getStaff();
  return (
    <div className="adm-page narrow">
      <p className="hint">This page isn’t available to your role.</p>
      {staff && <Link className="btn btn-secondary" href={homeFor(staff.role)}>Go to your home page</Link>}
    </div>
  );
}
