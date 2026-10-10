import Link from "next/link";
import { cancelMessage, retryMessage, sendNow } from "@/app/admin/_actions/messages";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Chip } from "@/components/admin/ui";
import { fmtDateTime, nowMs } from "@/lib/admin/format";
import { MESSAGE_KIND_LABEL, MESSAGE_STATUS_LABEL, MESSAGE_STATUS_TONE, preview, type MessageRow } from "@/lib/admin/messages";

/** When a message went, or when it is due. */
function when(r: MessageRow) {
  if (r.status === "sent" && r.sent_at) return { label: "Sent", at: r.sent_at };
  if (r.status === "cancelled" && r.cancelled_at) return { label: "Cancelled", at: r.cancelled_at };
  if (r.status === "queued") return { label: Date.parse(r.send_after) <= nowMs() ? "Due" : "Goes", at: r.send_after };
  if (r.status === "failed") return { label: "Last try", at: r.send_after };
  return { label: "Was due", at: r.send_after };
}

/**
 * The outbox as a table: when, to, kind, subject, booking, status, tries. Each row opens a preview of
 * the text exactly as the sender writes it. Staff with messages.send get Retry (failed, cancelled) and
 * Cancel (queued). `names` maps staff user ids to display names (who wrote, cancelled, retried).
 */
export function MessageList({ rows, canSend, names, showBooking = true }: {
  rows: MessageRow[]; canSend: boolean; names: Map<string, string>; showBooking?: boolean;
}) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>When (Lagos)</th><th>To</th><th>Kind</th><th>Subject</th>{showBooking && <th>Booking</th>}<th>Status</th>{canSend && <th><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const w = when(r);
            const p = preview(r);
            const by = r.kind === "custom" ? (r.payload?.sent_by_name || (r.created_by && names.get(r.created_by)) || "Staff") : "";
            return (
              <tr key={r.id}>
                <td className="small" style={{ whiteSpace: "nowrap" }}>
                  <span className="muted">{w.label}</span><div>{fmtDateTime(w.at)}</div>
                </td>
                <td className="small" style={{ maxWidth: 220 }}>
                  <Link className="rowlink" href={`/admin/customers/${r.user_id}`}>{r.full_name || "Renter"}</Link>
                  {r.email && <div className="muted mono" style={{ overflowWrap: "anywhere" }}>{r.email}</div>}
                </td>
                <td className="small">
                  {MESSAGE_KIND_LABEL[r.kind] ?? r.kind}
                  {by && <div className="muted">by {by}</div>}
                </td>
                <td className="small" style={{ minWidth: 200, maxWidth: 360 }}>
                  <details className="inline">
                    <summary style={{ color: "var(--ink)" }}>{p.subject || <span className="muted">(no subject)</span>}</summary>
                    <pre className="small" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "8px 0 0", padding: 10, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 6 }}>
                      {p.text || "Preview not available."}
                    </pre>
                  </details>
                </td>
                {showBooking && (
                  <td className="small">
                    {r.booking_id ? <Link className="rowlink mono" href={`/admin/bookings/${r.booking_id}`}>{r.ref ?? r.booking_id.slice(0, 8)}</Link> : <span className="muted">None</span>}
                  </td>
                )}
                <td className="small" style={{ maxWidth: 240 }}>
                  <Chip tone={MESSAGE_STATUS_TONE[r.status] ?? "neutral"}>{MESSAGE_STATUS_LABEL[r.status] ?? r.status}</Chip>
                  {r.attempts > 0 && <div className="muted">{r.attempts} {r.attempts === 1 ? "try" : "tries"}</div>}
                  {r.error && <div className="muted" style={{ overflowWrap: "anywhere" }} title={r.error}>{r.error.length > 120 ? `${r.error.slice(0, 117)}…` : r.error}</div>}
                  {r.cancelled_by && r.status === "cancelled" && <div className="muted">by {names.get(r.cancelled_by) ?? "staff"}</div>}
                  {r.retried_by && r.retried_at && <div className="muted">Retried by {names.get(r.retried_by) ?? "staff"}, {fmtDateTime(r.retried_at)}</div>}
                </td>
                {canSend && (
                  <td className="small" style={{ whiteSpace: "nowrap" }}>
                    {(r.status === "failed" || r.status === "cancelled") && (
                      <ActionForm action={retryMessage} confirm={`Send "${p.subject}" to ${r.full_name || "this renter"} again?`}>
                        <input type="hidden" name="id" value={r.id} />
                        <Submit className="btn btn-secondary btn-sm">Retry</Submit>
                      </ActionForm>
                    )}
                    {r.status === "queued" && (
                      <ActionForm action={cancelMessage} confirm={`Cancel "${p.subject}"? It won’t be sent.`}>
                        <input type="hidden" name="id" value={r.id} />
                        <Submit className="btn btn-quiet btn-sm">Cancel</Submit>
                      </ActionForm>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Runs the sender now (server side) instead of waiting for the 15-minute schedule. */
export function SendNow({ label = "Send now" }: { label?: string }) {
  return (
    <ActionForm action={sendNow} className="grid gap-1">
      <div className="actions"><Submit className="btn btn-secondary btn-sm" title="Send everything that's due now, instead of waiting for the next run">{label}</Submit></div>
    </ActionForm>
  );
}
