"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/admin/action-result";

type Props = {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children: ReactNode;
  /** Ask before submitting (destructive or money actions). */
  confirm?: string;
  className?: string;
  /** Clear the inputs after a successful submit (e.g. a note box). */
  resetOnSuccess?: boolean;
  /** Show the result message under the form. */
  inlineResult?: boolean;
};

/**
 * A form bound to a server action that returns { ok } or { error }. Shows the message, keeps the inputs
 * on error, and asks for confirmation first when `confirm` is set.
 */
export function ActionForm({ action, children, confirm, className, resetOnSuccess, inlineResult = true }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {inlineResult && state?.error && <p className="error" role="alert">{state.error}</p>}
      {inlineResult && state?.ok && <p className="hint" role="status" style={{ color: "var(--approve)" }}>{state.ok}</p>}
    </form>
  );
}

/** Submit button that disables itself while the action runs. */
export function Submit({ children, className = "btn", disabled, name, value, title }: {
  children: ReactNode; className?: string; disabled?: boolean; name?: string; value?: string; title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending} name={name} value={value} title={title}>
      {pending ? "Saving…" : children}
    </button>
  );
}
