"use client";
import type { LucideIcon } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/admin/action-result";
import { btnClass, cx, Spinner, type ButtonSize, type ButtonVariant } from "./ui/button";
import { useConfirm, useDrawer, type ConfirmOptions } from "./ui/dialog";
import { useToast } from "./ui/toast";

type Props = {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children: ReactNode;
  /**
   * Ask before submitting (destructive or money actions). A string ("Cancel DLO-1? This can’t be
   * undone.") becomes the dialog's title (first sentence) and body; or pass the dialog options.
   */
  confirm?: string | ConfirmOptions;
  /** Force the danger style on the confirmation (otherwise guessed from its words). */
  confirmTone?: "danger" | "default";
  /** The confirm button's label. Defaults to the clicked button's text. */
  confirmLabel?: string;
  className?: string;
  /** Clear the inputs after a successful submit (e.g. a note box). */
  resetOnSuccess?: boolean;
  /** Show an error under the form (results always show as a toast too). */
  inlineResult?: boolean;
  /** Toast the result. On by default. */
  toast?: boolean;
  id?: string;
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

const DANGER = /\b(cancel|delete|remove|lost|retire|block|turn .+ off|turn off|undone|write-off|dispute)\b/i;

/** "Cancel DLO-1 and queue a ₦5,000 refund? This can’t be undone." → title + body. */
function toOptions(messages: string[], o: { danger?: boolean; label?: string }): ConfirmOptions {
  const [first, ...rest] = messages;
  const m = first.match(/^([\s\S]+?[?.!])\s+([\s\S]+)$/);
  const title = m ? m[1] : first;
  const body = [...(m ? [m[2]] : []), ...rest];
  return {
    title,
    body: body.length ? <>{body.map((b, n) => <p key={n}>{b}</p>)}</> : undefined,
    danger: o.danger ?? messages.some((x) => DANGER.test(x)),
    confirmLabel: o.label,
  };
}

/**
 * A form bound to a server action that returns { ok } or { error }. Results show as a toast and in a
 * live region; errors also stay under the form, which keeps its inputs. Asks first (in a dialog) when
 * needed. The action never rejects: a dropped connection or a missing server action (after a deploy)
 * comes back as an error. Inside a Drawer, a success closes it.
 */
export function ActionForm({ action, children, confirm, confirmTone, confirmLabel, className, resetOnSuccess, inlineResult = true, toast: toastOn = true, id }: Props) {
  const toast = useToast();
  const ask = useConfirm();
  const drawer = useDrawer();
  const [state, formAction] = useActionState(async (prev: ActionResult, form: FormData): Promise<ActionResult> => {
    let r: ActionResult;
    try {
      r = await action(prev, form);
    } catch (e) {
      unstable_rethrow(e); // redirect() and notFound() from the action
      console.error("[admin] action didn’t complete:", e);
      r = { error: unreachable() };
    }
    if (toastOn && r?.ok) toast.ok(r.ok);
    if (toastOn && r?.error) toast.error(r.error);
    if (r?.ok && !r.error) drawer?.close();
    return r;
  }, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      id={id}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmed.current) { confirmed.current = false; return; }
        const form = e.currentTarget;
        const asks = confirmations(form, typeof confirm === "string" ? confirm : undefined);
        if (!asks.length && typeof confirm !== "object") return;
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const label = confirmLabel ?? (submitter?.textContent?.trim() && submitter.textContent.trim().length <= 32 ? submitter.textContent.trim() : undefined);
        const opts = typeof confirm === "object"
          ? { ...confirm, body: confirm.body ?? (asks.length ? <>{asks.map((b, n) => <p key={n}>{b}</p>)}</> : undefined), confirmLabel: confirm.confirmLabel ?? label }
          : toOptions(asks, { danger: confirmTone ? confirmTone === "danger" : undefined, label });
        void ask(opts).then((ok) => {
          if (ok) {
            confirmed.current = true;
            form.requestSubmit(submitter && submitter.form === form ? submitter : undefined);
          } else {
            // Put back a switch that was being turned off.
            form.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-confirm-off]").forEach((el) => {
              if (el.defaultChecked && !el.checked) el.checked = true;
            });
          }
        });
      }}
    >
      {children}
      {inlineResult && state?.error && <p className="error" role="alert">{state.error}</p>}
      {/* Always mounted, so screen readers announce a result that appears in it. */}
      <p role="status" aria-live="polite" className="sr-only">{state?.ok ?? (!inlineResult ? state?.error ?? "" : "")}</p>
    </form>
  );
}

/**
 * Submit button that shows a spinner (keeping its label) while the action runs. Pass `className` for
 * the old class-based styling, or `variant`/`size`/`icon`.
 */
export function Submit({ children, className, disabled, name, value, title, variant, size, icon: Icon, block }: {
  children: ReactNode; className?: string; disabled?: boolean; name?: string; value?: string; title?: string;
  variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon; block?: boolean;
}) {
  const { pending } = useFormStatus();
  const cls = className ?? btnClass(variant, size, cx(block && "btn-block"));
  return (
    <button type="submit" className={cls} disabled={disabled || pending} aria-busy={pending || undefined} name={name} value={value} title={title}>
      {pending ? <Spinner /> : Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
