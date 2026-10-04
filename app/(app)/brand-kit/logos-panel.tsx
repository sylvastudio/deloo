"use client";
import { useRef, useState } from "react";
import { analyseLogo, LOGO_TYPES, removeBox, silhouette, type Analysed } from "@/lib/posters/analyse";
import { logoLabel, resolutionNote, type LogoDerivation, type LogoVariant, type ResolvedLogo } from "@/lib/posters/logos";
import type { Palette } from "@/lib/posters/colour";

/** A logo version in the editor. `pending` holds a file that uploads when the kit is saved. */
export type EditLogo = ResolvedLogo & { pending?: Blob };

const MAX_LOGOS = 8, MAX_BYTES = 5 * 1024 * 1024;
const shape = (l: LogoVariant) => { const a = l.w / (l.h || 1); return a > 1.6 ? "Wide" : a < 0.7 ? "Tall" : "Square"; };

type Preview = { from: EditLogo; derivation: LogoDerivation; result: Analysed };
type Props = {
  /** False while the kit's saved logos are still loading: nothing can be changed yet. */
  ready: boolean;
  logos: EditLogo[]; onChange: (next: EditLogo[]) => void; orgId: string; palette: Palette; readOnly: boolean;
  onStatus: (s: { error?: string; notice?: string }) => void;
  /** Called with the first new logo, so the kit can take its colours when it's still on starter colours. */
  onFirstLogo: (src: string) => void;
};

