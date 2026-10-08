"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { LAGOS_AREAS, VENDOR_TYPES } from "@/lib/areas";
import type { VendorType } from "@/lib/account";
import { completeOnboarding } from "./actions";

const INTENTS = [
  ["rent", "I want to rent equipment", "Tell us about your event and we'll recommend the setup."],
  ["gear", "I have gear to rent out", "List your equipment and get bookings for the days it's free."],
  ["both", "Both", "Your church or business rents out gear and also rents from others."],
] as const;

function toggle(list: string[], k: string) { return list.includes(k) ? list.filter((x) => x !== k) : [...list, k]; }

export function Onboarding() {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [intent, setIntent] = useState<"" | "rent" | "gear" | "both">("");
  const [vendorName, setVendorName] = useState("");
  const [vendorType, setVendorType] = useState<VendorType | "">("");
  const [areas, setAreas] = useState<string[]>([]);
  const [delivery, setDelivery] = useState(false);
  const [technician, setTechnician] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h1.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [step]);

  const gear = intent === "gear" || intent === "both";
  const steps = gear ? 3 : 2;
  function go(n: number) { setError(""); setStep(n); }

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1 && !fullName.trim()) return setError("Add your name.");
    if (step === 1 && phone.replace(/\D/g, "").length < 10) return setError("Add a phone number we can call or WhatsApp.");
    if (step === 2 && !intent) return setError("Choose one. You can change it later.");
    if (step < steps) return go(step + 1);
    if (gear && !vendorName.trim()) return setError("Add the name renters will see.");
    if (gear && !vendorType) return setError("Choose what kind of owner you are.");
    start(async () => {
      const res = await completeOnboarding({
        fullName, phone, rent: intent === "rent" || intent === "both", gear,
        vendor: gear ? { name: vendorName, type: vendorType as VendorType, areas, delivery, technician } : undefined,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <main className="solo">
      <div className="solo-top">
        <p className="wordmark">deloo<span className="dot">.</span></p>
        <div className="flex items-center gap-2.5 font-mono text-[11px] text-slate">
          <span>Step {step} of {steps}</span>
          <span className="block h-1 w-24 overflow-hidden rounded bg-line"><i className="block h-full bg-lagoon transition-all" style={{ width: `${(step / steps) * 100}%` }} /></span>
        </div>
      </div>
      <div className="solo-main">
        <form className="solo-step" onSubmit={next} noValidate>
          {step === 1 && <>
            <p className="kicker">About you</p>
            <h1 className="h1 outline-none" tabIndex={-1} ref={h1}>What should we call you?</h1>
            <div className="field">
              <label className="field-label" htmlFor="name">Your name</label>
              <input className="control" id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="phone">Phone number</label>
              <input className="control" id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <p className="hint">For booking updates and on the day of your event. We never share it until a booking is confirmed.</p>
            </div>
          </>}

          {step === 2 && <>
            <p className="kicker">What brings you here</p>
            <h1 className="h1 outline-none" tabIndex={-1} ref={h1}>How will you use Deloo?</h1>
            <div className="choice-grid" role="radiogroup" aria-label="How will you use Deloo">
              {INTENTS.map(([k, label, desc]) => (
                <button key={k} type="button" role="radio" className="choice" aria-checked={intent === k} onClick={() => setIntent(k)}>
                  <span className="tick">✓</span><span className="c-title">{label}</span><span className="c-desc">{desc}</span>
                </button>
              ))}
            </div>
          </>}

          {step === 3 && <>
            <p className="kicker">Your gear · last step</p>
            <h1 className="h1 outline-none" tabIndex={-1} ref={h1}>Who&apos;s renting it out?</h1>
            <div className="field">
              <label className="field-label" htmlFor="vendor">Name renters will see</label>
              <input className="control" id="vendor" autoComplete="organization" placeholder="e.g. Sound City Rentals" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            </div>
            <div className="choice-grid" role="radiogroup" aria-label="What kind of owner">
              {VENDOR_TYPES.map(([k, label, desc]) => (
                <button key={k} type="button" role="radio" className="choice" aria-checked={vendorType === k} onClick={() => setVendorType(k)}>
                  <span className="tick">✓</span><span className="c-title">{label}</span><span className="c-desc">{desc}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-2">
              <p className="field-label">Areas you serve in Lagos <span className="opt">optional</span></p>
              <div className="flex flex-wrap gap-2">
                {LAGOS_AREAS.map((a) => (
                  <button key={a} type="button" className="chip" aria-pressed={areas.includes(a)} onClick={() => setAreas(toggle(areas, a))}>{a}</button>
                ))}
              </div>
            </div>
            <div className="choice-grid">
              <button type="button" className="choice" aria-pressed={delivery} onClick={() => setDelivery(!delivery)}>
                <span className="tick">✓</span><span className="c-title">We deliver</span><span className="c-desc">You bring the gear to the venue.</span>
              </button>
              <button type="button" className="choice" aria-pressed={technician} onClick={() => setTechnician(!technician)}>
                <span className="tick">✓</span><span className="c-title">We send a technician</span><span className="c-desc">Your staff set up and run it. Needed for LED walls and other high-value gear.</span>
              </button>
            </div>
            <p className="hint">Deloo checks every owner before their gear goes live. We&apos;ll call you about it.</p>
          </>}

          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            {step > 1 && <button type="button" className="btn btn-quiet" onClick={() => go(step - 1)}>Back</button>}
            <span className="spacer" />
            <button type="submit" className="btn" disabled={pending}>{pending ? "Setting up…" : step < steps ? "Continue" : "Finish"}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
