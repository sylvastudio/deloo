"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createOrganisation } from "./actions";

type Category = { key: string; label: string; description: string; available: boolean };
type Template = { key: string; name: string; description: string };

// Same choices as the Phase 1 prototype onboarding.
const ORG_TYPES = [
  ["church", "Church or ministry"], ["school", "School or campus"], ["ngo", "NGO or charity"], ["business", "Business or brand"],
  ["association", "Association or alumni"], ["events", "Event organiser"], ["other", "Something else"],
] as const;
const STRUCTURES = [
  ["single", "Just one", "One location or team."],
  ["branches", "Branches or campuses", "Several locations that each publish."],
  ["units", "Departments or units", "Youth, choir, media, cells…"],
] as const;
const COMING_SOON = ["Speaker line-up", "Celebration of Life", "Thanksgiving service", "Naming ceremony", "Wedding & aso-ebi", "Back-to-school", "Product launch", "Countdown reel"];
const STEPS = 4;

function toggle(list: string[], k: string) { return list.includes(k) ? list.filter((x) => x !== k) : [...list, k]; }

export function Onboarding({ categories, templates }: { categories: Category[]; templates: Template[] }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [typeOther, setTypeOther] = useState("");
  const [structure, setStructure] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [requests, setRequests] = useState<{ name: string; description: string }[]>([]);
  const [reqName, setReqName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h1.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [step]);
  function go(n: number) { setError(""); setStep(n); }

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1 && !name.trim()) return setError("Add your organisation's name. It goes on your designs.");
    if (step === 1 && !orgType) return setError('Choose the closest match, or pick "Something else".');
    if (step === 2 && !structure) return setError("Choose one. You can change it later.");
    if (step === 3 && !types.length) return setError("Pick at least one type you can make today. Your requests are saved for later.");
    if (step < STEPS) return go(step + 1);
    if (!styles.length) return setError("Pick at least one style. You can try the others any time.");
    start(async () => {
      const res = await createOrganisation({
        name, orgType: orgType === "other" ? typeOther.trim() || "other" : orgType, structure,
        categories: types, templates: styles, requests,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <main className="solo">
      <div className="solo-top">
        <p className="wordmark">deloo<span className="dot">.</span></p>
        <div className="flex items-center gap-2.5 font-mono text-[11px] text-slate">
          <span>Step {step} of {STEPS}</span>
          <span className="block h-1 w-24 overflow-hidden rounded bg-line"><i className="block h-full bg-lagoon transition-all" style={{ width: `${(step / STEPS) * 100}%` }} /></span>
        </div>
      </div>
      <div className="solo-main">
        <form className={`solo-step ${step >= 3 ? "wide" : ""}`} onSubmit={next} noValidate>
          {step === 1 && <>
            <p className="kicker">About you</p>
            <h1 className="h1 outline-none" tabIndex={-1} ref={h1}>What&apos;s your organisation called?</h1>
            <div className="field">
              <label className="field-label" htmlFor="org-name">Organisation name</label>
              <input className="control" id="org-name" autoComplete="organization" placeholder="e.g. Grace Harbour Chapel" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <p className="field-label" id="org-type-label">What kind of organisation is it?</p>
            <div className="choice-grid" role="radiogroup" aria-labelledby="org-type-label">
              {ORG_TYPES.map(([k, label]) => (
                <button key={k} type="button" role="radio" className="choice" aria-checked={orgType === k} onClick={() => setOrgType(k)}>
                  <span className="tick">✓</span><span className="c-title">{label}</span>
                </button>
              ))}
            </div>
            {orgType === "other" && (
              <div className="field"><label className="field-label" htmlFor="org-other">Tell us what kind</label>
                <input className="control" id="org-other" placeholder="e.g. Sports club" value={typeOther} onChange={(e) => setTypeOther(e.target.value)} /></div>
            )}
          </>}

          {step === 2 && <>
            <p className="kicker">How you&apos;re set up</p>
            <h1 className="h1 outline-none" tabIndex={-1} ref={h1}>Does {name.trim()} have branches or departments?</h1>
            <p className="hint" style={{ fontSize: 15 }}>If it does, HQ sets the brand once, and each branch or department makes its own designs without breaking it.</p>
            <div className="choice-grid" role="radiogroup" aria-label="How you're set up">
              {STRUCTURES.map(([k, label, desc]) => (
                <button key={k} type="button" role="radio" className="choice" aria-checked={structure === k} onClick={() => setStructure(k)}>
                  <span className="tick">✓</span><span className="c-title">{label}</span><span className="c-desc">{desc}</span>
                </button>
              ))}
            </div>
          </>}

          {step === 3 && <>
            <p className="kicker">What you make</p>
            <h1 className="h1 outline-none" tabIndex={-1} ref={h1}>What would you like to make?</h1>
            <p className="hint" style={{ fontSize: 15 }}>Pick everything that fits. More types are on the way.</p>
            <div className="choice-grid">
              {categories.filter((c) => c.available).map((c) => (
                <button key={c.key} type="button" className="choice" aria-pressed={types.includes(c.key)} onClick={() => setTypes(toggle(types, c.key))}>
                  <span className="tick">✓</span><span className="c-title">{c.label}</span><span className="c-desc">{c.description}</span>
                </button>
              ))}
            </div>
            <p className="field-label">Coming soon</p>
            <div className="flex flex-wrap gap-2">{COMING_SOON.map((s) => <span key={s} className="badge">{s}</span>)}</div>
            <div className="card grid gap-2.5">
              <label className="field-label" htmlFor="req">Need something else? <span className="opt">optional</span></label>
              <div className="flex gap-2">
                <input className="control" id="req" placeholder="e.g. Church bulletin" value={reqName} onChange={(e) => setReqName(e.target.value)} />
                <button type="button" className="btn btn-secondary" onClick={() => { if (reqName.trim()) { setRequests([...requests, { name: reqName.trim(), description: "" }]); setReqName(""); } }}>Request</button>
              </div>
              {requests.length > 0 && <p className="hint" aria-live="polite">Requested: {requests.map((r) => r.name).join(", ")}</p>}
            </div>
          </>}

          {step === 4 && <>
            <p className="kicker">Your look · last step</p>
            <h1 className="h1 outline-none" tabIndex={-1} ref={h1}>Which styles feel like {name.trim()}?</h1>
            <p className="hint" style={{ fontSize: 15 }}>Choose your favourites and Deloo leads with them. Every style uses your brand colours.</p>
            <div className="choice-grid">
              {templates.map((t) => (
                <button key={t.key} type="button" className="choice" aria-pressed={styles.includes(t.key)} onClick={() => setStyles(toggle(styles, t.key))}>
                  <span className="tick">✓</span><span className="c-title">{t.name}</span><span className="c-desc">{t.description}</span>
                </button>
              ))}
            </div>
          </>}

          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            {step > 1 && <button type="button" className="btn btn-quiet" onClick={() => go(step - 1)}>Back</button>}
            <span className="spacer" />
            <button type="submit" className="btn" disabled={pending}>{pending ? "Setting up your studio…" : step < STEPS ? "Continue" : "Finish setup"}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
