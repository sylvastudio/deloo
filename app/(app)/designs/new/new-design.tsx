"use client";
import { useRef, useState, useTransition } from "react";
import { getCategory, type Category } from "@/lib/catalog";
import { createBrief } from "../actions";
import { FieldsEditor } from "../fields";

type Step = "brief" | "details";

export function NewDesign({ categories }: { categories: Category[] }) {
  const [type, setType] = useState<Category | null>(categories.length === 1 ? categories[0] : null);
  const [brief, setBrief] = useState("");
  const [step, setStep] = useState<Step>("brief");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [found, setFound] = useState<string[] | undefined>();
  const [unplaced, setUnplaced] = useState<string[]>([]);
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const [showErrors, setShowErrors] = useState(false);
  const [reading, setReading] = useState(false);
  const [pending, start] = useTransition();
  const detailsRef = useRef<HTMLHeadingElement>(null);

  function goDetails() { setStep("details"); setTimeout(() => detailsRef.current?.focus(), 0); }

  async function read() {
    if (!type) return setMessage({ error: "Choose what you're making first." });
    if (!brief.trim()) return setMessage({ error: "Describe it first, the way you'd text it to the media team." });
    setReading(true); setMessage({});
    try {
      const res = await fetch("/api/understand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief, category: type.key }) });
      const data = await res.json();
      if (!res.ok) { setMessage({ error: data.error ?? "Couldn't read that. Fill in the details yourself." }); setFields({}); setFound(undefined); setUnplaced([]); }
      else {
        setFields(data.fields ?? {}); setFound(Object.keys(data.fields ?? {})); setUnplaced(data.unplaced ?? []);
        setMessage({ notice: "Here's what I found. Check it, fill any gaps, then make the design." });
      }
      goDetails();
    } catch {
      setMessage({ error: "Couldn't reach Deloo. Check your connection, or fill in the details yourself." });
      goDetails();
    } finally { setReading(false); }
  }

  function make(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return;
    setShowErrors(true);
    if (type.schema.fields.some((f) => f.required && !fields[f.key]?.trim())) return setMessage({ error: "Fill in the required details first." });
    start(async () => {
      const res = await createBrief({ category: type.key, rawText: brief, fields });
      if (res?.error) setMessage({ error: res.error });
    });
  }

  return (
    <div className="grid gap-4" style={{ maxWidth: 640 }}>
      <section className="card grid gap-3">
        <h2 className="h2">1. What are you making?</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Design type">
          {categories.map((c) => (
            <button key={c.key} type="button" className="chip" aria-pressed={type?.key === c.key} disabled={step === "details"}
              onClick={() => { setType(c); setMessage({}); }}>{c.label}</button>
          ))}
        </div>
        {type && <p className="hint">{type.description}</p>}
      </section>

      <section className="card grid gap-3">
        <h2 className="h2">2. Describe it</h2>
        <div className="field">
          <label className="field-label" htmlFor="brief">Write it the way you&apos;d text it. Deloo picks out the details and never makes any up.</label>
          <textarea id="brief" className="control" rows={4} value={brief} readOnly={step === "details"} maxLength={2000}
            placeholder={type?.schema.example ?? "Youth conference, 3 Oct, guest speaker Pastor Tolu Adeyemi, theme Rise and Shine, 4pm at the Main Auditorium"}
            onChange={(e) => { setBrief(e.target.value); setMessage({}); }} />
        </div>
        {step === "brief" ? (
          <div className="actions">
            <button type="button" className="btn btn-generate" onClick={read} disabled={reading || !type}>{reading ? "Reading…" : "Read my brief"}</button>
            <button type="button" className="btn btn-quiet" disabled={!type} onClick={() => { setFound(undefined); setUnplaced([]); setMessage({}); goDetails(); }}>Fill it in myself</button>
          </div>
        ) : (
          <div><button type="button" className="btn btn-quiet btn-sm" onClick={() => { setStep("brief"); setShowErrors(false); setMessage({}); }}>Change the brief or type</button></div>
        )}
        {step === "brief" && message.error && <p className="error" role="alert">{message.error}</p>}
      </section>

      {step === "details" && type && (
        <form className="card grid gap-3" onSubmit={make} noValidate>
          <h2 className="h2" ref={detailsRef} tabIndex={-1}>3. Check the details</h2>
          {message.notice && <p className="notice" role="status">{message.notice}</p>}
          {message.error && <p className="error" role="alert">{message.error}</p>}
          {unplaced.length > 0 && <p className="hint">I couldn&apos;t place: {unplaced.map((u) => `“${u}”`).join(", ")}. Add them to a field if they matter.</p>}
          <FieldsEditor category={getCategory(type.key)!} values={fields} found={found} showErrors={showErrors}
            onChange={(k, v) => setFields((f) => ({ ...f, [k]: v }))} />
          <div className="actions"><button type="submit" className="btn btn-generate" disabled={pending}>{pending ? "Making it…" : "Make the design"}</button></div>
        </form>
      )}
    </div>
  );
}
