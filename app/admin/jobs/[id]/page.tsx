import { ArrowDownLeft, ArrowUpRight, MessageCircle, Navigation, Phone, Store } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addNote } from "@/app/admin/_actions/booking";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { EvidenceGallery } from "@/components/admin/evidence-gallery";
import { RiderHandover } from "@/components/admin/handover-capture";
import { Callout, ErrorState, PageHead, Section, StatusChip, Tag } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { evidenceCoverage, loadEvidence, riderOwns } from "@/lib/admin/data";
import { addDays, fmtRental, fmtWeekday, lagosDay } from "@/lib/admin/format";
import { can, maskPhone, maskText } from "@/lib/admin/roles";
import { canMove, collectTooEarly, STATUS_LABEL, type BookingStatus, type HandoverKind } from "@/lib/admin/status";
import { one } from "@/lib/admin/types";
import { mapsLink, telLink, waLink } from "@/lib/admin/whatsapp";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Job" };

type Step = { to: BookingStatus; label: string; kind: HandoverKind; hint: string; dir: "out" | "in" | "base" };

/** The rider's one next step for this booking, and which handover proves it. */
function nextStep(status: BookingStatus, pickup: boolean): Step | null {
  if ((status === "confirmed" || status === "preparing") && !pickup)
    return { to: "out_for_delivery", label: "Start trip", kind: "dispatch", hint: "Photograph every unit at base before you leave.", dir: "out" };
  if (status === "preparing" && pickup)
    return { to: "delivered", label: "Handed over at base", kind: "delivery", hint: "Photograph every unit with the renter at the counter.", dir: "base" };
  if (status === "out_for_delivery") return { to: "delivered", label: "Mark delivered", kind: "delivery", hint: "Photograph every unit at the door, with the renter.", dir: "out" };
  if (status === "delivered") return { to: "collected", label: "Mark collected", kind: "collection", hint: "Photograph every unit before you take it back.", dir: "in" };
  return null;
}

