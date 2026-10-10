import Link from "next/link";
import { notFound } from "next/navigation";
import { addNote, setBookingStatus } from "@/app/admin/_actions/booking";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { EvidenceGallery } from "@/components/admin/evidence-gallery";
import { HandoverCapture } from "@/components/admin/handover-capture";
import { Chip, ErrorBox, PageHead, Section, StatusChip } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { evidenceCoverage, loadEvidence, riderOwns } from "@/lib/admin/data";
import { fmtRental } from "@/lib/admin/format";
import { can } from "@/lib/admin/roles";
import { canMove, HANDOVER_LABEL, type BookingStatus, type HandoverKind } from "@/lib/admin/status";
import { one } from "@/lib/admin/types";
import { mapsLink, telLink, waLink } from "@/lib/admin/whatsapp";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Job" };

type Step = { to: BookingStatus; label: string; kind: HandoverKind; hint: string };

/** The rider's one next step for this booking, and which handover proves it. */
function nextStep(status: BookingStatus, pickup: boolean): Step | null {
  if ((status === "confirmed" || status === "preparing") && !pickup)
    return { to: "out_for_delivery", label: "Start trip", kind: "dispatch", hint: "Photograph every unit at base before you leave." };
  if (status === "preparing" && pickup)
    return { to: "delivered", label: "Handed over at base", kind: "delivery", hint: "Photograph every unit with the renter at the counter." };
  if (status === "out_for_delivery") return { to: "delivered", label: "Delivered", kind: "delivery", hint: "Photograph every unit at the door, with the renter." };
  if (status === "delivered") return { to: "collected", label: "Collected", kind: "collection", hint: "Photograph every unit before you take it back." };
  return null;
}

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await pageStaff();
  if (!can(staff.role, "handover.capture") && staff.role !== "readonly") notFound();
  const db = await createClient();
  const { data: b, error } = await db.from("bookings")
    .select("id, ref, renter_id, status, starts_at, ends_at, delivery, address, contact_phone, delivery_slot, collection_slot, rider_name, rider_phone, booking_items(id, item_name, kind, unit_id, units(tag, serial))")
    .eq("id", id).maybeSingle();
  if (error) return <div className="adm-page narrow"><ErrorBox what="this job" error={error.message} /></div>;
  if (!b || !riderOwns(staff, b)) notFound();

  const { data: p } = await db.from("profiles").select("full_name, phone").eq("id", b.renter_id).maybeSingle();
  const lines = (b.booking_items as { id: string; item_name: string; kind: string; unit_id: string | null; units: { tag: string; serial: string } | { tag: string; serial: string }[] | null }[])
    .filter((i) => i.kind === "rental");
  const label = (i: (typeof lines)[number]) => {
    const u = one(i.units);
    return `${i.item_name}${u?.tag ? ` · ${u.tag}` : u?.serial ? ` · ${u.serial}` : ""}`;
  };
  const units = lines.filter((i) => i.unit_id).map((i) => ({ unitId: i.unit_id as string, label: label(i) }));
  const unitLabels = new Map(units.map((u) => [u.unitId, u.label]));

  const status = b.status as BookingStatus;
  const step = nextStep(status, b.delivery === "pickup");
  const allowed = step && canMove(status, step.to, staff.role);
  const cov = step ? await evidenceCoverage(db, id, step.kind) : null;
  const evidence = await loadEvidence(db, [id]);
  const phone = (b.contact_phone as string) || p?.phone || "";
  const name = p?.full_name ?? "Renter";

  return (
    <div className="adm-page narrow">
      <PageHead crumbs={[{ href: "/admin/jobs", label: "Jobs" }]} title={<span className="mono">{b.ref}</span>} actions={<StatusChip status={status} />} />

      <div className="card job">
        <div className="meta">
          <span>{fmtRental(b.starts_at, b.ends_at)}</span>
          {b.delivery_slot && <span>Delivery {b.delivery_slot}</span>}
          {b.collection_slot && <span>Collection {b.collection_slot}</span>}
        </div>
        <div><strong>{name}</strong></div>
        {b.delivery !== "pickup" && b.address && <div>{b.address}</div>}
        <div className="bigbtns">
          {phone && <a className="btn btn-secondary" href={telLink(phone)}>Call</a>}
          {phone && waLink(phone, `Hi ${name.split(" ")[0]}, this is your Deloo rider for ${b.ref}.`) && (
            <a className="btn btn-secondary" href={waLink(phone, `Hi ${name.split(" ")[0]}, this is your Deloo rider for ${b.ref}.`)} target="_blank" rel="noreferrer">WhatsApp</a>
          )}
          {b.delivery !== "pickup" && b.address && <a className="btn btn-secondary" href={mapsLink(b.address)} target="_blank" rel="noreferrer">Maps</a>}
        </div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {lines.map((i) => <li key={i.id}>{label(i)}{!i.unit_id && <> <Chip tone="warn">no unit</Chip></>}</li>)}
        </ul>
      </div>

      {step && allowed && cov ? (
        <Section title={step.label}>
          <p className="hint">{step.hint}</p>
          {cov.complete ? (
            <p className="ok-box">{HANDOVER_LABEL[step.kind]} photos are in for every unit.</p>
          ) : (
            <p className="warn-box">
              {cov.units.length === 0 ? "No units are assigned to this booking. Ask ops." : `Still needed: a photo of ${units.filter((u) => cov.missing.includes(u.unitId)).map((u) => u.label).join(", ")}.`}
            </p>
          )}
          <HandoverCapture bookingId={id} units={units} kinds={[step.kind, "inspection", "dispatch", "delivery", "collection"].filter((k, n, a) => a.indexOf(k) === n) as HandoverKind[]} defaultKind={step.kind} title={`${HANDOVER_LABEL[step.kind]} photos`} />
          <ActionForm action={setBookingStatus} confirm={`${step.label}? This updates the renter’s tracker.`}>
            <input type="hidden" name="booking_id" value={id} />
            <input type="hidden" name="to" value={step.to} />
            <div className="bigbtns"><Submit className="btn btn-generate" disabled={!cov.complete}>{step.label}</Submit></div>
          </ActionForm>
        </Section>
      ) : (
        <p className="notice">{step ? "This step needs ops." : status === "confirmed" ? "Ops prepares this booking first." : "Nothing left for a rider to do on this job."} <Link href={can(staff.role, "bookings.view") ? `/admin/bookings/${id}` : "/admin/jobs"} style={{ color: "var(--lagoon)" }}>{can(staff.role, "bookings.view") ? "Open the booking" : "Back to jobs"}</Link></p>
      )}

      <Section title="Evidence so far">
        {evidence.error ? <ErrorBox what="evidence" error={evidence.error} /> : <EvidenceGallery evidence={evidence.data} unitLabels={unitLabels} />}
      </Section>

      {can(staff.role, "notes.write") && (
        <Section title="Note for ops">
          <ActionForm action={addNote} className="grid gap-2" resetOnSuccess>
            <input type="hidden" name="booking_id" value={id} />
            <textarea className="control" name="body" rows={2} required placeholder="e.g. Renter not home, rescheduled to 4pm" aria-label="Note" />
            <Submit className="btn btn-secondary">Add note</Submit>
          </ActionForm>
        </Section>
      )}
    </div>
  );
}
