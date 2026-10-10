"use client";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "ok" | "bad" | "info";
type Item = { id: number; tone: ToastTone; message: string };
type Api = {
  /** Show a toast. `announce`: also read it out (forms already announce through their own live region). */
  show: (message: string, tone?: ToastTone, opts?: { announce?: boolean }) => void;
  ok: (message: string, opts?: { announce?: boolean }) => void;
  error: (message: string, opts?: { announce?: boolean }) => void;
};

const Ctx = createContext<Api | null>(null);
const ICON = { ok: CircleCheck, bad: CircleAlert, info: Info } as const;

/**
 * Toasts for the staff portal: bottom right on desktop, above the bottom nav on phones. Success goes
 * after 5 s, errors after 10 s (or when dismissed). Max 3 at a time.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [spoken, setSpoken] = useState("");
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback((message: string, tone: ToastTone = "info", opts?: { announce?: boolean }) => {
    if (!message) return;
    const id = next.current++;
    setItems((l) => [...l.filter((t) => t.message !== message), { id, tone, message }].slice(-3));
    if (opts?.announce) setSpoken(message);
    window.setTimeout(() => dismiss(id), tone === "bad" ? 10_000 : 5_000);
  }, [dismiss]);
  const api = useMemo<Api>(() => ({
    show,
    ok: (m, o) => show(m, "ok", o),
    error: (m, o) => show(m, "bad", o),
  }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts">
        {items.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} className="toast" data-tone={t.tone}>
              <Icon aria-hidden="true" />
              <span className="t-msg">{t.message}</span>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X aria-hidden="true" /></button>
            </div>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{spoken}</p>
    </Ctx.Provider>
  );
}

const NOOP: Api = { show: () => {}, ok: () => {}, error: () => {} };

/** The toast API (a no-op outside the admin shell). */
export function useToast(): Api {
  return useContext(Ctx) ?? NOOP;
}
