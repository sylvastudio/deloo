import { fmtDateTime } from "@/lib/admin/format";
import {
  kycDocHref, kycIdTypeLabel, kycReasonLabel, kycStatusLabel, kycStatusTone, KYC_PART_LABEL, type KycPart,
} from "@/lib/admin/kyc";
import type { KycSubmissionRow } from "@/lib/admin/kyc-data";
import { Chip } from "./ui";

export function KycStatusChip({ status, trust }: { status: string | null | undefined; trust?: number }) {
  const s = status ?? "none";
  return <Chip tone={kycStatusTone(s)}>{kycStatusLabel(s)}{s === "verified" && trust != null && trust > 1 ? `, tier ${trust}` : ""}</Chip>;
}

/**
 * ID front, ID back and selfie side by side. Each image loads through the doc route, which checks the
 * role, logs the view and redirects to a one-minute signed URL. Click opens the full size in a new tab.
 */
export function KycDocs({ sub, compact }: { sub: Pick<KycSubmissionRow, "id" | "back_path" | "media_deleted_at" | "id_type">; compact?: boolean }) {
  if (sub.media_deleted_at) {
    return <p className="muted small">Images deleted {fmtDateTime(sub.media_deleted_at)} (retention policy). The decision and ID type are kept.</p>;
  }
  const parts: KycPart[] = sub.back_path ? ["front", "back", "selfie"] : ["front", "selfie"];
  return (
    <div className={compact ? "kyc-docs compact" : "kyc-docs"}>
      {parts.map((p) => {
        const href = kycDocHref(sub.id, p);
        const label = `${KYC_PART_LABEL[p]}${p !== "selfie" ? ` (${kycIdTypeLabel(sub.id_type)})` : ""}`;
        return (
          <figure key={p}>
            <a href={href} target="_blank" rel="noreferrer noopener">
              {/* Private, short-lived signed URLs behind a redirect: next/image would cache them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={href} alt={label} loading="lazy" referrerPolicy="no-referrer" />
            </a>
            <figcaption>{label}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/** Past submissions, newest first: status, ID type, reason, reviewer, and the documents for reviewers. */
export function KycHistory({ subs, names, canView, skipId, empty = "No earlier submissions." }: {
  subs: KycSubmissionRow[]; names: Map<string, string>; canView: boolean; skipId?: string; empty?: string;
}) {
  const list = subs.filter((s) => s.id !== skipId);
  if (!list.length) return <p className="muted small">{empty}</p>;
  return (
    <ol className="kyc-history">
      {list.map((s) => (
        <li key={s.id}>
          <div className="flex flex-wrap items-center gap-2">
            <KycStatusChip status={s.status} />
            <span className="small">{kycIdTypeLabel(s.id_type)}{s.doc_last4 ? <span className="mono"> ···{s.doc_last4}</span> : null}</span>
            <span className="muted small">sent {fmtDateTime(s.created_at)}</span>
          </div>
          {(s.reason_code || s.reason_note) && (
            <p className="small">{kycReasonLabel(s.reason_code)}{s.reason_code && s.reason_note ? ": " : ""}{s.reason_note}</p>
          )}
          {s.reviewed_at && (
            <p className="muted small">Reviewed by {(s.reviewed_by && names.get(s.reviewed_by)) || "staff"} · {fmtDateTime(s.reviewed_at)}</p>
          )}
          {canView && (
            s.media_deleted_at
              ? <p className="muted small">Images deleted {fmtDateTime(s.media_deleted_at)}.</p>
              : <details className="inline"><summary className="link small">View documents</summary><KycDocs sub={s} compact /></details>
          )}
        </li>
      ))}
    </ol>
  );
}
