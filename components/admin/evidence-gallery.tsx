import Link from "next/link";
import type { Evidence } from "@/lib/admin/data";
import { fmtDateTime } from "@/lib/admin/format";
import { HANDOVER_LABEL } from "@/lib/admin/status";
import { Chip, Empty } from "./ui";

const SHOT: Record<string, string> = {
  overview: "Overview", serial: "Serial", accessories: "Accessories", damage: "Damage", video_test: "Power-on video", other: "Other",
};

/**
 * Every handover with its photos and videos (signed URLs, valid an hour), capture/upload times, who
 * did it and any problem note. Used for damage claims, so nothing is hidden or summarised away.
 */
export function EvidenceGallery({ evidence, unitLabels, bookingRefs }: {
  evidence: Evidence[]; unitLabels: Map<string, string>; bookingRefs?: Map<string, { ref: string; id: string }>;
}) {
  if (!evidence.length) return <Empty>No handover evidence yet.</Empty>;
  return (
    <div className="grid gap-3">
      {evidence.map((h) => {
        const b = bookingRefs?.get(h.booking_id);
        return (
          <article key={h.id} className="handover" aria-label={`${h.kind} handover`}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="small">{HANDOVER_LABEL[h.kind] ?? h.kind}</strong>
              <Chip tone={h.party === "renter" ? "info" : "neutral"}>{h.party === "renter" ? "Renter" : "Staff"}</Chip>
              {h.result === "issue" && <Chip tone="bad">Problem noted</Chip>}
              {h.result === "ok" && <Chip tone="good">OK</Chip>}
              {h.confirmed_at && <Chip tone="good">Confirmed {fmtDateTime(h.confirmed_at)}</Chip>}
              {b && <Link className="mono small" href={`/admin/bookings/${b.id}`}>{b.ref}</Link>}
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              {h.performer} · recorded {fmtDateTime(h.created_at)}
              {h.device_completed_at && h.device_completed_at !== h.created_at ? ` · on device ${fmtDateTime(h.device_completed_at)}` : ""}
              {" · "}{h.media.length} file{h.media.length === 1 ? "" : "s"}
            </p>
            {h.problem_note && <p className={h.result === "issue" ? "err-box" : "notice"} style={{ margin: 0 }}>{h.problem_note}</p>}
            {h.media.length > 0 ? (
              <div className="gallery">
                {h.media.map((m) => {
                  const caption = [
                    m.unit_id ? unitLabels.get(m.unit_id) ?? "Unit" : "All items",
                    SHOT[m.shot] ?? m.shot,
                    m.captured_at ? `taken ${fmtDateTime(m.captured_at)}` : null,
                    `up ${fmtDateTime(m.uploaded_at)}`,
                  ].filter(Boolean).join(" · ");
                  return (
                    <figure key={m.id}>
                      {!m.url ? (
                        <div className="empty" style={{ aspectRatio: "4 / 3", padding: 8 }}>File missing</div>
                      ) : m.media_type === "video" ? (
                        <video src={m.url} controls preload="metadata" playsInline />
                      ) : (
                        <a href={m.url} target="_blank" rel="noreferrer">
                          {/* Signed, short-lived private URLs: next/image would cache them. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.url} alt={caption} loading="lazy" />
                        </a>
                      )}
                      <figcaption title={m.sha256 ? `SHA-256 ${m.sha256}` : undefined}>{caption}</figcaption>
                    </figure>
                  );
                })}
              </div>
            ) : <p className="muted small" style={{ margin: 0 }}>No files uploaded for this handover.</p>}
          </article>
        );
      })}
    </div>
  );
}
