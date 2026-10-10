import type { ComponentProps, ReactNode } from "react";
import { cx } from "./button";

/**
 * A labelled field: label (with "optional" or a note on the right), the control, a hint and an error.
 * Wrap any control; Input/Select/Textarea below already carry the right class and sizes
 * (36px with a mouse, 44px on touch).
 */
export function Field({ label, note, hint, error, children, className, as = "label" }: {
  label: ReactNode; note?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; as?: "label" | "div";
}) {
  const Tag = as;
  return (
    <Tag className={cx("field", className)}>
      <span className="field-label">{label}{note && <span className="opt">{note}</span>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </Tag>
  );
}

type ReadOnly = { readOnly?: boolean; display?: ReactNode };

/**
 * Text input. With `readOnly` it renders the value as text (not a greyed box) and keeps a hidden input
 * so the form still submits it.
 */
export function Input({ className, readOnly, display, ...rest }: ComponentProps<"input"> & ReadOnly) {
  if (readOnly && rest.type !== "hidden") {
    const v = rest.value ?? rest.defaultValue;
    return (
      <>
        <span className={cx("ro-value", className?.includes("mono") && "mono")}>{display ?? (v == null ? "" : String(v))}</span>
        {rest.name && <input type="hidden" name={rest.name} value={v == null ? "" : String(v)} />}
      </>
    );
  }
  return <input className={cx("control", className)} {...rest} />;
}

export function Select({ className, readOnly, display, children, ...rest }: ComponentProps<"select"> & ReadOnly) {
  if (readOnly) {
    const v = rest.value ?? rest.defaultValue;
    return (
      <>
        <span className="ro-value">{display ?? (v == null ? "" : String(v))}</span>
        {rest.name && <input type="hidden" name={rest.name} value={v == null ? "" : String(v)} />}
      </>
    );
  }
  return <select className={cx("control", className)} {...rest}>{children}</select>;
}

export function Textarea({ className, readOnly, display, ...rest }: ComponentProps<"textarea"> & ReadOnly) {
  if (readOnly) {
    const v = rest.value ?? rest.defaultValue;
    return <span className="ro-value pre">{display ?? (v == null ? "" : String(v))}</span>;
  }
  return <textarea className={cx("control", className)} {...rest} />;
}

/**
 * On/off switch: a real checkbox with role="switch", so it submits like one (name=value when on,
 * absent when off). `confirmOff` asks before saving when it was on and is turned off (ActionForm).
 */
export function Switch({ label, hideLabel, confirmOff, className, ...rest }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; hideLabel?: boolean; confirmOff?: string }) {
  return (
    <label className={cx("switch", hideLabel && "sr-label", className)}>
      <input type="checkbox" role="switch" data-confirm-off={confirmOff} {...rest} />
      <span>{label}</span>
    </label>
  );
}