type Line = { id: string; item_name: string; kind: string; unit_id: string | null; units: { tag: string; serial: string } | { tag: string; serial: string }[] | null };

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await pageStaff();
  if (!can(staff.role, "handover.capture") && staff.role !== "readonly") notFound();
  const db = await createClient();
  const { data: b, error } = await db.from("bookings")
    .select("id, ref, renter_id, status, starts_at, ends_at, delivery, address, contact_phone, delivery_slot, collection_slot, rider_name, rider_phone, booking_items(id, item_name, kind, unit_id, units(tag, serial))")
    .eq("id", id).maybeSingle();
  if (error) return <div className="adm-page narrow"><ErrorState what="this job" error={error.message} /></div>;
  if (!b || !riderOwns(staff, b)) notFound();

  const { data: p } = await db.from("profiles").select("full_name, phone").eq("id", b.renter_id).maybeSingle();
  const lines = (b.booking_items as Line[]).filter((i) => i.kind === "rental");
  const ids = (i: Line) => {
    const u = one(i.units);
    return [u?.tag, u?.serial].filter(Boolean).join(" · ");
  };
  const units = lines.filter((i) => i.unit_id).map((i) => ({ unitId: i.unit_id as string, name: i.item_name, ids: ids(i) }));
  const unitLabels = new Map(units.map((u) => [u.unitId, `${u.name}${u.ids ? ` · ${u.ids}` : ""}`]));

  const status = b.status as BookingStatus;
  const pickup = b.delivery === "pickup";
  const step = nextStep(status, pickup);
  const capture = can(staff.role, "handover.capture");
  const allowed = !!step && capture && canMove(status, step.to, staff.role);
  const [cov, evidence] = await Promise.all([step ? evidenceCoverage(db, id, step.kind) : Promise.resolve(null), loadEvidence(db, [id])]);
  // Riders collect on the last rental day or later (ops can take gear back early).
  const tooEarly = step?.to === "collected" ? collectTooEarly(staff.role, b.ends_at as string) : null;
  const phone = (b.contact_phone as string) || p?.phone || "";
  const name = p?.full_name ?? "Renter";
  const pii = can(staff.role, "pii.view");
  const wa = pii && phone ? waLink(phone, `Hi ${name.split(" ")[0]}, this is your Deloo rider for ${b.ref}.`) : "";

  // What this job is: going out (delivery day + slot) or coming back (last day + collection slot).
  const back = status === "delivered" || status === "collected";
  const day = back ? addDays(lagosDay(b.ends_at), -1) : lagosDay(b.starts_at);
  const slot = back ? b.collection_slot : b.delivery_slot;
  const today = lagosDay();
  const when = `${day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : fmtWeekday(day)}${slot ? ` · ${slot}` : ""}`;
  const dir = back ? "in" : pickup ? "base" : "out";

  return (
    <div className={`adm-page narrow${allowed ? " has-bar" : ""}`}>
      <PageHead
        crumbs={[{ href: "/admin/jobs", label: staff.role === "rider" ? "My jobs" : "Jobs" }]}
        title={when}
        meta={<>
          {dir === "out" && <Tag kind="dir-out" icon={<ArrowUpRight aria-hidden="true" />}>Delivery</Tag>}
          {dir === "in" && <Tag kind="dir-in" icon={<ArrowDownLeft aria-hidden="true" />}>Collection</Tag>}
          {dir === "base" && <Tag kind="dir-base" icon={<Store aria-hidden="true" />}>Pickup at base</Tag>}
          <StatusChip status={status} />
          <span className="mono">{b.ref}</span>
        </>}
      />

      <div className="addr-block">
        <p className="addr">{pickup ? "Pickup at Deloo base" : b.address ? maskText(staff.role, b.address) : "No address yet. Call the renter."}</p>
        <p className="who"><b>{name}</b>{phone && <span className="mono">{maskPhone(staff.role, phone)}</span>}<span>{fmtRental(b.starts_at, b.ends_at)}</span></p>
        {pii && (phone || (!pickup && b.address)) && (
          <div className="contact-row">
            {phone && <a href={telLink(phone)}><Phone aria-hidden="true" />Call</a>}
            {wa && <a href={wa} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" />WhatsApp</a>}
            {!pickup && b.address && <a href={mapsLink(b.address)} target="_blank" rel="noreferrer"><Navigation aria-hidden="true" />Directions</a>}
          </div>
        )}
      </div>

      <Section title={`Gear (${lines.length})`}>
        <ul className="gear-list">
          {lines.map((i) => (
            <li key={i.id}>
              <span>{i.item_name}</span>
              {i.unit_id ? <span className="ids">{ids(i) || "Unit assigned"}</span> : <span className="st warn">No unit yet</span>}
            </li>
          ))}
        </ul>
      </Section>

      {can(staff.role, "notes.write") && (
        <details className="inline">
          <summary>Leave a note for ops</summary>
          <ActionForm action={addNote} className="grid gap-2" resetOnSuccess>
            <input type="hidden" name="booking_id" value={id} />
            <textarea className="control" name="body" rows={2} required placeholder="e.g. Renter not home, rescheduled to 4pm" aria-label="Note for ops" />
            <div className="actions"><Submit variant="secondary">Add note</Submit></div>
          </ActionForm>
        </details>
      )}

      {evidence.error ? <ErrorState what="evidence" error={evidence.error} /> : evidence.data.length > 0 && (
        <details className="inline">
          <summary>Photos so far ({evidence.data.reduce((n, h) => n + h.media.length, 0)})</summary>
          <EvidenceGallery evidence={evidence.data} unitLabels={unitLabels} />
        </details>
      )}

      {step && allowed && cov ? (
        <RiderHandover key={`${id}-${step.kind}`} bookingId={id} bookingRef={b.ref ?? "this booking"} units={units} kind={step.kind} to={step.to}
          toLabel={STATUS_LABEL[step.to]} actionLabel={step.label} hint={step.hint} covered={[...cov.covered]}
          blocked={tooEarly ? `Collection opens on ${fmtWeekday(tooEarly)}, the last rental day. If the renter wants to return early, ask ops.` : null} />
      ) : (
        <Callout tone="info" title={!capture ? "View only" : step ? "This step needs ops" : status === "confirmed" ? "Ops prepares this booking first" : "Nothing left to do on this job"}>
          {can(staff.role, "bookings.view")
            ? <Link className="link" href={`/admin/bookings/${id}`}>Open the booking</Link>
            : <Link className="link" href="/admin/jobs">Back to my jobs</Link>}
        </Callout>
      )}
    </div>
  );
}
