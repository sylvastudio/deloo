"use client";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Poster } from "@/components/poster";
import { SHEET, SpecSheet, type SheetData } from "@/components/spec-sheet";
import { briefTitle, getCategory } from "@/lib/catalog";
import type { Kit } from "@/lib/kit";
import { posterVars } from "@/lib/posters/colour";
import { elementToBlob, posterToBlob, saveBlob, shareFiles, thumbnail, zipFiles } from "@/lib/posters/export";
import { logoLabel, pickLogo } from "@/lib/posters/logos";
import { ALL_SIZES, outPx, PRINT_SIZES, RECOMMEND, SIZES, STYLE_ORDER, STYLES, toContent, type Size, type StyleKey } from "@/lib/posters/render";
import { useResolvedLogos } from "@/lib/posters/use-logos";
import { createClient } from "@/lib/supabase/client";
import { recordAsset, updateBrief } from "../actions";
import { FieldsEditor } from "../fields";

type Brief = { id: string; category: string; rawText: string; fields: Record<string, string> };
type Props = { brief: Brief; canEdit: boolean; kit: Kit; orgId: string; orgName: string; orgStyles: StyleKey[] };

const waitPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const noSubscribe = () => () => {};
/** Phones that can hand files to WhatsApp through the share sheet. */
const useCanShareFiles = () => useSyncExternalStore(noSubscribe, () => typeof navigator !== "undefined" && "canShare" in navigator, () => false);

/** Three starting options: the org's favourite styles, then the ones that suit this type, then the rest. */
function pickOptions(type: string, orgStyles: StyleKey[]): StyleKey[] {
  const out: StyleKey[] = [];
  for (const s of [...orgStyles, ...(RECOMMEND[type] ?? []), ...STYLE_ORDER]) if (!out.includes(s) && out.length < 3) out.push(s);
  return out;
}

