import Link from "next/link";
import { MessageCompose } from "@/components/admin/message-compose";
import { MessageList, SendNow } from "@/components/admin/message-list";
import { ErrorBox, Section } from "@/components/admin/ui";
import { getStaff } from "@/lib/admin/auth";
import { namesFor } from "@/lib/admin/data";
import { bookingTarget, loadMessages } from "@/lib/admin/messages";
import { can } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * Emails to the renter about one booking (the outbox filtered to it), with a compact form to write a
 * new one. For app/admin/bookings/[id]/page.tsx. Renders nothing for roles without messages.view.
 */
export async function BookingMessages({ bookingId }: { bookingId: string }) {
  const staff = await getStaff();
  if (!staff || !can(staff.role, "messages.view")) return null;
  const canSend = can(staff.role, "messages.send");
  const db = await createClient();
  const [{ rows, error }, target] = await Promise.all([
    loadMessages(db, { booking: bookingId, limit: 50 }),
    canSend ? bookingTarget(db, bookingId) : Promise.resolve(null),
  ]);
  const names = await namesFor(db, rows.flatMap((r) => [r.created_by, r.cancelled_by, r.retried_by]));
  const ref = target?.vars.ref || rows.find((r) => r.ref)?.ref || "";

  return (
    <Section title="Emails to renter" id="emails"
      actions={<Link className="link small" href={ref ? `/admin/messages?q=${encodeURIComponent(ref)}` : "/admin/messages"}>All messages</Link>}>
      {error ? <ErrorBox what="emails" error={error} /> : rows.length === 0 ? (
        <p className="hint">No emails for this booking yet.</p>
      ) : (
        <MessageList rows={rows} canSend={canSend} names={names} showBooking={false} />
      )}
      {canSend && target && (
        <details className="inline">
          <summary>Write an email</summary>
          <div className="grid gap-2">
            <MessageCompose compact bookingId={target.bookingId} userId={target.userId} label={target.label} vars={target.vars} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="hint">Queued emails go out within 15 minutes.</span>
              <SendNow />
            </div>
          </div>
        </details>
      )}
    </Section>
  );
}
