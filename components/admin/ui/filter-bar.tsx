"use client";
import { Search } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";

export type FilterSelect = { name: string; label: string; value: string; options: { value: string; label: string }[]; anyLabel?: string };
export type FilterDate = { name: string; label: string; value: string };

/**
 * A GET form over a list. Selects and dates apply as soon as they change; the search box applies on
 * Enter. Changing a filter drops the page number. `hidden` carries params to keep (e.g. the saved view).
 */
export function FilterBar({ action, search, selects = [], dates = [], hidden = {}, children }: {
  action: string;
  search?: { name: string; value: string; placeholder: string; label: string; autoFocus?: boolean };
  selects?: FilterSelect[];
  dates?: FilterDate[];
  hidden?: Record<string, string>;
  children?: ReactNode;
}) {
  const onChange = (e: ChangeEvent<HTMLFormElement>) => {
    const t = e.target as unknown as HTMLInputElement | HTMLSelectElement;
    if (t.tagName === "SELECT" || t.type === "date" || t.type === "checkbox") e.currentTarget.requestSubmit();
  };
  return (
    <div className="filterbar">
      <form method="get" action={action} role="search" onChange={onChange}>
        {Object.entries(hidden).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {search && (
          <label className="search">
            <span className="sr-only">{search.label}</span>
            <Search aria-hidden="true" />
            <input className="control" type="search" name={search.name} defaultValue={search.value} placeholder={search.placeholder} enterKeyHint="search" autoFocus={search.autoFocus} />
          </label>
        )}
        {selects.map((s) => (
          <label key={s.name}>
            <span className="sr-only">{s.label}</span>
            <select className="control" name={s.name} defaultValue={s.value} aria-label={s.label}>
              <option value="">{s.anyLabel ?? `Any ${s.label.toLowerCase()}`}</option>
              {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
        {dates.map((d) => (
          <label key={d.name} className="flabel">
            {d.label}
            <input className="control" type="date" name={d.name} defaultValue={d.value} />
          </label>
        ))}
        {children}
        <button type="submit" className="sr-only">Apply filters</button>
      </form>
    </div>
  );
}

/**
 * Wraps a control (a Switch, a select) that should save its form the moment it changes, e.g. the
 * inventory "Listed" switch. ActionForm still asks first when the control says so (data-confirm-off).
 */
export function AutoSubmit({ children }: { children: ReactNode }) {
  return (
    <span className="contents" onChange={(e) => (e.target as HTMLInputElement).form?.requestSubmit()}>
      {children}
    </span>
  );
}