export function Studio({ brief, canEdit, kit, orgId, orgName, orgStyles }: Props) {
  const category = getCategory(brief.category)!;
  const [options, setOptions] = useState(() => pickOptions(brief.category, orgStyles));
  const [opt, setOpt] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [fields, setFields] = useState(brief.fields);
  const [savedFields, setSavedFields] = useState(brief.fields);
  const { logos } = useResolvedLogos(kit.logos);
  const [logoOverride, setLogoOverride] = useState("");
  const [msg, setMsg] = useState<{ error?: string; notice?: string }>({});
  const [busy, setBusy] = useState<"" | "download" | "regenerate" | "all" | "print">("");
  const [progress, setProgress] = useState("");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const sheetEl = useRef<HTMLDivElement>(null);
  const canShare = useCanShareFiles();
  const [pending, start] = useTransition();
  const posterEl = useRef<HTMLDivElement>(null);

  const style = options[opt], size = ALL_SIZES[sizeIdx], isPrint = !!size.print;
  const content = useMemo(() => toContent(brief.category, fields), [brief.category, fields]);
  const ctx = useMemo(() => ({ org: orgName, logos, logoOverride: logoOverride || null }), [orgName, logos, logoOverride]);
  const vars = useMemo(() => posterVars(kit.colours), [kit.colours]);
  const pick = useMemo(() => pickLogo(logos, style, size, vars, logoOverride || null), [logos, style, size, vars, logoOverride]);
  const dirty = JSON.stringify(fields) !== JSON.stringify(savedFields);
  const missing = category.schema.fields.filter((f) => f.required && !fields[f.key]?.trim());

  function save(next = fields): Promise<boolean> {
    return new Promise((resolve) => start(async () => {
      const res = await updateBrief({ id: brief.id, category: brief.category, fields: next });
      setMsg(res);
      if (!res.error) setSavedFields(next);
      resolve(!res.error);
    }));
  }

  async function regenerate() {
    if (!brief.rawText.trim()) return setMsg({ error: "This design was filled in by hand, so there's no brief to read again." });
    setBusy("regenerate"); setMsg({});
    try {
      const res = await fetch("/api/understand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: brief.rawText, category: brief.category }) });
      const data = await res.json();
      if (!res.ok) setMsg({ error: data.error ?? "Couldn't read the brief again." });
      else { setFields(data.fields ?? {}); setMsg({ notice: canEdit ? "Read your brief again. Save to keep these details." : "Read your brief again." }); }
    } catch { setMsg({ error: "Couldn't reach Deloo. Check your connection." }); }
    finally { setBusy(""); }
  }

  const fileName = (sz: Size) => `deloo-${brief.category}-${style}-${sz.key}.${sz.mime === "image/jpeg" ? "jpg" : "png"}`;

  /** Before any export: required details present, unsaved edits saved, fonts ready. */
  async function ready(): Promise<boolean> {
    if (missing.length) { setMsg({ error: `Add “${missing[0].label}” first.` }); return false; }
    if (canEdit && dirty && !(await save())) return false;
    await document.fonts?.ready;
    return true;
  }

  /** Keep a copy with the design. RLS (outputs_write, assets_write) checks the folder and the author. */
  async function keepCopy(blob: Blob, sz: Size): Promise<string | null> {
    if (!canEdit) return null;
    const path = `${orgId}/${brief.id}/${style}-${sz.key}-${Date.now()}.${sz.mime === "image/jpeg" ? "jpg" : "png"}`;
    const { error } = await createClient().storage.from(sz.print ? "print" : "exports").upload(path, blob, { contentType: sz.mime ?? "image/png" });
    if (error) return "Downloaded, but couldn't save a copy to the design.";
    const rec = await recordAsset({ briefId: brief.id, style, size: sz.key, path, copy: fields, logoVariantId: pick?.logo.id ?? null, logoSha256: pick?.logo.sha256 ?? null });
    return rec.error ?? null;
  }

  async function download() {
    const node = posterEl.current;
    if (!node) return;
    setBusy("download"); setMsg({});
    try {
      if (!(await ready())) return;
      const blob = await posterToBlob(node, size);
      saveBlob(blob, fileName(size));
      const px = outPx(size);
      const problem = await keepCopy(blob, size);
      setMsg({ notice: `Downloaded the ${size.name.toLowerCase()} (${px.w}×${px.h}).`, error: problem ?? undefined });
    } catch {
      setMsg({ error: "The download didn't work. Try again, or try another browser." });
    } finally { setBusy(""); }
  }

  /** Every social size of this option in one zip: steps the preview through each size and exports it. */
  async function downloadAll() {
    const start = sizeIdx;
    setBusy("all"); setMsg({});
    try {
      if (!(await ready())) return;
      const files: { name: string; blob: Blob }[] = [];
      let problem: string | null = null;
      for (const [i, sz] of SIZES.entries()) {
        setProgress(`${i + 1} of ${SIZES.length}`);
        setSizeIdx(ALL_SIZES.indexOf(sz));
        await waitPaint(); await document.fonts?.ready; await waitPaint();
        const blob = await posterToBlob(posterEl.current!, sz);
        files.push({ name: fileName(sz), blob });
        problem ??= await keepCopy(blob, sz);
      }
      saveBlob(await zipFiles(files), `deloo-${brief.category}-${style}-all-sizes.zip`);
      setMsg({ notice: `Downloaded all ${files.length} sizes in one zip.`, error: problem ?? undefined });
    } catch {
      setMsg({ error: "Couldn't make the zip. Try downloading the sizes one by one." });
    } finally { setSizeIdx(start); setProgress(""); setBusy(""); }
  }

  /** Print file (JPEG) plus a spec sheet for the printer; on phones, straight into the share sheet (WhatsApp). */
  async function downloadPrint(share: boolean) {
    const node = posterEl.current;
    if (!node || !size.print) return;
    setBusy("print"); setMsg({});
    try {
      if (!(await ready())) return;
      setProgress("Making the print file…");
      const art = await posterToBlob(node, size);
      const px = outPx(size);
      setProgress("Making the spec sheet…");
      setSheet({
        org: orgName, title: briefTitle(brief.category, fields), style: STYLES[style].name, spec: size.print, fileName: fileName(size), px,
        palette: kit.colours, thumb: await thumbnail(art), date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date()),
      });
      await waitPaint(); await document.fonts?.ready;
      const specBlob = await elementToBlob(sheetEl.current!, SHEET.w, SHEET.h);
      setSheet(null);
      const specName = fileName(size).replace(/\.(jpg|png)$/, "-spec-sheet.png");
      const shared = share && await shareFiles(
        [new File([art], fileName(size), { type: "image/jpeg" }), new File([specBlob], specName, { type: "image/png" })],
        `Print job: ${briefTitle(brief.category, fields)}, ${size.print.label}.`,
      );
      if (!shared) { saveBlob(art, fileName(size)); saveBlob(specBlob, specName); }
      const problem = await keepCopy(art, size);
      setMsg({ notice: shared ? "Shared the print file and spec sheet." : `Downloaded the print file (${px.w}×${px.h}) and its spec sheet. Send both to your printer.`, error: problem ?? undefined });
    } catch {
      setMsg({ error: "Couldn't make the print file. Big sizes need memory: close other tabs or use a computer, then try again." });
    } finally { setSheet(null); setProgress(""); setBusy(""); }
  }

  return (
    <div className="studio">
      <section className="grid gap-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="tabs" role="tablist" aria-label="Options">
            {options.map((s, i) => (
              <button key={i} type="button" role="tab" className="tab" aria-selected={i === opt} onClick={() => setOpt(i)}>Option {i + 1}<small>{STYLES[s].name}</small></button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="hint">Style</span>
            <select className="control" style={{ width: "auto", minHeight: 36 }} value={style}
              onChange={(e) => setOptions((o) => o.map((s, i) => (i === opt ? (e.target.value as StyleKey) : s)))}>
              {STYLE_ORDER.map((s) => <option key={s} value={s}>{STYLES[s].name}</option>)}
            </select>
          </label>
        </div>
        {logos.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="hint">Logo</span>
            <select className="control" style={{ width: "auto", minHeight: 36 }} value={logoOverride} onChange={(e) => setLogoOverride(e.target.value)}>
              <option value="">Automatic{pick ? ` (${logoLabel(pick.logo, logos.indexOf(pick.logo))})` : ""}</option>
              {logos.map((l, i) => <option key={l.id} value={l.id}>{logoLabel(l, i)}</option>)}
            </select>
          </label>
        )}
        <div className="tabs" role="tablist" aria-label="Social sizes">
          {SIZES.map((s) => { const i = ALL_SIZES.indexOf(s); return (
            <button key={s.key} type="button" role="tab" className="tab" aria-selected={i === sizeIdx} onClick={() => setSizeIdx(i)} title={s.long} disabled={busy !== ""}>{s.name}<small>{s.w}×{s.h}</small></button>
          ); })}
        </div>
        <div className="tabs" role="tablist" aria-label="Print sizes">
          {PRINT_SIZES.map((s) => { const i = ALL_SIZES.indexOf(s); return (
            <button key={s.key} type="button" role="tab" className="tab" aria-selected={i === sizeIdx} onClick={() => setSizeIdx(i)} title={s.long} disabled={busy !== ""}>{s.name}<small>print</small></button>
          ); })}
        </div>
        <div className="artboard">
          <Poster posterRef={posterEl} style={style} size={size} content={content} ctx={ctx} palette={kit.colours} grain={kit.grain}
            maxHeight="min(62vh, 640px)" label={`${STYLES[style].name}, ${size.long}`} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="hint font-mono">{STYLES[style].name} · {size.long}{isPrint ? ` · ${outPx(size).w}×${outPx(size).h}px` : ""}</p>
          {isPrint ? (
            <div className="actions">
              {canShare && <button type="button" className="btn btn-secondary" onClick={() => downloadPrint(true)} disabled={busy !== ""}>Send to printer</button>}
              <button type="button" className="btn btn-generate" onClick={() => downloadPrint(false)} disabled={busy !== ""}>{busy === "print" ? progress || "Preparing…" : "Download for printer"}</button>
            </div>
          ) : (
            <div className="actions">
              <button type="button" className="btn btn-secondary" onClick={downloadAll} disabled={busy !== ""}>{busy === "all" ? `Zipping ${progress}…` : "All sizes (.zip)"}</button>
              <button type="button" className="btn btn-generate" onClick={download} disabled={busy !== ""}>{busy === "download" ? "Preparing…" : "Download PNG"}</button>
            </div>
          )}
        </div>
        {isPrint && <p className="hint">You get a high-quality JPEG ({size.print!.dpi} dpi at full size) and a spec sheet with the size, bleed, material and finishing, ready to send to your printer on WhatsApp. Big files take a few seconds.</p>}
        {sheet && <div aria-hidden="true" style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}><SpecSheet data={sheet} sheetRef={sheetEl} /></div>}
        {msg.notice && <p className="notice" role="status">{msg.notice}</p>}
        {msg.error && <p className="error" role="alert">{msg.error}</p>}
      </section>

      <aside className="card grid gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="h2">Details</h2>
          {canEdit && <span className="hint">{dirty ? "Unsaved changes" : "Saved"}</span>}
        </div>
        {!canEdit && <p className="hint">Only the person who made this design (or HQ) can change its details. You can still try styles and download it.</p>}
        <p className="hint">Edits show on the poster straight away. They don&apos;t use the AI.</p>
        <FieldsEditor category={category} values={fields} readOnly={!canEdit} showErrors idPrefix="d" onChange={(k, v) => { setFields((f) => ({ ...f, [k]: v })); setMsg({}); }} />
        {canEdit && (
          <div className="actions">
            <button type="button" className="btn" onClick={() => save()} disabled={pending || !dirty || missing.length > 0}>{pending ? "Saving…" : "Save details"}</button>
            {dirty && <button type="button" className="btn btn-quiet" onClick={() => setFields(savedFields)}>Undo changes</button>}
          </div>
        )}
        {brief.rawText && (
          <details className="grid gap-2">
            <summary className="hint" style={{ cursor: "pointer" }}>Original brief</summary>
            <p className="hint" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{brief.rawText}</p>
            <div><button type="button" className="btn btn-secondary btn-sm" onClick={regenerate} disabled={busy !== ""}>{busy === "regenerate" ? "Reading…" : "Read the brief again"}</button></div>
          </details>
        )}
      </aside>
    </div>
  );
}
