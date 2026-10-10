"use client";
import { useId, useState } from "react";

type Row = { key: string; value: string };

const toText = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
/** "4" → 4, "true" → true, anything else stays text. The planner reads typed values. */
function typed(v: string): unknown {
  const s = v.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s !== "" && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/** Key/value editor for items.specs, serialised into one hidden `specs` JSON input. */
export function SpecsEditor({ initial, suggestions, name = "specs", disabled }: {
  initial: Record<string, unknown>; suggestions: { key: string; label: string; type?: string; options?: string[] }[]; name?: string; disabled?: boolean;
}) {
  const id = useId();
  const [rows, setRows] = useState<Row[]>(() => {
    const r = Object.entries(initial ?? {}).map(([key, v]) => ({ key, value: toText(v) }));
    return r.length ? r : [{ key: "", value: "" }];
  });
  const json = JSON.stringify(Object.fromEntries(rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), typed(r.value)])));
  const missing = suggestions.filter((s) => !rows.some((r) => r.key.trim() === s.key));
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={json} />
      <datalist id={`${id}-keys`}>{suggestions.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</datalist>
      {rows.map((r, i) => {
        const hint = suggestions.find((s) => s.key === r.key.trim());
        return (
          <div key={i} className="kv-row">
            <input className="control" list={`${id}-keys`} value={r.key} placeholder="key (e.g. grade)" aria-label="Spec key"
              onChange={(e) => set(i, { key: e.target.value })} disabled={disabled} />
            <input className="control" value={r.value} aria-label={`Value for ${r.key || "spec"}`} disabled={disabled}
              placeholder={hint ? [hint.label, hint.type === "boolean" ? "true / false" : hint.options?.join(" / ")].filter(Boolean).join(": ") : "value"}
              onChange={(e) => set(i, { value: e.target.value })} />
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))} disabled={disabled} aria-label="Remove spec">Remove</button>
          </div>
        );
      })}
      <div className="actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((rs) => [...rs, { key: "", value: "" }])} disabled={disabled}>Add spec</button>
        {missing.length > 0 && !disabled && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRows((rs) => [...rs.filter((r) => r.key.trim()), ...missing.map((m) => ({ key: m.key, value: "" }))])}>
            Add the category’s fields ({missing.map((m) => m.key).join(", ")})
          </button>
        )}
      </div>
      <p className="hint">Numbers and true/false are stored as such; the planner reads these keys.</p>
    </div>
  );
}
