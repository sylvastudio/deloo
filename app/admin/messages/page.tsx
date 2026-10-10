import Link from "next/link";
import { MessageCompose } from "@/components/admin/message-compose";
import { MessageList, SendNow } from "@/components/admin/message-list";
import { Empty, ErrorBox, PageHead, Section } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { namesFor, safeSearch } from "@/lib/admin/data";
import { bookingTarget, loadMessages, MESSAGE_KIND_LABEL, MESSAGE_KINDS, MESSAGE_STATUS_LABEL, renterTarget, type MessageTarget } from "@/lib/admin/messages";
import { can } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Messages" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const STATUS_FILTERS = ["queued", "sent", "failed", "cancelled", "skipped"] as const;

type Db = Awaited<ReturnType<typeof createClient>>;
type Found = { target: MessageTarget | null; note: string; others: { id: string; ref: string | null }[] };

/** "New message" target from ?write=: a booking ref (DLO-…) or a renter's email. */
async function findTarget(db: Db, write: string): Promise<Found> {
  const w = write.trim();
  if (!w) return { target: null, note: "", others: [] };
  if (w.includes("@")) {
    const { data, error } = await db.rpc("staff_find_renter", { p_email: w });
    if (error) return { target: null, note: error.message, others: [] };
    const hit = ((data ?? []) as { user_id: string; email: string; full_name: string }[])[0];
    if (!hit) return { target: null, note: `No Deloo account uses ${w}.`, others: [] };
    const { data: bs } = await db.from("bookings").select("id, ref").eq("renter_id", hit.user_id).order("created_at", { ascending: false }).limit(6);
    return { target: await renterTarget(db, hit.user_id, hit.email), note: "", others: (bs ?? []) as { id: string; ref: string | null }[] };
  }
  const ref = safeSearch(w).toUpperCase();
  const { data: b } = await db.from("bookings").select("id").ilike("ref", ref).limit(1).maybeSingle();
  if (!b) return { target: null, note: `No booking with ref ${ref}.`, others: [] };
  const target = await bookingTarget(db, b.id as string);
  return { target, note: target ? "" : `No booking with ref ${ref}.`, others: [] };
}

export default async function MessagesPage({ searchParams }: { searchParams: SP }) {
  const staff = await pageStaff("messages.view");
  const canSend = can(staff.role, "messages.send");
  const sp = await searchParams;
  const status = first(sp.status);
  const kind = first(sp.kind);
  const q = safeSearch(first(sp.q));
  const from = first(sp.from);
  const to = first(sp.to);
  const write = first(sp.write).slice(0, 120);
  const db = await createClient();

  const [{ rows, error }, found] = await Promise.all([
    loadMessages(db, { status, kind, q, from, to, limit: 300 }),
    canSend ? findTarget(db, write) : Promise.resolve<Found>({ target: null, note: "", others: [] }),
  ]);
  const names = await namesFor(db, rows.flatMap((r) => [r.created_by, r.cancelled_by, r.retried_by]));
  const filtered = !!(status || kind || q || from || to);
  const keep = new URLSearchParams(Object.entries({ status, kind, q, from, to }).filter(([, v]) => v));

  return (
    <div className="adm-page">
      <PageHead title="Messages" kicker="Emails to renters" actions={canSend ? <SendNow /> : undefined} />
      <p className="hint" style={{ margin: 0 }}>
        Booking emails (confirmed, day before, return reminder, deposit sent) are queued automatically. Queued emails go out within 15 minutes; Send now sends whatever is due straight away.
      </p>

      {canSend && (
        <Section title="New message">
          <form className="filters" method="get" role="search" aria-label="Who to write to">
            {Array.from(keep.entries()).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <label className="field grow">
              <span className="field-label">To</span>
              <input className="control" name="write" defaultValue={write} placeholder="Booking ref (DLO-…) or the renter's email" />
            </label>
            <div className="actions">
              <button className="btn btn-secondary" type="submit">Find</button>
              {write && <Link className="btn btn-quiet" href={`/admin/messages${keep.size ? `?${keep}` : ""}`}>Clear</Link>}
            </div>
          </form>
          {found.note && <p className="error" role="alert" style={{ margin: 0 }}>{found.note}</p>}
          {found.others.length > 0 && (
            <div className="actions small" aria-label="Their bookings">
              <span className="muted">Write about a booking instead:</span>
              {found.others.map((b) => b.ref && (
                <Link key={b.id} className="chip mono" href={`/admin/messages?${new URLSearchParams({ ...Object.fromEntries(keep), write: b.ref })}`}>{b.ref}</Link>
              ))}
            </div>
          )}
          {found.target ? (
            <MessageCompose key={`${found.target.bookingId ?? ""}-${found.target.userId}`} bookingId={found.target.bookingId}
              userId={found.target.userId} label={found.target.label} vars={found.target.vars} />
          ) : !write && <p className="hint" style={{ margin: 0 }}>Find a booking or a renter to write to.</p>}
        </Section>
      )}

      <form className="filters" method="get" role="search">
        {write && <input type="hidden" name="write" value={write} />}
        <label className="field grow">
          <span className="field-label">Search</span>
          <input className="control" name="q" defaultValue={q} placeholder="Booking ref, renter name or email" />
        </label>
        <label className="field">
          <span className="field-label">Status</span>
          <select className="control" name="status" defaultValue={status}>
            <option value="">Any</option>
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{MESSAGE_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Kind</span>
          <select className="control" name="kind" defaultValue={kind}>
            <option value="">Any</option>
            {MESSAGE_KINDS.map((k) => <option key={k} value={k}>{MESSAGE_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">From <span className="opt">Lagos</span></span>
          <input className="control" type="date" name="from" defaultValue={from} />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input className="control" type="date" name="to" defaultValue={to} />
        </label>
        <div className="actions">
          <button className="btn" type="submit">Filter</button>
          {filtered && <Link className="btn btn-quiet" href={`/admin/messages${write ? `?write=${encodeURIComponent(write)}` : ""}`}>Clear</Link>}
        </div>
      </form>

      {error ? <ErrorBox what="messages" error={error} /> : rows.length === 0 ? (
        <Empty>{filtered ? "No messages match these filters." : "No messages yet. They appear here when a booking is confirmed."}</Empty>
      ) : (
        <MessageList rows={rows} canSend={canSend} names={names} />
      )}
      {rows.length === 300 && <p className="hint">Showing the latest 300. Narrow the filters to see more.</p>}
    </div>
  );
}
