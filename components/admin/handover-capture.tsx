"use client";
import { Camera, Check, Images, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { addHandoverMedia, createHandover, setBookingStatus } from "@/app/admin/_actions/booking";
import { unreachable } from "@/components/admin/action-form";
import { clearDraft, loadDraft, saveDraft } from "@/lib/admin/photo-store";
import { HANDOVER_LABEL, type BookingStatus, type HandoverKind } from "@/lib/admin/status";
import { createClient } from "@/lib/supabase/client";
import { btnClass, Spinner } from "./ui/button";
import { useConfirm } from "./ui/dialog";
import { useToast } from "./ui/toast";

type Unit = { unitId: string; label: string };
type Shot = "overview" | "serial" | "accessories" | "other";
type Slot = { key: string; unitId: string | null; shot: Shot; title: string; required: boolean; multiple: boolean; video: boolean };
type Picked = { slot: Slot; file: File };
type Prepared = Picked & { blob: Blob; ext: string; type: string; mediaType: "photo" | "video"; width: number | null; height: number | null };
type Files = Record<string, File[]>;

const BUCKET = "handover-media";
const MAX_VIDEO = 50 * 1024 * 1024;       // bucket limit
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];
const SHOT_TITLE: Record<Shot, string> = { overview: "Overview", serial: "Serial plate", accessories: "Accessories laid out", other: "Damage or video" };

/** Photos: resize to 1600px on the long edge, JPEG ~0.75 (PRD §5.8). Falls back to the original file. */
async function prepare(p: Picked): Promise<Prepared> {
  const f = p.file;
  if (f.type.startsWith("video/")) {
    if (f.size > MAX_VIDEO) throw new Error(`${f.name} is over 50 MB. Record a shorter clip (15 s is enough).`);
    const type = OK_TYPES.includes(f.type) ? f.type : "video/mp4";
    return { ...p, blob: f, ext: type === "video/quicktime" ? "mov" : "mp4", type, mediaType: "video", width: null, height: null };
  }
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.75));
    if (blob) return { ...p, blob, ext: "jpg", type: "image/jpeg", mediaType: "photo", width: w, height: h };
  } catch {
    // Not decodable here (e.g. HEIC on some browsers): try the original.
  }
  if (!OK_TYPES.includes(f.type)) throw new Error(`${f.name}: use a JPEG, PNG or WebP photo.`);
  return { ...p, blob: f, ext: f.type.split("/")[1].replace("jpeg", "jpg"), type: f.type, mediaType: "photo", width: null, height: null };
}

