import Link from "next/link";
import { notFound } from "next/navigation";
import { setBlocked } from "@/app/admin/_actions/people";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { EvidenceGallery } from "@/components/admin/evidence-gallery";
import { Chip, Empty, ErrorBox, PageHead, Section, StatusChip } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { loadEvidence, namesFor } from "@/lib/admin/data";
import { fmtDateTime, fmtRental, naira } from "@/lib/admin/format";
import { can, maskPhone, maskText } from "@/lib/admin/roles";
import { PAID_STATUSES, type BookingStatus } from "@/lib/admin/status";
import { one, type ProfileRow } from "@/lib/admin/types";
import { waLink } from "@/lib/admin/whatsapp";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Customer" };

type B = {
  id: string; ref: string | null; status: BookingStatus; starts_at: string; ends_at: string; total_kobo: number; address: string;
  booking_items: { item_name: string; unit_id: string | null; units: { tag: string } | { tag: string }[] | null }[];
};

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await pageStaff("customers.view");
  const db = await createClient();
  const [{ data: p, error }, bookingsRes] = await Promise.all([
    db.from("profiles").select("id, full_name, phone, blocked, trust_level, created_at").eq("id", id).maybeSingle(),
    db.from("bookings").select("id, ref, status, starts_at, ends_at, total_kobo, address, booking_items(item_name, unit_id, units(tag))").eq("renter_id", id).order("starts_at", { ascending: false }).limit(100),
  ]);
  if (error) return <div className="adm-page"><ErrorBox what="this customer" error={error.message} /></div>;
  if (!p) notFound();
  const profile = p as ProfileRow;
  const bookings = (bookingsRes.data ?? []) as B[];

  // Email lives in auth.users: read with the service role, only for roles allowed to see contact details.
  let email = "";
  if (can(staff.role, "pii.view")) {
    try {
      const { data } = await createServiceClient().auth.admin.getUserById(id);
      email = data.user?.email ?? "";
    } catch {
      email = "";
    }
  }

  const ids = bookings.map((b) => b.id);
  const [evidence, notesRes] = await Promise.all([
    loadEvidence(db, ids.slice(0, 40)),
    ids.length ? db.from("booking_notes").select("id, booking_id, author_id, body, created_at").in("booking_id", ids).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
  ]);
  const notes = (notesRes.data ?? []) as { id: string; booking_id: string; author_id: string | null; body: string; created_at: string }[];
  const names = await namesFor(db, notes.map((n) => n.author_id));
  const refs = new Map(bookings.map((b) => [b.id, { id: b.id, ref: b.ref ?? b.id.slice(0, 8) }]));
  const unitLabels = new Map<string, string>();
  for (const b of bookings) for (const i of b.booking_items) if (i.unit_id) unitLabels.set(i.unit_id, `${i.item_name}${one(i.units)?.tag ? ` · ${one(i.units)!.tag}` : ""}`);
  const paid = bookings.filter((b) => (PAID_STATUSES as string[]).includes(b.status));
  const addresses = [...new Set(bookings.map((b) => b.address).filter(Boolean))].slice(0, 5);
  const wa = waLink(profile.phone, `Hi ${profile.full_name.split(" ")[0]}, this is Deloo.`);

  return (
    <div className="adm-page">
      <PageHead crumbs={[{ href: "/admin/customers", label: "Customers" }]} title={profile.full_name}
        actions={<>{profile.blocked && <Chip tone="bad">Blocked</Chip>}{profile.trust_level > 0 && <Chip tone="good">Tier {profile.trust_level}</Chip>}</>} />

      <div className="split">
        <div className="grid gap-4">
          <Section title={`Bookings (${bookings.length})`}>
            {bookingsRes.error ? <ErrorBox what="bookings" error={bookingsRes.error.message} /> : !bookings.length ? <Empty>No bookings yet.</Empty> : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Ref</th><th>Days</th><th>Items</th><th className="num">Total</th><th>Status</th></tr></thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b.id}>
                        <td><Link className="rowlink mono" href={`/admin/bookings/${b.id}`}>{b.ref ?? b.id.slice(0, 8)}</Link></td>
                        <td className="small">{fmtRental(b.starts_at, b.ends_at)}</td>
                        <td className="small">{b.booking_items.map((i) => i.item_name).join(", ") || "—"}</td>
                        <td className="num">{naira(b.total_kobo)}</td>
                        <td><StatusChip status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          <Section title="All handover evidence">
            {evidence.error ? <ErrorBox what="evidence" error={evidence.error} /> : <EvidenceGallery evidence={evidence.data} unitLabels={unitLabels} bookingRefs={refs} />}
          </Section>
        </div>

        <div className="grid gap-4">
          <Section title="Contact">
            <dl className="dl">
              <dt>Phone</dt><dd className="mono">{maskPhone(staff.role, profile.phone) || "—"}{wa && can(staff.role, "pii.view") && <> · <a href={wa} target="_blank" rel="noreferrer" style={{ color: "var(--lagoon)" }}>WhatsApp</a></>}</dd>
              {email && <><dt>Email</dt><dd>{email}</dd></>}
              <dt>Joined</dt><dd>{fmtDateTime(profile.created_at)}</dd>
              <dt>Paid bookings</dt><dd>{paid.length}</dd>
              <dt>Total spent</dt><dd className="mono">{naira(paid.reduce((s, b) => s + b.total_kobo, 0))}</dd>
              <dt>Addresses</dt><dd>{addresses.length ? addresses.map((a) => <div key={a}>{maskText(staff.role, a)}</div>) : "—"}</dd>
            </dl>
          </Section>

          {can(staff.role, "customers.block") && (
            <Section title={profile.blocked ? "Unblock" : "Block"}>
              <ActionForm action={setBlocked} className="grid gap-2" confirm={profile.blocked ? "Unblock this customer?" : "Block this customer from new bookings?"}>
                <input type="hidden" name="profile_id" value={id} />
                <input type="hidden" name="blocked" value={String(!profile.blocked)} />
                <label className="field"><span className="field-label">Reason</span>
                  <input className="control" name="reason" required minLength={3} placeholder={profile.blocked ? "e.g. Debt settled" : "e.g. Didn’t return gear, 48h no contact"} /></label>
                <Submit className={profile.blocked ? "btn btn-secondary" : "btn btn-secondary"}>{profile.blocked ? "Unblock" : "Block from booking"}</Submit>
                <p className="hint">Blocked customers can’t place new holds. Existing bookings aren’t changed.</p>
              </ActionForm>
            </Section>
          )}

          <Section title="Notes on their bookings">
            {!notes.length ? <p className="hint">No notes.</p> : (
              <ul className="grid gap-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {notes.map((n) => (
                  <li key={n.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.body}</p>
                    <p className="muted small" style={{ margin: 0 }}>
                      <Link href={`/admin/bookings/${n.booking_id}`} className="mono" style={{ color: "var(--lagoon)" }}>{refs.get(n.booking_id)?.ref}</Link>
                      {" · "}{names.get(n.author_id ?? "") ?? "System"} · {fmtDateTime(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
