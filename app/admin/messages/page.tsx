import { Mail, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { MessageCompose } from "@/components/admin/message-compose";
import { MessageList, SendNow } from "@/components/admin/message-list";
import { ActiveFilters, EmptyState, ErrorState, FilterBar, PageHead, Section } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { namesFor, safeSearch } from "@/lib/admin/data";
import { bookingTarget, loadMessages, MESSAGE_KIND_LABEL, MESSAGE_KINDS, MESSAGE_STATUS_LABEL, renterTarget, type MessageTarget } from "@/lib/admin/messages";
import { can } from "@/lib/admin/roles";
import { hrefWith } from "@/lib/admin/url";
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
  const current = Object.fromEntries(Object.entries({ status, kind, q, from, to, write }).filter(([, v]) => v)) as Record<string, string>;

  const chips = [
    ...(q ? [{ label: <>Search: “{q}”</>, href: hrefWith("/admin/messages", current, { q: null }) }] : []),
    ...(status ? [{ label: <>Status: {MESSAGE_STATUS_LABEL[status as keyof typeof MESSAGE_STATUS_LABEL] ?? status}</>, href: hrefWith("/admin/messages", current, { status: null }) }] : []),
    ...(kind ? [{ label: <>Kind: {MESSAGE_KIND_LABEL[kind as keyof typeof MESSAGE_KIND_LABEL] ?? kind}</>, href: hrefWith("/admin/messages", current, { kind: null }) }] : []),
    ...(from ? [{ label: <>From {from}</>, href: hrefWith("/admin/messages", current, { from: null }) }] : []),
    ...(to ? [{ label: <>To {to}</>, href: hrefWith("/admin/messages", current, { to: null }) }] : []),
  ];

  return (
    <div className="adm-page">
      <PageHead title="Messages" meta={<span>Emails to renters. Booking emails are queued automatically and go out within 15 minutes.</span>}
        actions={canSend ? <SendNow /> : undefined} />

      {canSend && (
        <Section title="New message" description="Write to a renter about a booking, or to their account.">
          <form className="filterbar" method="get" role="search" aria-label="Who to write to">
            <div className="filters">
              {Array.from(keep.entries()).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <label className="search">
                <span className="sr-only">To</span>
                <Search aria-hidden="true" />
                <input className="control" name="write" defaultValue={write} placeholder="Booking ref (DLO-…) or the renter’s email" />
              </label>
              <button className="btn btn-secondary" type="submit">Find</button>
              {write && <Link className="btn btn-ghost" href={`/admin/messages${keep.size ? `?${keep}` : ""}`}>Clear</Link>}
            </div>
          </form>
          {found.note && <p className="error" role="alert">{found.note}</p>}
          {found.others.length > 0 && (
            <div className="fchips" aria-label="Their bookings">
              <span className="muted">Write about a booking instead:</span>
              {found.others.map((b) => b.ref && (
                <Link key={b.id} className="fchip mono" href={`/admin/messages?${new URLSearchParams({ ...Object.fromEntries(keep), write: b.ref })}`}>{b.ref}</Link>
              ))}
            </div>
          )}
          {found.target && (
            <MessageCompose key={`${found.target.bookingId ?? ""}-${found.target.userId}`} bookingId={found.target.bookingId}
              userId={found.target.userId} label={found.target.label} vars={found.target.vars} />
          )}
        </Section>
      )}

      <Section title="Outbox">
        <div className="grid gap-3">
          <FilterBar action="/admin/messages" hidden={{ write }}
            search={{ name: "q", value: q, label: "Search messages", placeholder: "Booking ref, renter name or email" }}
            selects={[
              { name: "status", label: "Status", value: status, anyLabel: "Any status", options: STATUS_FILTERS.map((s) => ({ value: s, label: MESSAGE_STATUS_LABEL[s] })) },
              { name: "kind", label: "Kind", value: kind, anyLabel: "Any kind", options: MESSAGE_KINDS.map((k) => ({ value: k, label: MESSAGE_KIND_LABEL[k] })) },
            ]}
            dates={[{ name: "from", label: "From", value: from }, { name: "to", label: "To", value: to }]} />
          <ActiveFilters items={chips} clearHref={`/admin/messages${write ? `?write=${encodeURIComponent(write)}` : ""}`} />
        </div>
        {error ? <ErrorState what="messages" error={error} /> : rows.length === 0 ? (
          filtered
            ? <EmptyState icon={SearchX} title="No messages match">Try a different search or remove a filter.</EmptyState>
            : <EmptyState icon={Mail} title="No messages yet">They appear here when a booking is confirmed.</EmptyState>
        ) : (
          <MessageList rows={rows} canSend={canSend} names={names} />
        )}
        {rows.length === 300 && <p className="hint">Showing the latest 300. Narrow the filters to see more.</p>}
      </Section>
    </div>
  );
}
