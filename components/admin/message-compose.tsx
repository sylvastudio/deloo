"use client";
import { Send } from "lucide-react";
import { useState } from "react";
import { queueMessage } from "@/app/admin/_actions/messages";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { fillPlaceholders, STAFF_TEMPLATES, type MessageVars, type StaffTemplateKey } from "@/lib/notify/staff-templates";

type Props = {
  bookingId: string | null;
  userId: string;
  /** Who it goes to, e.g. "DLO-1234 · Ada Obi". */
  label: string;
  vars: Partial<MessageVars>;
  /** Smaller text box (the booking page). */
  compact?: boolean;
};

/**
 * Write an email to a renter: pick a starting template (filled from the booking), edit, queue. The
 * sender picks it up within 15 minutes (or straight away with Send now).
 */
export function MessageCompose({ bookingId, userId, label, vars, compact }: Props) {
  const templates = STAFF_TEMPLATES.filter((t) => bookingId || !t.needsBooking);
  const start = templates.find((t) => t.key === (bookingId ? "payment_retry" : "custom")) ?? templates[0];
  const [key, setKey] = useState<StaffTemplateKey>(start.key);
  const [subject, setSubject] = useState(() => fillPlaceholders(start.subject, vars));
  const [body, setBody] = useState(() => fillPlaceholders(start.body, vars));

  function pick(next: StaffTemplateKey) {
    const t = STAFF_TEMPLATES.find((x) => x.key === next);
    if (!t) return;
    setKey(next);
    setSubject(fillPlaceholders(t.subject, vars));
    setBody(fillPlaceholders(t.body, vars));
  }

  return (
    <ActionForm action={queueMessage} className="grid gap-3">
      {bookingId ? <input type="hidden" name="booking_id" value={bookingId} /> : <input type="hidden" name="user_id" value={userId} />}
      <p className="muted">To <b className="text-[var(--fg)]">{label}</b></p>
      <label className="field">
        <span className="field-label">Start from</span>
        <select className="control" value={key} onChange={(e) => pick(e.target.value as StaffTemplateKey)}>
          {templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Subject</span>
        <input className="control" name="subject" required minLength={3} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Message <span className="opt">plain text; a blank line starts a new paragraph</span></span>
        <textarea className="control" name="body" required minLength={3} maxLength={5000} rows={compact ? 5 : 9} value={body}
          onChange={(e) => setBody(e.target.value)} />
      </label>
      <p className="hint">
        {bookingId ? "A See your booking button is added at the end. " : ""}
        You can use {"{first}"}{bookingId ? ", {ref}, {dates}, {items}, {total}" : ""}. It goes out within 15 minutes.
      </p>
      <div className="actions"><Submit icon={Send}>Queue email</Submit></div>
    </ActionForm>
  );
}
