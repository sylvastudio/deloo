import { Ban, CalendarDays, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setBlocked } from "@/app/admin/_actions/people";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { EvidenceGallery } from "@/components/admin/evidence-gallery";
import {
  Chip, DescriptionList, Drawer, EmptyState, ErrorState, Field, IconLink, PageHead, Section, StatusChip, Timeline,
} from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { loadEvidence, namesFor } from "@/lib/admin/data";
import { fmtDateTime, fmtRental, naira } from "@/lib/admin/format";
import { can, maskPhone, maskText } from "@/lib/admin/roles";
import { PAID_STATUSES, type BookingStatus } from "@/lib/admin/status";
import { one, type ProfileRow } from "@/lib/admin/types";
import { telLink, waLink } from "@/lib/admin/whatsapp";
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
  if (error) return <div className="adm-page"><ErrorState what="this customer" error={error.message} /></div>;
  if (!p) notFound();
  const profile = p as ProfileRow;
  const bookings = (bookingsRes.data ?? []) as B[];
  const pii = can(staff.role, "pii.view");

  // Email lives in auth.users: read with the service role, only for roles allowed to see contact details.
  let email = "";
  if (pii) {
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
  const first = profile.full_name.split(" ")[0] || "there";
  const wa = pii ? waLink(profile.phone, `Hi ${first}, this is Deloo.`) : "";

  return (
    <div className="adm-page">
      <PageHead crumbs={[{ href: "/admin/customers", label: "Customers" }]} title={profile.full_name || "No name"}
        meta={<>
          {profile.blocked && <Chip tone="bad">Blocked</Chip>}
          {profile.trust_level > 0 && <Chip tone="good">Trusted, tier {profile.trust_level}</Chip>}
          <span>Joined {fmtDateTime(profile.created_at)}</span>
          <span className="tabular">{paid.length} paid booking{paid.length === 1 ? "" : "s"} · {naira(paid.reduce((s, b) => s + b.total_kobo, 0))}</span>
        </>}
        actions={<>
          {pii && profile.phone && <IconLink icon={Phone} label={`Call ${first}`} href={telLink(profile.phone)} variant="secondary" />}
          {wa && <IconLink icon={MessageCircle} label={`WhatsApp ${first}`} href={wa} variant="secondary" />}
          {can(staff.role, "customers.block") && (
            <Drawer trigger={{ label: profile.blocked ? "Unblock" : "Block", icon: profile.blocked ? ShieldCheck : Ban, variant: profile.blocked ? "secondary" : "danger-ghost", size: "md" }}
              title={profile.blocked ? `Unblock ${first}` : `Block ${first} from booking`}
              description={profile.blocked ? "They can place new holds again." : "They can’t place new holds. Existing bookings aren’t changed."}>
              <ActionForm action={setBlocked} className="grid gap-4" confirmTone={profile.blocked ? "default" : "danger"}
                confirm={profile.blocked ? `Unblock ${profile.full_name}? They can book again straight away.` : `Block ${profile.full_name} from new bookings? Their current bookings carry on as normal.`}>
                <input type="hidden" name="profile_id" value={id} />
                <input type="hidden" name="blocked" value={String(!profile.blocked)} />
                <Field label="Reason" hint="Goes in the audit log.">
                  <input className="control" name="reason" required minLength={3} placeholder={profile.blocked ? "e.g. Debt settled" : "e.g. Didn’t return gear, 48h no contact"} />
                </Field>
                <div className="actions"><Submit variant={profile.blocked ? "primary" : "danger"}>{profile.blocked ? "Unblock" : "Block from booking"}</Submit></div>
              </ActionForm>
            </Drawer>
          )}
        </>} />

      <div className="split">
        <div className="stack">
          <Section title="Bookings" description={`${bookings.length} in total`}>
            {bookingsRes.error ? <ErrorState what="bookings" error={bookingsRes.error.message} /> : !bookings.length ? (
              <EmptyState compact icon={CalendarDays} title="No bookings yet." />
            ) : (
              <div className="tbl-wrap">
                <table className="tbl rows-link">
                  <thead><tr><th>Ref</th><th>Dates</th><th>Gear</th><th className="num">Total</th><th>Status</th></tr></thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b.id}>
                        <td className="nowrap"><Link className="rowlink mono" href={`/admin/bookings/${b.id}`}>{b.ref ?? b.id.slice(0, 8)}</Link></td>
                        <td className="nowrap">{fmtRental(b.starts_at, b.ends_at)}</td>
                        <td className="wrap">{b.booking_items[0]?.item_name ?? <span className="subtle">No items</span>}{b.booking_items.length > 1 && <span className="sub">+{b.booking_items.length - 1} more</span>}</td>
                        <td className="num money">{naira(b.total_kobo)}</td>
                        <td><StatusChip status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          <Section title="Handover photos" description="Every handover on their bookings, newest first.">
            {evidence.error ? <ErrorState what="evidence" error={evidence.error} /> : <EvidenceGallery evidence={evidence.data} unitLabels={unitLabels} bookingRefs={refs} />}
          </Section>
        </div>

        <div className="stack">
          <Section title="Contact">
            <DescriptionList items={[
              ["Phone", profile.phone ? <span className="mono">{maskPhone(staff.role, profile.phone)}</span> : null],
              ["Email", email || (pii ? null : "Hidden for read-only staff")],
              ["Addresses", addresses.length ? <>{addresses.map((a) => <span key={a} className="block">{maskText(staff.role, a)}</span>)}</> : null],
            ]} />
          </Section>
          <Section title="Notes on their bookings">
            {!notes.length ? <EmptyState compact title="No notes." /> : (
              <Timeline items={notes.map((n) => ({
                key: n.id,
                title: <span className="whitespace-pre-wrap">{n.body}</span>,
                meta: <><Link href={`/admin/bookings/${n.booking_id}`} className="link mono">{refs.get(n.booking_id)?.ref}</Link> · {names.get(n.author_id ?? "") ?? "System"} · {fmtDateTime(n.created_at)}</>,
              }))} />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
