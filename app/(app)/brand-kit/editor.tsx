"use client";
import { useMemo, useState, useTransition } from "react";
import { Poster } from "@/components/poster";
import { getCategory } from "@/lib/catalog";
import type { Kit, ColourSource } from "@/lib/kit";
import { buildPalette, extractColors, HEX, posterVars, PRESETS } from "@/lib/posters/colour";
import { logoTroubles, type LogoVariant } from "@/lib/posters/logos";
import { SAMPLES, SIZES, STYLE_ORDER, STYLES, toContent, type StyleKey } from "@/lib/posters/render";
import { useResolvedLogos } from "@/lib/posters/use-logos";
import { createClient } from "@/lib/supabase/client";
import { saveKit } from "./actions";
import { LogosPanel, type EditLogo } from "./logos-panel";

const SOURCE_LABEL: Record<ColourSource, string> = { default: "starter colours", logo: "from your logo", custom: "your choice" };
const MIME = { png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp" } as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
/** What gets stored for a logo version (no pixels, no pending file). */
const stored = (l: EditLogo): LogoVariant => { const { src: _src, pending: _pending, ...meta } = l; void _src; void _pending; return meta; };
const signature = (ls: EditLogo[]) => JSON.stringify(ls.map(stored));
const names = (keys: StyleKey[]) => keys.map((k) => STYLES[k].name).join(", ");

type Props = { kit: Kit; orgId: string; orgName: string; readOnly: boolean; styles: StyleKey[]; categories: string[] };

export function BrandKitEditor({ kit, orgId, orgName, readOnly, styles, categories }: Props) {
  const [primary, setPrimary] = useState(kit.colours.primary);
  const [accent, setAccent] = useState(kit.colours.accent);
  const [source, setSource] = useState<ColourSource>(kit.colourSource);
  const [tone, setTone] = useState(kit.tone);
  const [grain, setGrain] = useState(kit.grain);
  const { logos: resolved, ready: logosReady } = useResolvedLogos(kit.logos);
  const [edited, setEdited] = useState<EditLogo[] | null>(null);
  const logos: EditLogo[] = edited ?? resolved;
  const [savedLogos, setSavedLogos] = useState<string | null>(null);
  const [status, setStatus] = useState<{ error?: string; notice?: string }>({});
  const [saved, setSaved] = useState({ primary: kit.colours.primary, accent: kit.colours.accent, tone: kit.tone, grain: kit.grain });
  const [sample, setSample] = useState(categories[0] ?? "event");
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();

  const palette = useMemo(() => buildPalette(HEX.test(primary) ? primary : saved.primary, HEX.test(accent) ? accent : saved.accent), [primary, accent, saved]);
  const vars = useMemo(() => posterVars(palette), [palette]);
  const ctx = useMemo(() => ({ org: orgName, logos }), [orgName, logos]);
  const content = useMemo(() => toContent(sample, SAMPLES[sample] ?? SAMPLES.event), [sample]);
  const previewStyles = showAll || !styles.length ? STYLE_ORDER : styles;
  const troubles = useMemo(() => logoTroubles(logos, vars, previewStyles), [logos, vars, previewStyles]);
  const logosDirty = edited !== null && signature(logos) !== (savedLogos ?? signature(resolved));
  const dirty = !readOnly && (logosDirty || primary !== saved.primary || accent !== saved.accent || tone !== saved.tone || grain !== saved.grain);

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
  const firstColourLogo = logos.find((l) => l.treatment === "full_colour")?.src ?? null;

  function save() {
    if (!logosReady) return; // never save before the existing logos have loaded, or they would be dropped
    if (!HEX.test(primary) || !HEX.test(accent)) return setStatus({ error: "Colours must be hex values like #1B2A4A." });
    start(async () => {
      // New files go straight to storage from the browser; RLS (brand_insert) only lets admins of this org write here.
      const storage = createClient().storage.from("brand");
      for (const l of logos.filter((x) => x.pending)) {
        const { error } = await storage.upload(l.path, l.pending!, { contentType: MIME[l.format], upsert: false });
        if (error && !/exists/i.test(error.message)) return setStatus({ error: "A logo didn't upload. Check your connection and try again." });
      }
      const res = await saveKit({ primary, accent, colourSource: source, tone, grain, logos: logos.map(stored) });
      setStatus(res);
      if (!res.error) {
        const clean = logos.map((l) => ({ ...l, pending: undefined }));
        setEdited(clean); setSavedLogos(signature(clean));
        setSaved({ primary, accent, tone: tone.trim(), grain });
        setTone(tone.trim());
      }
    });
  }

  return (
    <div className="grid gap-4">
      {readOnly && <p className="notice">🔒 Branch volunteers design with these but can&apos;t change them. That keeps every design on-brand.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-3 content-start">
          <LogosPanel ready={logosReady} logos={logos} onChange={(next) => { setEdited(next); }} orgId={orgId} palette={palette} readOnly={readOnly} onStatus={setStatus}
            onFirstLogo={(src) => { if (source === "default") applyLogoColours(src, false); }} />
          {!readOnly && firstColourLogo && (
            <div><button type="button" className="btn btn-quiet btn-sm" onClick={() => applyLogoColours(firstColourLogo, true)}>Use my logo&apos;s colours</button></div>
          )}
        </div>

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
          <button className="btn" type="button" onClick={save} disabled={pending || !dirty || !logosReady}>{pending ? "Saving…" : "Save brand kit"}</button>
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
        {logos.length > 0 && troubles.plated.length > 0 && (
          <p className="notice">On {names(troubles.plated)}, your logo sits on a small badge so it stays visible on the background.{!readOnly && " For a cleaner look, add a version made for dark backgrounds, or make a white version of your logo."}</p>
        )}
        {logos.length > 0 && troubles.tooSmall.length > 0 && (
          <p className="notice">On {names(troubles.tooSmall)}, the logo space is too small for your full logo, so your name is printed instead.{!readOnly && " Add an icon-only version to show it there."}</p>
        )}
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