export function LogosPanel({ ready, logos, onChange, orgId, palette, readOnly, onStatus, onFirstLogo }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const update = (id: string, patch: Partial<EditLogo>) => onChange(logos.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, MAX_LOGOS - logos.length);
    if (!list.length) return onStatus({ error: `Up to ${MAX_LOGOS} logo versions. Remove one first.` });
    setBusy(true); onStatus({});
    const added: EditLogo[] = [], problems: string[] = [];
    for (const f of list) {
      const format = LOGO_TYPES[f.type];
      if (!format) { problems.push(`${f.name}: use PNG, JPG, SVG or WebP`); continue; }
      if (f.size > MAX_BYTES) { problems.push(`${f.name}: over 5 MB`); continue; }
      try {
        const a = await analyseLogo(f, format);
        const id = crypto.randomUUID(), hasMain = [...logos, ...added].some((l) => l.kind === "main");
        const squareish = a.meta.w / a.meta.h > .75 && a.meta.w / a.meta.h < 1.35;
        const kind = hasMain && squareish ? "mark" : "main";
        added.push({
          id, path: `${orgId}/logos/${id}.${a.format}`, sha256: a.sha256, kind, includesName: kind === "main",
          treatment: "full_colour", madeFor: "auto", source: "upload", derivedFrom: null, derivation: a.trimmed ? "trim" : null,
          format: a.format, ...a.meta, src: a.dataUrl, pending: a.blob,
        });
      } catch (e) { problems.push(`${f.name}: ${(e as Error).message}`); }
    }
    if (input.current) input.current.value = "";
    setBusy(false);
    if (added.length) {
      onChange([...logos, ...added]);
      if (!logos.length) onFirstLogo(added[0].src);
    }
    onStatus(problems.length ? { error: problems.join(". ") + "." } : { notice: `Added ${added.length} logo${added.length === 1 ? "" : "s"}. Check the questions on each, then save.` });
  }

  async function makeVersion(from: EditLogo, derivation: LogoDerivation) {
    setBusy(true); onStatus({});
    try {
      const blob = derivation === "white_box_removed" ? await removeBox(from.src, from.format, from.opaqueBg ?? "#FFFFFF")
        : await silhouette(from.src, from.format, derivation === "silhouette_white" ? "#FFFFFF" : "#000000");
      setPreview({ from, derivation, result: await analyseLogo(blob, "png") });
    } catch { onStatus({ error: "Couldn't make that version. Try another file." }); }
    finally { setBusy(false); }
  }

  function accept(p: Preview) {
    const id = crypto.randomUUID(), r = p.result;
    const treatment = p.derivation === "silhouette_white" ? "mono_white" : p.derivation === "silhouette_black" ? "mono_black" : p.from.treatment;
    onChange([...logos, {
      ...p.from, id, path: `${orgId}/logos/${id}.png`, sha256: r.sha256, format: "png", ...r.meta, src: r.dataUrl, pending: r.blob,
      source: "derived", derivedFrom: p.from.id, derivation: p.derivation, treatment,
      madeFor: p.derivation === "silhouette_white" ? "dark" : p.derivation === "silhouette_black" ? "light" : "auto",
    }]);
    setPreview(null);
    onStatus({ notice: "Added the new version. Save the kit to approve it." });
  }

  return (
    <section className="card grid gap-3 content-start">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="h2">Logos</h2>
        <span className="hint font-mono">{logos.length ? `${logos.length} version${logos.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      {!ready && <p className="hint" role="status">Loading your logos…</p>}
      {ready && !logos.length && <p className="hint">{readOnly ? "No logo yet." : "No logo yet. Designs show your name instead."}</p>}

      <ul className="logo-cards">
        {logos.map((l, i) => {
          const res = resolutionNote(l);
          return (
            <li key={l.id} className="logo-card">
              <div className="logo-swatches" aria-label="How it looks on light and dark backgrounds">
                {!l.src && <span className="hint" style={{ gridColumn: "1 / -1" }}>Couldn&apos;t load this file. It stays in your kit; remove it or try again later.</span>}
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL of the org's own file */}
                {l.src && <span style={{ background: palette.paper }}><img src={l.src} alt={`${logoLabel(l, i)} on a light background`} /></span>}
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL of the org's own file */}
                {l.src && <span style={{ background: palette.primary }}><img src={l.src} alt={`${logoLabel(l, i)} on your main colour`} /></span>}
              </div>
              <div className="grid gap-2 min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  <span className="badge">{l.alpha ? "See-through background" : l.opaqueBg ? "Solid box behind it" : "No see-through parts"}</span>
                  <span className="badge">{shape(l)}</span>
                  {l.source === "derived" && <span className="badge warm">Made by Deloo from your logo</span>}
                  {l.derivation === "trim" && <span className="badge">Empty margins trimmed</span>}
                </div>
                {res.text && <p className={res.level === "ok" ? "hint" : "error"} style={res.level === "soft" ? { color: "var(--slate)", fontWeight: 400 } : undefined}>{res.text}</p>}
                {readOnly ? (
                  <p className="hint">{logoLabel(l, i)}</p>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <label className="field">
                        <span className="field-label">What is this?</span>
                        <select className="control" value={l.kind} onChange={(e) => update(l.id, { kind: e.target.value as EditLogo["kind"], includesName: e.target.value === "main" ? l.includesName : false })}>
                          <option value="main">Our full logo</option>
                          <option value="mark">Just the icon or crest</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label">Made for</span>
                        <select className="control" value={l.madeFor} onChange={(e) => update(l.id, { madeFor: e.target.value as EditLogo["madeFor"] })}>
                          <option value="auto">Work it out for me</option>
                          <option value="light">Light backgrounds</option>
                          <option value="dark">Dark backgrounds</option>
                        </select>
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={l.includesName} onChange={(e) => update(l.id, { includesName: e.target.checked })} />
                      It shows our name
                    </label>
                    <div className="actions">
                      {l.opaqueBg && l.source === "upload" && <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => makeVersion(l, "white_box_removed")}>Make the background see-through…</button>}
                      {l.alpha && l.treatment === "full_colour" && <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => makeVersion(l, "silhouette_white")}>Make a white version…</button>}
                      {l.alpha && l.treatment === "full_colour" && <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => makeVersion(l, "silhouette_black")}>Make a black version…</button>}
                      <span className="spacer" />
                      <button type="button" className="btn btn-quiet btn-sm" style={{ color: "var(--proof-red)" }} aria-label={`Remove ${logoLabel(l, i)}`} onClick={() => onChange(logos.filter((x) => x.id !== l.id))}>Remove this version</button>
                    </div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {preview && (
        <div className="logo-preview" role="dialog" aria-label="Check the new version">
          <p className="field-label">{preview.derivation === "white_box_removed" ? "Background made see-through. Check nothing inside the logo went missing:" : `A ${preview.derivation === "silhouette_white" ? "white" : "black"} one-colour version. Only use it if your organisation is happy with a one-colour logo:`}</p>
          <div className="logo-swatches">
            {/* eslint-disable-next-line @next/next/no-img-element -- preview of a generated file */}
            <span style={{ background: palette.primary }}><img src={preview.result.dataUrl} alt="New version on your main colour" /></span>
            {/* eslint-disable-next-line @next/next/no-img-element -- preview of a generated file */}
            <span style={{ background: palette.ink }}><img src={preview.result.dataUrl} alt="New version on a dark background" /></span>
            {/* eslint-disable-next-line @next/next/no-img-element -- preview of a generated file */}
            <span style={{ background: palette.paper }}><img src={preview.result.dataUrl} alt="New version on a light background" /></span>
          </div>
          <p className="hint">The original stays in your kit. Deloo never changes your logo without you saying yes here.</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => accept(preview)}>Use this version</button>
            <button type="button" className="btn btn-quiet" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {!readOnly && ready && (
        <>
          <input ref={input} type="file" multiple accept={Object.keys(LOGO_TYPES).join(",")} className="sr-only" id="logo-files" disabled={busy || logos.length >= MAX_LOGOS} onChange={(e) => add(e.target.files)} />
          <div className="actions">
            <label htmlFor="logo-files" className="btn btn-secondary" aria-disabled={busy || logos.length >= MAX_LOGOS}>{busy ? "Working…" : logos.length ? "Add more versions" : "Upload logos"}</label>
          </div>
          <p className="hint">
            Add every version you have: full logo, icon or crest only, a white one for dark backgrounds. PNG, JPG, SVG or WebP, up to 5 MB each.
            On WhatsApp, ask for it to be sent as a <b>Document</b>, not a Photo, so it isn&apos;t shrunk.
          </p>
          <p className="hint">
            Don&apos;t have a good file? <a href={`https://wa.me/?text=${encodeURIComponent("Hello! Please could you send our logo files (PDF, SVG or a large PNG with a see-through background)? Please send them on WhatsApp as a Document, not a Photo, so they stay sharp. Thank you!")}`} target="_blank" rel="noopener noreferrer">Ask your designer or printer on WhatsApp</a>.
          </p>
        </>
      )}
    </section>
  );
}
