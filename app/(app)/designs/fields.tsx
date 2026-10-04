"use client";
import type { Category } from "@/lib/catalog";

type Props = {
  category: Category;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** After the AI has read a brief: which fields it filled. Undefined hides the found/not-found tags. */
  found?: string[];
  showErrors?: boolean;
  readOnly?: boolean;
  idPrefix?: string;
};

/** One input per field of the poster type. Required fields are marked; nothing here is ever invented. */
export function FieldsEditor({ category, values, onChange, found, showErrors, readOnly, idPrefix = "f" }: Props) {
  return (
    <div className="grid gap-3">
      {category.schema.fields.map((f) => {
        const id = `${idPrefix}-${f.key}`, v = values[f.key] ?? "", bad = !!showErrors && f.required && !v.trim();
        const tag = found && (found.includes(f.key) ? <span className="found yes">found</span> : !v ? <span className="found no">not found</span> : null);
        const common = {
          id, className: "control", value: v, readOnly, placeholder: f.placeholder ?? "", "aria-invalid": bad,
          "aria-describedby": bad ? `${id}-e` : undefined,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(f.key, e.target.value),
        };
        return (
          <div className="field" key={f.key}>
            <label className="field-label" htmlFor={id}>
              <span>{f.label}{!f.required && <> <span className="opt">optional</span></>}</span>{tag}
            </label>
            {f.long ? <textarea {...common} /> : <input {...common} />}
            {f.hint && <p className="hint">{f.hint}</p>}
            {bad && <p className="error" id={`${id}-e`}>{f.key === "date" ? "Add the date so it prints on every size." : "Deloo needs this one."}</p>}
          </div>
        );
      })}
    </div>
  );
}
