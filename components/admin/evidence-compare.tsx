import type { Evidence, EvidenceMedia } from "@/lib/admin/data";
import { fmtDateTime } from "@/lib/admin/format";
import { Chip, Empty } from "./ui";
import s from "./ops.module.css";

/** Columns: the journey of a unit, left to right. */
const STAGES = [
  { key: "dispatch", party: "staff", label: "Dispatch" },
  { key: "delivery", party: "staff", label: "Delivery (rider)" },
  { key: "delivery", party: "renter", label: "Delivery (renter)" },
  { key: "collection", party: "staff", label: "Collection" },
  { key: "inspection", party: "staff", label: "Inspection" },
] as const;

const SHOTS = [
  { key: "overview", label: "Overview" },
  { key: "serial", label: "Serial" },
  { key: "accessories", label: "Accessories" },
  { key: "damage", label: "Damage" },
] as const;

type Pic = EvidenceMedia & { issue: boolean; note: string };

/**
 * Per unit, the same shot side by side across every handover (dispatch → delivery, staff and renter →
 * collection → inspection), so a scratch that appears between two stages is easy to spot. Used in the
 * Inspect return panel and on disputed bookings. Photos are signed URLs from loadEvidence (an hour).
 */
export function EvidenceCompare({ evidence, units }: { evidence: Evidence[]; units: [string, string][] }) {
  const pics: (Pic & { kind: string; party: string })[] = evidence.flatMap((h) =>
    h.media.filter((m) => m.media_type === "photo").map((m) => ({ ...m, kind: h.kind, party: h.party, issue: h.result === "issue", note: h.problem_note })));
  if (!pics.length) return <Empty>No handover photos yet to compare.</Empty>;

  const groups: [string | null, string][] = [...units];
  if (pics.some((p) => !p.unit_id)) groups.push([null, "All items (no unit picked)"]);

  return (
    <div className="grid gap-4">
      {groups.map(([unitId, label]) => {
        const mine = pics.filter((p) => p.unit_id === unitId);
        const shots = SHOTS.filter((sh) => sh.key === "overview" || mine.some((p) => p.shot === sh.key));
        const issues = STAGES.filter((st) => mine.some((p) => p.kind === st.key && p.party === st.party && p.issue));
        return (
          <section key={unitId ?? "all"} className={s.cmpUnit} aria-label={`Photos of ${label}`}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="small">{label}</strong>
              {issues.map((st) => <Chip key={st.label} tone="bad">Problem at {st.label.toLowerCase()}</Chip>)}
              {!mine.length && <span className="muted small">No photos of this unit yet.</span>}
            </div>
            {mine.length > 0 && (
              <div className={s.cmpWrap}>
                <table className={s.cmp}>
                  <thead>
                    <tr><th scope="col"><span className="sr-only">Shot</span></th>{STAGES.map((st) => <th key={st.label} scope="col">{st.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {shots.map((sh) => (
                      <tr key={sh.key}>
                        <th scope="row">{sh.label}</th>
                        {STAGES.map((st) => {
                          // Newest first: the last word on that stage.
                          const cell = mine.filter((p) => p.kind === st.key && p.party === st.party && p.shot === sh.key)
                            .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
                          return (
                            <td key={st.label}>
                              {cell.length === 0 ? <div className={s.cmpMissing}>—</div> : (
                                <div className={s.cmpCell}>
                                  <div className={s.cmpThumbs}>
                                    {cell.slice(0, 2).map((p) => p.url ? (
                                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className={p.issue ? s.cmpIssue : undefined}
                                        title={`${st.label} · ${sh.label}${p.captured_at ? ` · taken ${fmtDateTime(p.captured_at)}` : ""}${p.issue && p.note ? ` · ${p.note}` : ""}`}>
                                        {/* Signed, short-lived private URLs: next/image would cache them. */}
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={p.url} alt={`${label}, ${sh.label}, ${st.label}`} loading="lazy" />
                                      </a>
                                    ) : <div key={p.id} className={s.cmpMissing}>File missing</div>)}
                                  </div>
                                  <span className="muted">{fmtDateTime(cell[0].captured_at ?? cell[0].uploaded_at)}{cell.length > 2 ? ` · +${cell.length - 2}` : ""}</span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
