"use client";
import { unstable_rethrow } from "next/navigation";
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

/** What the form says when the action never answered (no signal, server down, or a new deploy). */
export function unreachable(): string {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "You’re offline. Try again when you have signal."
    : "Couldn’t reach Deloo. Check your signal and try again. If the page was just updated, reload it.";
}

/**
 * Everything the form should ask before it submits: the `confirm` prop, any element inside with a
 * `data-confirm` message (e.g. a field whose value makes the action destructive), and any checkbox with
 * `data-confirm-off` that was on and is now being turned off.
 */
function confirmations(form: HTMLFormElement, confirm?: string): string[] {
  const out = confirm ? [confirm] : [];
  form.querySelectorAll<HTMLElement>("[data-confirm]").forEach((el) => {
    if (el.dataset.confirm) out.push(el.dataset.confirm);
  });
  form.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-confirm-off]").forEach((el) => {
    if (el.defaultChecked && !el.checked && el.dataset.confirmOff) out.push(el.dataset.confirmOff);
  });
  return out;
}

/**
 * A form bound to a server action that returns { ok } or { error }. Shows the message, keeps the inputs
 * on error, and asks for confirmation first when needed. The action never rejects: a dropped connection
 * or a missing server action (after a deploy) comes back as an error message on the form.
 */
export function ActionForm({ action, children, confirm, className, resetOnSuccess, inlineResult = true }: Props) {
  const [state, formAction] = useActionState(async (prev: ActionResult, form: FormData): Promise<ActionResult> => {
    try {
      return await action(prev, form);
    } catch (e) {
      unstable_rethrow(e); // redirect() and notFound() from the action
      console.error("[admin] action didn’t complete:", e);
      return { error: unreachable() };
    }
  }, undefined);
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
        const ask = confirmations(e.currentTarget, confirm);
        if (ask.length && !window.confirm(ask.join("\n\n"))) e.preventDefault();
      }}
    >
      {children}
      {inlineResult && state?.error && <p className="error" role="alert">{state.error}</p>}
      {/* Always mounted, so screen readers announce a result that appears in it. */}
      <p role="status" aria-live="polite" className={inlineResult && state?.ok ? "hint" : "sr-only"} style={inlineResult && state?.ok ? { color: "var(--approve)" } : undefined}>
        {state?.ok ?? (!inlineResult ? state?.error ?? "" : "")}
      </p>
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
