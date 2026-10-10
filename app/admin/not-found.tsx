import Link from "next/link";
import { getStaff, homeFor } from "@/lib/admin/auth";

/** A booking, job, item or customer that doesn't exist, or (for riders) a job that isn't theirs. */
export default async function AdminNotFound() {
  const staff = await getStaff();
  const rider = staff?.role === "rider";
  return (
    <div className="adm-page narrow">
      <div className="card grid gap-3">
        <h1 className="h2">{rider ? "This job isn’t on your list" : "Not found"}</h1>
        <p className="hint" style={{ fontSize: 14, margin: 0 }}>
          {rider
            ? "It may have been given to another rider, or the link is wrong. Your jobs are the ones with your name or phone number as the rider. If you think this is yours, ask ops to set you as the rider."
            : "This page doesn’t exist, or what it showed has been removed. Check the link, or search for it from the list."}
        </p>
        <div className="actions">
          <Link className="btn" href={staff ? homeFor(staff.role) : "/admin"}>{rider ? "Back to my jobs" : "Back to the dashboard"}</Link>
          {!rider && <Link className="btn btn-secondary" href="/admin/bookings">Bookings</Link>}
        </div>
      </div>
    </div>
  );
}