async function sha256(blob: Blob) {
  const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A v4 uuid. crypto.randomUUID needs a secure context, which a phone on the dev Wi-Fi doesn't have. */
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Upload files to handover-media/<booking>/<handover>/… and record them. Returns the ones that failed;
 * when recording fails, everything counts as failed (the retry re-uploads under new paths).
 */
async function uploadFiles(bookingId: string, handoverId: string, list: Picked[], onProgress: (done: number, total: number) => void) {
  const db = createClient();
  const saved: Parameters<typeof addHandoverMedia>[0]["files"] = [];
  const failed: Picked[] = [];
  let error = "";
  let n = 0;
  onProgress(0, list.length);
  for (const p of list) {
    n += 1;
    try {
      const x = await prepare(p);
      const hash = await sha256(x.blob);
      const path = `${bookingId}/${handoverId}/${p.slot.unitId ?? "all"}-${p.slot.shot}-${Date.now()}-${n}.${x.ext}`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(path, x.blob, { contentType: x.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      saved.push({
        unit_id: p.slot.unitId,
        shot: x.mediaType === "video" && p.slot.shot === "other" ? "video_test" : p.slot.shot,
        media_type: x.mediaType, storage_path: path, sha256: hash, bytes: x.blob.size,
        width: x.width, height: x.height, captured_at: new Date(p.file.lastModified || Date.now()).toISOString(),
      });
    } catch (e) {
      failed.push(p);
      error = e instanceof Error ? e.message : "Upload failed.";
    }
    onProgress(n, list.length);
  }
  if (saved.length) {
    const r = await addHandoverMedia({ bookingId, handoverId, files: saved });
    if (r.error) return { failed: list, error: `Uploaded, but couldn’t record the files: ${r.error}` };
  }
  return { failed, error };
}

function slotsFor(units: Unit[]): Slot[] {
  return [
    ...units.flatMap((u) => [
      { key: `${u.unitId}:overview`, unitId: u.unitId, shot: "overview" as const, title: SHOT_TITLE.overview, required: true, multiple: false, video: false },
      { key: `${u.unitId}:serial`, unitId: u.unitId, shot: "serial" as const, title: SHOT_TITLE.serial, required: true, multiple: false, video: false },
    ]),
    { key: "all:accessories", unitId: null, shot: "accessories", title: SHOT_TITLE.accessories, required: false, multiple: true, video: false },
    { key: "all:other", unitId: null, shot: "other", title: SHOT_TITLE.other, required: false, multiple: true, video: true },
  ];
}

const flat = (files: Files, slots: Slot[]): Picked[] =>
  slots.flatMap((s) => (files[s.key] ?? []).map((file) => ({ slot: s, file })));
const count = (files: Files) => Object.values(files).reduce((n, l) => n + l.length, 0);

// ---------------------------------------------------------------------------------------------------
// Thumbnails: small JPEGs made off the full photo, so ten tiles don't decode ten 12 MP images at once
// on a low-RAM phone. Cached per File.
// ---------------------------------------------------------------------------------------------------

const thumbs = new WeakMap<File, string>();

async function makeThumb(file: File): Promise<string> {
  try {
    const bmp = await createImageBitmap(file, { resizeWidth: 240, resizeQuality: "low" }).catch(() => createImageBitmap(file));
    const scale = Math.min(1, 240 / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.7));
    if (blob) return URL.createObjectURL(blob);
  } catch {
    // fall through
  }
  return URL.createObjectURL(file);
}

function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(() => thumbs.get(file) ?? null);
  useEffect(() => {
    if (thumbs.has(file) || !file.type.startsWith("image/")) return;
    let alive = true;
    void makeThumb(file).then((u) => {
      thumbs.set(file, u);
      if (alive) setUrl(u);
    });
    return () => { alive = false; };
  }, [file]);
  if (file.type.startsWith("video/")) return <span className="ph"><Video aria-hidden="true" />Video</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" /> : <span className="ph"><Spinner size={20} /></span>;
}

const fileKey = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;

/** One required (or optional) shot: a square tile that opens the camera; tap again to retake. */
function ShotTile({ slot, files, sent, earlier, disabled, onFiles, onClear, unitName }: {
  slot: Slot; files: File[]; sent: number; earlier: boolean; disabled: boolean; unitName?: string;
  onFiles: (f: FileList | null) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const last = files[files.length - 1];
  const filled = files.length > 0 || sent > 0 || earlier;
  const what = `${slot.title}${unitName ? `, ${unitName}` : ""}`;
  const action = files.length && !slot.multiple ? "retake" : files.length ? "add another" : "take photo";
  return (
    <div className="shot" data-filled={filled ? "true" : undefined} data-required={slot.required && !earlier ? "true" : undefined}>
      <button type="button" className="shot-btn" onClick={() => ref.current?.click()} disabled={disabled}
        aria-label={`${what}: ${action}${files.length ? ` (${files.length} taken)` : sent ? " (saved)" : earlier ? " (done earlier)" : slot.required ? " (required)" : ""}`}>
        {last ? <Thumb key={fileKey(last)} file={last} /> : (
          <span className="ph">
            {sent ? <Check aria-hidden="true" /> : <Camera aria-hidden="true" />}
            {sent ? "Saved" : earlier ? "Done earlier" : slot.required ? "Required" : "Optional"}
          </span>
        )}
      </button>
      {filled && <span className="badge-corner" aria-hidden="true"><Check /></span>}
      {files.length + sent > 1 && <span className="count-corner" aria-hidden="true">{files.length + sent}</span>}
      {files.length > 0 && !disabled && (
        <button type="button" className="shot-remove" onClick={onClear} aria-label={`Remove ${what} photo${files.length > 1 ? "s" : ""}`}><X aria-hidden="true" /></button>
      )}
      <span className="shot-label">{slot.title}</span>
      <input ref={ref} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={disabled}
        accept={slot.video ? "image/*,video/*" : "image/*"} capture="environment" multiple={slot.multiple}
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

/**
 * A button that opens a visually hidden file input, so it can be reached and used from the keyboard
 * (a <label> around a hidden input can't take focus).
 */
export function FilePick({ label, accept, capture, multiple, disabled, className = "btn btn-secondary btn-sm", onFiles, icon }: {
  label: string; accept: string; capture?: "environment" | "user"; multiple?: boolean; disabled?: boolean; className?: string;
  onFiles: (files: FileList | null) => void; icon?: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => ref.current?.click()}>{icon}{label}</button>
      <input ref={ref} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept={accept} capture={capture} multiple={multiple}
        disabled={disabled} onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
    </>
  );
}

/** Put gallery photos into the first empty required tiles, in order; the rest go to "Damage or video". */
function fillFromGallery(files: Files, slots: Slot[], list: File[], skip: (s: Slot) => boolean): Files {
  const next = { ...files };
  const queue = [...list];
  for (const s of slots) {
    if (!queue.length) break;
    if (!s.required || skip(s) || (next[s.key]?.length ?? 0) > 0) continue;
    next[s.key] = [queue.shift()!];
  }
  if (queue.length) next["all:other"] = [...(next["all:other"] ?? []), ...queue];
  return next;
}

function OkProblem({ value, onChange, disabled, name }: { value: "ok" | "issue"; onChange: (v: "ok" | "issue") => void; disabled?: boolean; name: string }) {
  return (
    <fieldset disabled={disabled} className="grid gap-2">
      <legend className="field-label">How is the gear?</legend>
      <div className="seg lg ok-problem">
        <label><input type="radio" name={name} checked={value === "ok"} onChange={() => onChange("ok")} /><Check width={16} height={16} aria-hidden="true" />All OK</label>
        <label><input type="radio" name={name} checked={value === "issue"} onChange={() => onChange("issue")} /><X width={16} height={16} aria-hidden="true" />Problem</label>
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------------
// Rider flow: the job screen's capture. One marigold button saves the handover (creates it, uploads,
// records) AND moves the booking on. The handover id is made here and kept (also in IndexedDB), so a
// retry after a dropped connection or a killed tab never makes a second handover.
// ---------------------------------------------------------------------------------------------------

export type RiderUnit = { unitId: string; name: string; ids: string };

export function RiderHandover({ bookingId, bookingRef, units, kind, to, toLabel, actionLabel, hint, covered, blocked }: {
  bookingId: string; bookingRef: string; units: RiderUnit[]; kind: HandoverKind; to: BookingStatus; toLabel: string;
  actionLabel: string; hint: string;
  /** Units that already have a photo in a staff handover of this kind (taken earlier). */
  covered: string[];
  /** Why the step can't happen yet (e.g. collection opens tomorrow). */
  blocked?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const ask = useConfirm();
  const uid = useId();
  const draftKey = `${bookingId}:${kind}`;
  const slots = slotsFor(units.map((u) => ({ unitId: u.unitId, label: u.name })));
  const earlier = new Set(covered);
  const skip = (s: Slot) => !!s.unitId && earlier.has(s.unitId);

  const [files, setFiles] = useState<Files>({});
  const [sent, setSent] = useState<Record<string, number>>({});
  const [result, setResult] = useState<"ok" | "issue">("ok");
  const [note, setNote] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [handoverId, setHandoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Restore photos taken before the tab was killed (the camera app can do that on low-RAM phones).
  useEffect(() => {
    let alive = true;
    void loadDraft(draftKey).then((d) => {
      if (!alive) return;
      if (d && (d.files.length || d.handoverId)) {
        const keys = new Set(slotsFor(units.map((u) => ({ unitId: u.unitId, label: u.name }))).map((s) => s.key));
        const next: Files = {};
        for (const f of d.files) if (keys.has(f.slotKey)) next[f.slotKey] = [...(next[f.slotKey] ?? []), f.file];
        setFiles(next);
        setResult(d.result);
        setNote(d.note);
        setDraftId(d.draftId);
        setHandoverId(d.handoverId);
        const n = count(next);
        if (n) toast.show(`Restored ${n} photo${n === 1 ? "" : "s"} you took earlier.`, "info", { announce: true });
      }
      setReady(true);
    });
    return () => { alive = false; };
    // Restore once per job step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Keep the draft in IndexedDB while there's anything to lose.
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      const list = Object.entries(files).flatMap(([slotKey, l]) => l.map((file) => ({ slotKey, file })));
      if (!list.length && !handoverId && !note) void clearDraft(draftKey);
      else void saveDraft(draftKey, { files: list, draftId, handoverId, result, note });
    }, 300);
    return () => window.clearTimeout(t);
  }, [ready, files, draftId, handoverId, result, note, draftKey]);

  const required = slots.filter((s) => s.required);
  const doneSlot = (s: Slot) => skip(s) || (files[s.key]?.length ?? 0) > 0 || (sent[s.key] ?? 0) > 0;
  const requiredDone = required.filter(doneSlot).length;
  const missing = required.filter((s) => !doneSlot(s));
  const newCount = count(files);
  const noteNeeded = result === "issue" && note.trim().length < 3;
  const locked = busy;
  const resultLocked = busy || !!handoverId;

  const add = (s: Slot, list: FileList | null) => {
    if (!list?.length) return;
    setError("");
    const arr = [...list];
    setFiles((f) => ({ ...f, [s.key]: s.multiple ? [...(f[s.key] ?? []), ...arr] : [arr[arr.length - 1]] }));
  };

  async function go() {
    setError("");
    if (blocked) return;
    if (missing.length) {
      setError(`Still needed: ${missing.length} photo${missing.length === 1 ? "" : "s"} (${missing.map((s) => `${units.find((u) => u.unitId === s.unitId)?.name ?? ""} ${s.title.toLowerCase()}`.trim()).join(", ")}).`);
      return;
    }
    if (noteNeeded) { setError("Say what the problem is in the note."); return; }
    const ok = await ask({
      title: `${actionLabel}?`,
      body: (
        <>
          <p>{newCount ? `Saves ${newCount} photo${newCount === 1 ? "" : "s"} and moves` : "Moves"} {bookingRef} to {toLabel}.{result === "issue" ? " Your problem note goes to ops." : ""}</p>
          <p>The renter’s tracker updates straight away.</p>
        </>
      ),
      confirmLabel: actionLabel,
    });
    if (!ok) return;
    setBusy(true);
    try {
      let hid = handoverId;
      const needHandover = newCount > 0 || (!hid && (result === "issue" || note.trim().length > 0));
      if (needHandover && !hid) {
        setStage("Starting handover…");
        const id = draftId ?? newId();
        setDraftId(id);
        await saveDraft(draftKey, { files: Object.entries(files).flatMap(([slotKey, l]) => l.map((file) => ({ slotKey, file }))), draftId: id, handoverId: null, result, note });
        const r = await createHandover({ id, bookingId, kind, result, note });
        if (r.error || !r.id) { setError(r.error ?? "Couldn’t start the handover. Try again."); return; }
        hid = r.id;
        setHandoverId(hid);
      }
      if (hid && newCount > 0) {
        const list = flat(files, slots);
        setStage("Uploading photos…");
        const { failed, error: upErr } = await uploadFiles(bookingId, hid, list, (done, total) => {
          setProgress({ done, total });
          setStage(`Uploading ${Math.min(done + 1, total)} of ${total}…`);
        });
        const failedSet = new Set(failed.map((p) => p.file));
        const ok = list.filter((p) => !failedSet.has(p.file));
        setSent((s) => {
          const next = { ...s };
          for (const p of ok) next[p.slot.key] = (next[p.slot.key] ?? 0) + 1;
          return next;
        });
        const left: Files = {};
        for (const p of failed) left[p.slot.key] = [...(left[p.slot.key] ?? []), p.file];
        setFiles(left);
        if (failed.length) {
          setError(`${failed.length} photo${failed.length === 1 ? "" : "s"} didn’t upload. ${upErr} Check your signal and tap Retry.`);
          return;
        }
      }
      setStage(`Moving to ${toLabel}…`);
      setProgress(null);
      const fd = new FormData();
      fd.set("booking_id", bookingId);
      fd.set("to", to);
      const r = await setBookingStatus(undefined, fd);
      if (r?.error) { setError(`${newCount ? "Photos saved, but the" : "The"} job didn’t move on: ${r.error}`); return; }
      await clearDraft(draftKey);
      setFiles({}); setSent({}); setNote(""); setResult("ok"); setDraftId(null); setHandoverId(null);
      toast.ok(r?.ok ?? `Moved to ${toLabel}.`);
      router.refresh();
    } catch (e) {
      // The connection dropped, or the page is out of date. Keep the files; the same button retries.
      console.error("[admin] handover didn’t complete:", e);
      setError(`${unreachable()} Your photos are still here.`);
    } finally {
      setBusy(false); setStage(""); setProgress(null);
    }
  }

  const retrying = !!handoverId && !busy && !!error;
  const label = busy ? stage || "Saving…" : retrying ? (newCount ? "Retry upload" : `Try again: ${actionLabel}`) : actionLabel;
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="grid gap-4" aria-labelledby={`${uid}-h`}>
      <div className="grid gap-1">
        <h2 className="t-heading" id={`${uid}-h`}>{HANDOVER_LABEL[kind]} photos</h2>
        <p className="hint">{hint}</p>
      </div>

      <div className="coverage" aria-live="polite">
        <span className="tabular">{requiredDone} of {required.length} required</span>
        <span className="bar" aria-hidden="true"><i style={{ width: `${required.length ? (requiredDone / required.length) * 100 : 100}%` }} /></span>
      </div>

      {units.map((u) => (
        <div key={u.unitId} className="grid gap-2">
          <p className="flex items-baseline justify-between gap-2">
            <b>{u.name}</b>{u.ids && <span className="mono muted">{u.ids}</span>}
          </p>
          <div className="shots">
            {slots.filter((s) => s.unitId === u.unitId).map((s) => (
              <ShotTile key={s.key} slot={s} unitName={u.name} files={files[s.key] ?? []} sent={sent[s.key] ?? 0} earlier={skip(s)} disabled={locked}
                onFiles={(l) => add(s, l)} onClear={() => setFiles((f) => ({ ...f, [s.key]: [] }))} />
            ))}
          </div>
        </div>
      ))}
      {units.length === 0 && <p className="callout warn">No units are assigned to this booking yet. Ask ops to assign them.</p>}
      <div className="grid gap-2">
        <p><b>Whole kit</b> <span className="muted">optional</span></p>
        <div className="shots">
          {slots.filter((s) => !s.unitId).map((s) => (
            <ShotTile key={s.key} slot={s} files={files[s.key] ?? []} sent={sent[s.key] ?? 0} earlier={false} disabled={locked}
              onFiles={(l) => add(s, l)} onClear={() => setFiles((f) => ({ ...f, [s.key]: [] }))} />
          ))}
        </div>
        <div>
          <FilePick label="Add from gallery" accept="image/*,video/*" multiple disabled={locked} className={btnClass("ghost", "md")}
            icon={<Images aria-hidden="true" />} onFiles={(l) => l?.length && setFiles((f) => fillFromGallery(f, slots, [...l], skip))} />
        </div>
      </div>

      <OkProblem value={result} onChange={setResult} disabled={resultLocked} name={`${uid}-result`} />
      <label className="field">
        <span className="field-label">Note {result === "ok" && <span className="opt">optional</span>}</span>
        <textarea className="control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={resultLocked}
          aria-invalid={noteNeeded && !!error ? true : undefined}
          placeholder={result === "issue" ? "What’s wrong? e.g. scratch on the LCD, battery missing" : "e.g. Handed to Ada, ID seen"} />
      </label>

      <div className="action-bar">
        <div className="ab-inner grid gap-2">
          {blocked && <p className="callout info">{blocked}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {progress && <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><i style={{ width: `${pct}%` }} /></div>}
          <p className="sr-only" role="status" aria-live="polite">{stage}</p>
          <button type="button" className={btnClass("accent", "lg", "btn-block")} onClick={go} disabled={busy || !!blocked} aria-busy={busy || undefined}>
            {busy && <Spinner />}{label}
          </button>
          {!busy && !blocked && missing.length > 0 && <p className="ab-status">{missing.length} more photo{missing.length === 1 ? "" : "s"} needed</p>}
          {retrying && newCount > 0 && (
            <button type="button" className={btnClass("ghost", "sm")} onClick={() => { setFiles({}); setError(""); }}>Skip the photos that failed</button>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Generic capture (booking page, ops on desktop): pick the kind, photos per unit, OK/Problem, note,
// Save. Does not move the booking.
// ---------------------------------------------------------------------------------------------------

/**
 * Staff handover capture (A-11, A-23): kind, result, note, and photos/videos per unit. Works from a
 * phone camera. Creates the handover row, uploads each file to handover-media/<booking>/<handover>/…,
 * then records the media rows. Failed uploads can be retried without creating a second handover: the
 * handover id is made here, and createHandover ignores a repeat of the same id.
 * `large`: phone-sized controls.
 */
export function HandoverCapture({ bookingId, units, kinds, defaultKind, title = "Add handover evidence", large }: {
  bookingId: string; units: Unit[]; kinds: HandoverKind[]; defaultKind?: HandoverKind; title?: string; large?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const ask = useConfirm();
  const uid = useId();
  const [kind, setKind] = useState<HandoverKind>(defaultKind ?? kinds[0]);
  const [result, setResult] = useState<"ok" | "issue">("ok");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<Files>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  // After a partial failure: the handover already exists, so a retry only uploads what's left.
  const [pending, setPending] = useState<string | null>(null);
  // The id for the next handover, kept across a failed start so a retry can't make a second one.
  const [draftId, setDraftId] = useState<string | null>(null);
  const slots = slotsFor(units).map((s) => ({ ...s, required: false }));
  const n = count(files);
  const locked = busy || !!pending;
  const covered = new Set(slots.filter((s) => s.unitId && (files[s.key]?.length ?? 0) > 0).map((s) => s.unitId));
  const missing = units.filter((u) => !covered.has(u.unitId));

  async function submit() {
    setError("");
    if (!n) { setError("Add at least one photo."); return; }
    if (result === "issue" && note.trim().length < 3) { setError("Describe the problem in the note."); return; }
    if (!pending && !(await ask({ title: `Save this ${HANDOVER_LABEL[kind].toLowerCase()} handover?`, body: <p>{n} file{n === 1 ? "" : "s"}, marked {result === "ok" ? "all OK" : "with a problem"}.</p>, confirmLabel: "Save handover" }))) return;
    setBusy(true);
    let handoverId = pending;
    try {
      if (!handoverId) {
        setProgress("Starting handover…");
        const id = draftId ?? newId();
        setDraftId(id);
        const r = await createHandover({ id, bookingId, kind, result, note });
        if (r.error || !r.id) { setError(r.error ?? "Couldn’t start the handover."); return; }
        handoverId = r.id;
      }
      const list = flat(files, slots);
      const { failed, error: upErr } = await uploadFiles(bookingId, handoverId, list, (d, t) => setProgress(`Uploading ${Math.min(d + 1, t)} of ${t}…`));
      if (failed.length) {
        setPending(handoverId);
        const left: Files = {};
        for (const p of failed) left[p.slot.key] = [...(left[p.slot.key] ?? []), p.file];
        setFiles(left);
        setError(`${failed.length} file${failed.length === 1 ? "" : "s"} didn’t upload. ${upErr} Check the connection and tap Retry.`);
      } else {
        setPending(null); setDraftId(null); setFiles({}); setNote(""); setResult("ok");
        toast.ok("Handover saved.", { announce: true });
        router.refresh();
      }
    } catch (e) {
      console.error("[admin] handover didn’t complete:", e);
      if (handoverId) setPending(handoverId);
      setError(`${unreachable()} Your files are still here.`);
    } finally {
      setBusy(false); setProgress("");
    }
  }

  return (
    <div className="grid gap-4">
      <h3 className="t-heading">{title}</h3>
      <div className="cols-2">
        <label className="field">
          <span className="field-label">Kind</span>
          <select className="control" value={kind} onChange={(e) => { setKind(e.target.value as HandoverKind); setDraftId(null); }} disabled={locked}>
            {kinds.map((k) => <option key={k} value={k}>{HANDOVER_LABEL[k]}</option>)}
          </select>
        </label>
        <OkProblem value={result} onChange={setResult} disabled={locked} name={`${uid}-result`} />
      </div>
      <label className="field">
        <span className="field-label">Note {result === "ok" && <span className="opt">optional</span>}</span>
        <textarea className="control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={locked}
          placeholder={result === "issue" ? "What’s wrong? e.g. scratch on the LCD, battery missing" : "e.g. Handed to Ada, ID seen"} />
      </label>
      {units.map((u) => (
        <div key={u.unitId} className="grid gap-2">
          <p><b>{u.label}</b></p>
          <div className="shots">
            {slots.filter((s) => s.unitId === u.unitId).map((s) => (
              <ShotTile key={s.key} slot={s} unitName={u.label} files={files[s.key] ?? []} sent={0} earlier={false} disabled={locked}
                onFiles={(l) => l?.length && setFiles((f) => ({ ...f, [s.key]: s.multiple ? [...(f[s.key] ?? []), ...l] : [l[l.length - 1]] }))}
                onClear={() => setFiles((f) => ({ ...f, [s.key]: [] }))} />
            ))}
          </div>
        </div>
      ))}
      <div className="grid gap-2">
        <p><b>Whole kit</b></p>
        <div className="shots">
          {slots.filter((s) => !s.unitId).map((s) => (
            <ShotTile key={s.key} slot={s} files={files[s.key] ?? []} sent={0} earlier={false} disabled={locked}
              onFiles={(l) => l?.length && setFiles((f) => ({ ...f, [s.key]: [...(f[s.key] ?? []), ...l] }))}
              onClear={() => setFiles((f) => ({ ...f, [s.key]: [] }))} />
          ))}
        </div>
      </div>
      {units.length > 0 && missing.length > 0 && n > 0 && (
        <p className="callout warn">No photo yet for: {missing.map((u) => u.label).join(", ")}. Riders can’t move the job on until every unit has one.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{progress}</p>
      <div className="actions">
        <button type="button" className={btnClass("primary", large ? "lg" : "md")} onClick={submit} disabled={busy || !n} aria-busy={busy || undefined}>
          {busy && <Spinner />}{busy ? progress || "Saving…" : pending ? "Retry failed uploads" : "Save handover"}
        </button>
        {pending && !busy && (
          <button type="button" className={btnClass("ghost")} onClick={() => { setPending(null); setDraftId(null); setFiles({}); setError(""); router.refresh(); }}>
            Give up on the rest
          </button>
        )}
      </div>
    </div>
  );
}
