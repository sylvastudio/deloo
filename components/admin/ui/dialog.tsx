"use client";
import { CircleAlert, HelpCircle, X, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { btnClass, cx, type ButtonSize, type ButtonVariant } from "./button";

// ---------------------------------------------------------------------------------------------------
// Confirm dialog: replaces window.confirm. Native <dialog> + showModal(): the page behind is inert,
// focus stays inside, Esc cancels.
// ---------------------------------------------------------------------------------------------------

export type ConfirmOptions = {
  title: string;
  /** What happens: amounts, who is affected, whether it can be undone. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
const ConfirmCtx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const answered = useRef(false);
  const id = useId();

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    answered.current = false;
    setPending({ ...o, resolve });
  }), []);

  useEffect(() => {
    const d = ref.current;
    if (pending && d && !d.open) d.showModal();
  }, [pending]);

  const finish = (ok: boolean) => {
    if (answered.current) return;
    answered.current = true;
    pending?.resolve(ok);
    ref.current?.close();
    setPending(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <dialog ref={ref} className={cx("adm-dialog", pending?.danger && "danger")} aria-labelledby={`${id}-t`} aria-describedby={pending?.body ? `${id}-b` : undefined}
        onClose={() => finish(false)} onCancel={() => finish(false)}>
        {pending && (
          <>
            <div className="dlg-body">
              <span className="dlg-icon" aria-hidden="true">{pending.danger ? <CircleAlert /> : <HelpCircle />}</span>
              <h2 id={`${id}-t`}>{pending.title}</h2>
              {pending.body && <div id={`${id}-b`} className="grid gap-2">{pending.body}</div>}
            </div>
            <div className="dlg-foot">
              {/* Cancel takes focus first: Enter on a dangerous dialog shouldn't do the dangerous thing. */}
              <button type="button" className={btnClass("secondary")} onClick={() => finish(false)} autoFocus>{pending.cancelLabel ?? "Cancel"}</button>
              <button type="button" className={btnClass(pending.danger ? "danger" : "primary")} onClick={() => finish(true)}>{pending.confirmLabel ?? "Continue"}</button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmCtx.Provider>
  );
}

/** Ask before doing something. Resolves true when confirmed. Falls back to window.confirm outside the shell. */
export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const c = useContext(ConfirmCtx);
  return useMemo(() => c ?? ((o: ConfirmOptions) => Promise.resolve(window.confirm(o.title))), [c]);
}

// ---------------------------------------------------------------------------------------------------
// Drawer: a side panel on desktop, a bottom sheet on phones. For row actions and editing one record
// without leaving the list. Forms inside close it when they succeed (ActionForm reads useDrawer).
// ---------------------------------------------------------------------------------------------------

const DrawerCtx = createContext<{ close: () => void } | null>(null);
export const useDrawer = () => useContext(DrawerCtx);

export type DrawerTrigger = { label: string; icon?: LucideIcon; variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean; className?: string };

export function Drawer({ trigger, title, description, children, open: openProp, onOpenChange }: {
  trigger?: DrawerTrigger; title: ReactNode; description?: ReactNode; children: ReactNode;
  /** Controlled mode (e.g. the phone "More" sheet). */
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = useCallback((v: boolean) => { setInner(v); onOpenChange?.(v); }, [onOpenChange]);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const ctx = useMemo(() => ({ close: () => setOpen(false) }), [setOpen]);
  const T = trigger;
  const Icon = T?.icon;

  return (
    <>
      {T && (
        <button type="button" className={btnClass(T.variant ?? "secondary", T.size ?? "sm", cx(T.iconOnly && "icon-btn", T.iconOnly && (T.variant ?? "ghost") === "ghost" && "neutral", T.className))}
          onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={T.iconOnly ? T.label : undefined} title={T.iconOnly ? T.label : undefined}>
          {Icon && <Icon aria-hidden="true" />}{!T.iconOnly && T.label}
        </button>
      )}
      <dialog ref={ref} className="adm-drawer" aria-labelledby={`${id}-t`} onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); /* click on the backdrop */ }}>
        {open && (
          <DrawerCtx.Provider value={ctx}>
            <div className="dr-head">
              <div className="grid gap-1 min-w-0">
                <h2 id={`${id}-t`}>{title}</h2>
                {description && <p>{description}</p>}
              </div>
              <button type="button" className={btnClass("ghost", "md", "icon-btn neutral")} onClick={() => setOpen(false)} aria-label="Close"><X aria-hidden="true" /></button>
            </div>
            <div className="dr-body">{children}</div>
          </DrawerCtx.Provider>
        )}
      </dialog>
    </>
  );
}
