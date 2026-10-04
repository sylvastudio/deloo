"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Poster } from "@/components/poster";
import { getCategory } from "@/lib/catalog";
import { buildPalette, extractColors, HEX, PRESETS } from "@/lib/posters/colour";
import { urlToDataURL } from "@/lib/posters/export";
import { SAMPLES, SIZES, STYLE_ORDER, STYLES, toContent, type StyleKey } from "@/lib/posters/render";
import { createClient } from "@/lib/supabase/client";
import type { Kit, ColourSource } from "@/lib/kit";
import { saveKit } from "./actions";

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp" };
const MAX_LOGO = 5 * 1024 * 1024;
const SOURCE_LABEL: Record<ColourSource, string> = { default: "starter colours", logo: "from your logo", custom: "your choice" };

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

type Props = { kit: Kit; orgId: string; orgName: string; readOnly: boolean; styles: StyleKey[]; categories: string[] };

export function BrandKitEditor({ kit, orgId, orgName, readOnly, styles, categories }: Props) {
  const [primary, setPrimary] = useState(kit.colours.primary);
  const [accent, setAccent] = useState(kit.colours.accent);
  const [source, setSource] = useState<ColourSource>(kit.colourSource);
  const [tone, setTone] = useState(kit.tone);
  const [grain, setGrain] = useState(kit.grain);
  const [logoPath, setLogoPath] = useState<string | null>(kit.logos[0] ?? null);
  const [logoSrc, setLogoSrc] = useState<string | null>(kit.logoUrl);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ error?: string; notice?: string }>({});
  const [saved, setSaved] = useState<{ primary: string; accent: string; tone: string; grain: boolean; logo: string | null }>({ primary: kit.colours.primary, accent: kit.colours.accent, tone: kit.tone, grain: kit.grain, logo: kit.logos[0] ?? null });
  const [sample, setSample] = useState(categories[0] ?? "event");
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Signed links expire; keep the logo as a data URL so previews never break.
  useEffect(() => {
    if (!kit.logoUrl) return;
    urlToDataURL(kit.logoUrl).then(setLogoSrc).catch(() => {});
  }, [kit.logoUrl]);

  const palette = useMemo(() => buildPalette(HEX.test(primary) ? primary : saved.primary, HEX.test(accent) ? accent : saved.accent), [primary, accent, saved]);
  const ctx = useMemo(() => ({ org: orgName, logo: logoSrc }), [orgName, logoSrc]);
  const content = useMemo(() => toContent(sample, SAMPLES[sample] ?? SAMPLES.event), [sample]);
  const previewStyles = showAll || !styles.length ? STYLE_ORDER : styles;
  const dirty = !readOnly && (file !== null || logoPath !== saved.logo || primary !== saved.primary || accent !== saved.accent || tone !== saved.tone || grain !== saved.grain);

  function setColours(p: string, a: string, src: ColourSource) { setPrimary(p.toUpperCase()); setAccent(a.toUpperCase()); setSource(src); setStatus({}); }

  async function applyLogoColours(src: string | null, announce: boolean) {
    if (!src) return false;
    try {
      const found = extractColors(await loadImage(src));
      if (found) { const pal = buildPalette(found.primary, found.accent); setColours(pal.primary, pal.accent, "logo"); }
      if (announce) setStatus(found ? { notice: "Using your logo's colours." } : { error: "I couldn't find strong colours in your logo." });
      return !!found;
    } catch { return false; }
  }

  async function pickLogo(f: File | undefined) {
    if (!f) return;
    if (!LOGO_TYPES[f.type]) return setStatus({ error: "Use a PNG, JPG, SVG or WebP image of your logo." });
    if (f.size > MAX_LOGO) return setStatus({ error: "That file is over 5 MB. Export a smaller version of your logo." });
    const src = await readAsDataURL(f);
    setFile(f); setLogoSrc(src); setStatus({});
    // Starter colours get replaced by the logo's; a palette someone chose stays until they ask.
    if (source === "default") {
      const found = await applyLogoColours(src, false);
      setStatus({ notice: found ? "Got your logo and took its colours. Save to keep them." : "Got your logo. Save to keep it." });
    } else {
      setStatus({ notice: "Got your logo. Save to keep it, or use its colours below." });
    }
  }

  function removeLogo() { setFile(null); setLogoPath(null); setLogoSrc(null); setStatus({}); if (fileInput.current) fileInput.current.value = ""; }

  function save() {
    if (!HEX.test(primary) || !HEX.test(accent)) return setStatus({ error: "Colours must be hex values like #1B2A4A." });
    start(async () => {
      let path = logoPath;
      if (file) {
        path = `${orgId}/logos/${crypto.randomUUID()}.${LOGO_TYPES[file.type]}`;
        // Straight to storage from the browser; RLS (brand_insert) only lets admins of this org write here.
        const { error } = await createClient().storage.from("brand").upload(path, file, { contentType: file.type, upsert: false });
        if (error) return setStatus({ error: "The logo didn't upload. Check your connection and try again." });
      }
      const res = await saveKit({ primary, accent, colourSource: source, tone, grain, logo: path });
      setStatus(res);
      if (!res.error) {
        setFile(null); setLogoPath(path);
        setSaved({ primary, accent, tone: tone.trim(), grain, logo: path });
        setTone(tone.trim());
      }
    });
  }

  return (
    <div className="grid gap-4">
      {readOnly && <p className="notice">🔒 Branch volunteers design with these but can&apos;t change them. That keeps every design on-brand.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card grid gap-3 content-start">
          <h2 className="h2">Logo</h2>
          <div className="logo-drop" data-empty={!logoSrc}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL / signed storage link, not an optimisable asset */}
            {logoSrc ? <img src={logoSrc} alt={`${orgName} logo`} /> : <span className="hint">{readOnly ? "No logo yet." : "No logo yet. Designs show your name instead."}</span>}
          </div>
          {!readOnly && (
            <>
              <input ref={fileInput} type="file" accept={Object.keys(LOGO_TYPES).join(",")} className="sr-only" id="logo-file" onChange={(e) => pickLogo(e.target.files?.[0])} />
              <div className="actions">
                <label htmlFor="logo-file" className="btn btn-secondary">{logoSrc ? "Replace logo" : "Upload logo"}</label>
                {logoSrc && <button type="button" className="btn btn-quiet" onClick={removeLogo}>Remove</button>}
                {logoSrc && <button type="button" className="btn btn-quiet" onClick={() => applyLogoColours(logoSrc, true)}>Use logo colours</button>}
              </div>
              <p className="hint">PNG, JPG, SVG or WebP, up to 5 MB. A transparent PNG or SVG looks best. Designs use this exact file and never redraw it.</p>
            </>
          )}
        </section>

        <section className="card grid gap-3 content-start">
          <div className="flex items-baseline justify-between gap-2"><h2 className="h2">Colours</h2><span className="hint font-mono">{SOURCE_LABEL[source]}</span></div>
          <div className="grid grid-cols-2 gap-3">
            {([["Main", primary, (v: string) => setColours(v, accent, "custom")], ["Accent", accent, (v: string) => setColours(primary, v, "custom")]] as const).map(([label, value, set]) => (
              <div className="field" key={label}>
                <label className="field-label" htmlFor={`c-${label}`}>{label}</label>
                <div className="colour-input">
                  <input type="color" aria-label={`${label} colour picker`} value={HEX.test(value) ? value : "#000000"} disabled={readOnly} onChange={(e) => set(e.target.value)} />
                  <input className="control font-mono" id={`c-${label}`} value={value} maxLength={7} readOnly={readOnly} aria-invalid={!HEX.test(value)}
                    onChange={(e) => { const v = e.target.value.trim(); set(v.startsWith("#") ? v : "#" + v); }} />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2" aria-label="Full palette">
            {(["primary", "accent", "paper", "ink"] as const).map((k) => (
              <div key={k} className="grid justify-items-center gap-1 font-mono text-[11px] text-slate">
                <span className="block h-8 w-full rounded border border-line" style={{ background: palette[k] }} />
                {k === "primary" ? "Main" : k[0].toUpperCase() + k.slice(1)}
              </div>
            ))}
          </div>
          <p className="hint">Paper and ink are worked out from your main colour so text always stays readable.</p>
          {!readOnly && (
            <div className="flex flex-wrap gap-1.5" aria-label="Presets">
              {PRESETS.map((p) => (
                <button key={p.name} type="button" className="preset" title={p.name} aria-label={p.name} onClick={() => setColours(p.p, p.a, "custom")}>
                  <i style={{ background: p.p }} /><i style={{ background: p.a }} />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card grid gap-3">
        <h2 className="h2">Tone</h2>
        <div className="field">
          <label className="field-label" htmlFor="tone">How should your designs sound? <span className="opt">optional</span></label>
          <textarea className="control" id="tone" value={tone} readOnly={readOnly} maxLength={1000} placeholder="Warm and welcoming. We say “family”, not “members”. No slang."
            onChange={(e) => { setTone(e.target.value); setStatus({}); }} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={grain} disabled={readOnly} onChange={(e) => { setGrain(e.target.checked); setStatus({}); }} />
          Paper grain texture on designs
        </label>
      </section>

      {!readOnly && (
        <div className="save-bar" data-dirty={dirty}>
          <div className="min-w-0">
            {status.error && <p className="error" role="alert">{status.error}</p>}
            {status.notice && !status.error && <p className="hint" role="status">{status.notice}</p>}
            {!status.error && !status.notice && <p className="hint">{dirty ? "You have unsaved changes." : "All changes saved."}</p>}
          </div>
          <button className="btn" type="button" onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : "Save brand kit"}</button>
        </div>
      )}

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Live preview</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="sample-type">Sample design</label>
            <select id="sample-type" className="control" style={{ width: "auto" }} value={sample} onChange={(e) => setSample(e.target.value)}>
              {(categories.length ? categories : Object.keys(SAMPLES)).map((k) => <option key={k} value={k}>{getCategory(k)?.label ?? k}</option>)}
            </select>
            {styles.length > 0 && styles.length < STYLE_ORDER.length && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Your styles only" : "All 9 styles"}</button>
            )}
          </div>
        </div>
        <p className="hint">Sample text in your kit. {readOnly ? "This is how your designs will look." : "Changes show here before you save."}</p>
        <div className="preview-grid">
          {previewStyles.map((s) => (
            <figure key={s} className="grid gap-1.5 justify-items-center m-0">
              <Poster style={s} size={SIZES[0]} content={content} ctx={ctx} palette={palette} grain={grain} maxHeight="300px" label={`${STYLES[s].name} preview`} />
              <figcaption className="hint">{STYLES[s].name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
