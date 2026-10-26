import { BadgeCheck, CircleSlash, IdCard, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { decideKyc } from "@/app/admin/_actions/kyc";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { KycDocs, KycHistory, KycStatusChip } from "@/components/admin/kyc";
import { Callout, Chip, DescriptionList, Drawer, EmptyState, ErrorState, Field, PageHead, Tabs } from "@/components/admin/ui";
import { pageStaff } from "@/lib/admin/auth";
import { namesFor } from "@/lib/admin/data";
import { fmtDateTime, fmtRental, naira, nowMs } from "@/lib/admin/format";
import {
  kycIdTypeLabel, kycReasonLabel, KYC_REASONS, KYC_REASON_LABEL, type KycDecision,
} from "@/lib/admin/kyc";
import { KYC_PROFILE_COLUMNS, KYC_SUBMISSION_COLUMNS, type KycProfile, type KycSubmissionRow } from "@/lib/admin/kyc-data";
import { maskPhone } from "@/lib/admin/roles";
import { STATUS_LABEL, type BookingStatus } from "@/lib/admin/status";
import { one } from "@/lib/admin/types";
import { first, hrefWith, type SearchParams } from "@/lib/admin/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "ID verification" };

/** Bookings that still need the renter verified: not finished, not dead. */
const LIVE: BookingStatus[] = ["hold", "confirmed", "preparing", "out_for_delivery"];

type Upcoming = {
  id: string; ref: string | null; renter_id: string; status: BookingStatus; starts_at: string; ends_at: string; required_trust: number | null;
  booking_items: { kind: string; item_name: string; items: { replacement_value_kobo: number } | { replacement_value_kobo: number }[] | null }[];
};

type Entry = { profile: KycProfile; sub: KycSubmissionRow | null; history: KycSubmissionRow[]; next: Upcoming | null; basket: number; more: number };

const words = (s: string | null | undefined) => new Set((s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1));
/** The account name and the name on the ID share no word: worth a second look. */
const namesDiffer = (a: string | null | undefined, b: string | null | undefined) => {
  const x = words(a), y = words(b);
  return x.size > 0 && y.size > 0 && ![...x].some((w) => y.has(w));
};

function ago(at: string) {
  const mins = Math.max(0, Math.round((nowMs() - Date.parse(at)) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export default async function VerificationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await pageStaff("kyc.review");
  const sp = await searchParams;
  const view = first(sp.view) === "more" ? "more" : "review";
  const status = view === "more" ? "needs_more" : "pending";
  const db = await createClient();

  const [profRes, reviewCount, moreCount] = await Promise.all([
    db.from("profiles").select(KYC_PROFILE_COLUMNS).eq("kyc_status", status).limit(200),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("kyc_status", "pending"),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("kyc_status", "needs_more"),
  ]);
  const tabs = (
    <Tabs label="Queue" items={[
      { href: hrefWith("/admin/customers/verification", {}, {}), label: "To review", count: reviewCount.count, current: view === "review" },
      { href: hrefWith("/admin/customers/verification", {}, { view: "more" }), label: "Waiting on renter", count: moreCount.count, current: view === "more" },
    ]} />
  );
  const head = (
    <PageHead crumbs={[{ href: "/admin/customers", label: "Customers" }]} title="ID verification"
      meta={<span>Review within 2 hours, 8am to 8pm. Soonest booking first.</span>} />
  );
  if (profRes.error) return <div className="adm-page">{head}{tabs}<ErrorState what="the verification queue" error={profRes.error.message} /></div>;

  const profiles = (profRes.data ?? []) as unknown as KycProfile[];
  const ids = profiles.map((p) => p.id);
  const [subsRes, bookRes] = ids.length ? await Promise.all([
    db.from("kyc_submissions").select(KYC_SUBMISSION_COLUMNS).in("profile_id", ids).order("created_at", { ascending: false }).limit(1000),
    db.from("bookings").select("id, ref, renter_id, status, starts_at, ends_at, required_trust, booking_items(kind, item_name, items(replacement_value_kobo))")
      .in("renter_id", ids).in("status", LIVE).gt("ends_at", new Date(nowMs()).toISOString()).order("starts_at").limit(1000),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const failed = subsRes.error ?? bookRes.error;
  if (failed) return <div className="adm-page">{head}{tabs}<ErrorState what="the verification queue" error={failed.message} /></div>;

  const subs = (subsRes.data ?? []) as unknown as KycSubmissionRow[];
  const bookings = (bookRes.data ?? []) as unknown as Upcoming[];
  const names = await namesFor(db, subs.map((s) => s.reviewed_by));

  const entries: Entry[] = profiles.map((profile) => {
    const history = subs.filter((s) => s.profile_id === profile.id);
    const mine = bookings.filter((b) => b.renter_id === profile.id);
    const next = mine[0] ?? null;
    const basket = next ? next.booking_items.filter((i) => i.kind === "rental").reduce((s, i) => s + Number(one(i.items)?.replacement_value_kobo ?? 0), 0) : 0;
    // The newest submission is the one being decided; an older one only if nothing newer matches the status.
    const sub = history.find((s) => s.status === status) ?? history[0] ?? null;
    return { profile, sub, history, next, basket, more: Math.max(0, mine.length - 1) };
  }).sort((a, z) => {
    const as = a.next?.starts_at ?? "9999", zs = z.next?.starts_at ?? "9999";
    return as.localeCompare(zs) || (a.sub?.created_at ?? "").localeCompare(z.sub?.created_at ?? "");
  });

  return (
    <div className="adm-page">
      {head}
      {tabs}
      {!entries.length ? (
        view === "review"
          ? <EmptyState icon={BadgeCheck} title="Nothing to review">New ID submissions from renters appear here.</EmptyState>
          : <EmptyState icon={IdCard} title="No one is waiting">Renters you asked for new photos appear here until they send them.</EmptyState>
      ) : (
        <ol className="kyc-queue">
          {entries.map((e) => <QueueEntry key={e.profile.id} e={e} names={names} phone={maskPhone(staff.role, e.profile.phone)} waiting={view === "more"} />)}
        </ol>
      )}
    </div>
  );
}

function QueueEntry({ e, names, phone, waiting }: { e: Entry; names: Map<string, string>; phone: string; waiting: boolean }) {
  const { profile: p, sub, next } = e;
  const firstName = p.full_name.split(" ")[0] || "this renter";
  const required = next?.required_trust ?? null;
  const differ = namesDiffer(p.full_name, p.kyc_name);
  const decide = (d: KycDecision) => (
    <>
      <input type="hidden" name="submission_id" value={sub?.id ?? ""} />
      <input type="hidden" name="decision" value={d} />
    </>
  );
  const reasonFields = (d: "needs_more" | "reject") => (
    <>
      <Field label="Reason" hint="The renter sees this, in plain words.">
        <select className="control" name="reason_code" required defaultValue="">
          <option value="" disabled>Choose a reason</option>
          {KYC_REASONS.map((r) => <option key={r} value={r}>{KYC_REASON_LABEL[r]}</option>)}
        </select>
      </Field>
      <Field label="Note" note="optional" hint={d === "needs_more" ? "e.g. Retake the back in daylight, the date is cut off." : "Goes to the renter and the audit log."}>
        <textarea className="control" name="note" rows={3} maxLength={500} />
      </Field>
    </>
  );

  return (
    <li className="card kyc-entry" aria-labelledby={`kyc-${p.id}`}>
      <div className="kyc-entry-head">
        <div className="grid gap-1">
          <h2 className="t-heading" id={`kyc-${p.id}`}><Link className="link" href={`/admin/customers/${p.id}`}>{p.full_name || "No name"}</Link></h2>
          <div className="flex flex-wrap items-center gap-2 small">
            <KycStatusChip status={p.kyc_status} />
            {p.trust_level > 0 && <Chip tone="neutral">Trust tier {p.trust_level}</Chip>}
            {p.blocked && <Chip tone="bad">Blocked</Chip>}
            {phone && <span className="mono muted">{phone}</span>}
            {sub && <span className="muted">sent {fmtDateTime(sub.created_at)} · waiting {ago(sub.created_at)}</span>}
          </div>
        </div>
        {next ? (
          <Link href={`/admin/bookings/${next.id}`} className="flex flex-wrap items-center gap-2 small">
            <Chip tone="info">Next: {fmtRental(next.starts_at, next.ends_at)}</Chip>
            <span className="mono">{next.ref ?? next.id.slice(0, 8)}</span>
          </Link>
        ) : <span className="muted small">No upcoming booking</span>}
      </div>

      {!sub ? (
        <Callout tone="warn" title="No submission found">The profile says “{p.kyc_status}”, but there’s no matching submission. Check the customer page.</Callout>
      ) : (
        <div className="kyc-entry-body">
          <div className="grid gap-3">
            <KycDocs sub={sub} />
            {waiting && (sub.reason_code || sub.reason_note) && (
              <Callout tone="info" title="Asked for new photos">{kycReasonLabel(sub.reason_code)}{sub.reason_note ? `: ${sub.reason_note}` : ""}</Callout>
            )}
          </div>

          <div className="grid gap-4">
            <DescriptionList items={[
              ["Name on account", <span key="n" className="kyc-names"><strong>{p.full_name || "No name"}</strong></span>],
              ["Name on ID", p.kyc_name ? <span key="k">{p.kyc_name}{differ && <> <Chip tone="warn">Names differ</Chip></>}</span> : null],
              ["ID type", <span key="t">{kycIdTypeLabel(sub.id_type)}{sub.doc_last4 ? <span className="mono"> ···{sub.doc_last4}</span> : null}</span>],
              ["Upcoming booking", next ? <span key="b"><Link className="link mono" href={`/admin/bookings/${next.id}`}>{next.ref ?? next.id.slice(0, 8)}</Link> · {STATUS_LABEL[next.status] ?? next.status}{e.more > 0 ? <span className="muted"> · +{e.more} more</span> : null}</span> : null],
              ["Basket value", next ? <span key="v" className="money">{naira(e.basket)} <span className="muted small">replacement</span></span> : null],
              ["Required tier", required != null ? <span key="r">Tier {required}{p.trust_level >= required ? <span className="muted"> (has it)</span> : <span className="muted"> (has tier {p.trust_level})</span>}</span> : next ? "Not set on this booking" : null],
              ["Consent", <span key="c" className="small">{sub.consent_version} · {fmtDateTime(sub.consent_at)}</span>],
            ]} />

            {waiting ? (
              <p className="hint">Waiting for {firstName} to send new photos. Their next submission comes back to “To review”.</p>
            ) : (<>
            <ActionForm action={decideKyc} className="grid gap-3"
              confirm={`Approve ${p.full_name || "this renter"}’s ID? They become verified for 24 months and can book camera gear.`}>
              <input type="hidden" name="submission_id" value={sub.id} />
              <Field label="Name as shown on the ID" note="optional" hint="Saved on the profile when you approve. Check it against the account name.">
                <input className="control" name="kyc_name" defaultValue={p.kyc_name ?? ""} maxLength={120} autoComplete="off" placeholder={p.full_name || "Full name on the ID"} />
              </Field>
              <div className="actions">
                <Submit name="decision" value="approve" variant={required === 3 ? "secondary" : "primary"}>Approve</Submit>
                <Submit name="decision" value="approve_t3" variant={required === 3 ? "primary" : "secondary"}>Approve as tier 3</Submit>
              </div>
            </ActionForm>

            <div className="actions">
              <Drawer trigger={{ label: "Need more", icon: <MessageSquareWarning aria-hidden="true" />, variant: "secondary", size: "md" }}
                title={`Ask ${firstName} for new photos`} description="Their status becomes “Needs more” and the app asks them to send again.">
                <ActionForm action={decideKyc} className="grid gap-4">
                  {decide("needs_more")}
                  {reasonFields("needs_more")}
                  <div className="actions"><Submit variant="primary">Send back</Submit></div>
                </ActionForm>
              </Drawer>
              <Drawer trigger={{ label: "Reject", icon: <CircleSlash aria-hidden="true" />, variant: "danger-ghost", size: "md" }}
                title={`Reject ${firstName}’s ID`} description="They can’t book gear that needs verification. Use Need more if new photos could fix it.">
                <ActionForm action={decideKyc} className="grid gap-4" confirmTone="danger"
                  confirm={`Reject ${p.full_name || "this renter"}’s ID? They can’t send another one from the app.`}>
                  {decide("reject")}
                  {reasonFields("reject")}
                  <div className="actions"><Submit variant="danger">Reject</Submit></div>
                </ActionForm>
              </Drawer>
            </div>
            </>)}
          </div>
        </div>
      )}

      {e.history.length > 1 && (
        <details className="inline">
          <summary className="link small">Earlier submissions ({e.history.length - 1})</summary>
          <KycHistory subs={e.history} names={names} canView skipId={sub?.id} />
        </details>
      )}
    </li>
  );
}
