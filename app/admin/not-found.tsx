import { SearchX } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/admin/ui";
import { getStaff, homeFor } from "@/lib/admin/auth";

/** A booking, job, item or customer that doesn't exist, or (for riders) a job that isn't theirs. */
export default async function AdminNotFound() {
  const staff = await getStaff();
  const rider = staff?.role === "rider";
  return (
    <div className="adm-page narrow">
      <EmptyState icon={SearchX} title={rider ? "This job isn’t on your list" : "Not found"}
        action={<>
          <ButtonLink href={staff ? homeFor(staff.role) : "/admin"}>{rider ? "Back to my jobs" : "Back to the dashboard"}</ButtonLink>
          {!rider && <ButtonLink variant="secondary" href="/admin/bookings">Bookings</ButtonLink>}
        </>}>
        {rider
          ? "It may have been given to another rider, or the link is wrong. If you think it’s yours, ask ops to set you as the rider."
          : "This page doesn’t exist, or what it showed has been removed. Check the link, or search for it from the list."}
      </EmptyState>
    </div>
  );
}
