"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { addHandoverMedia, createHandover } from "@/app/admin/_actions/booking";
import { HANDOVER_LABEL, type HandoverKind } from "@/lib/admin/status";
import { createClient } from "@/lib/supabase/client";

type Unit = { unitId: string; label: string };
type Slot = { key: string; unitId: string | null; shot: "overview" | "serial" | "accessories" | "other"; label: string };
type Picked = { slot: Slot; file: File };
type Prepared = Picked & { blob: Blob; ext: string; type: string; mediaType: "photo" | "video"; width: number | null; height: number | null };

const BUCKET = "handover-media";
const MAX_VIDEO = 50 * 1024 * 1024;       // bucket limit
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];

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

/**
 * Staff handover capture (A-11, A-23): kind, result, note, and photos/videos per unit. Works from a
 * phone camera. Creates the handover row, uploads each file to handover-media/<booking>/<handover>/…,
 * then records the media rows. Failed uploads can be retried without creating a second handover.
 */
export function HandoverCapture({ bookingId, units, kinds, defaultKind, title = "Add handover evidence" }: {
  bookingId: string; units: Unit[]; kinds: HandoverKind[]; defaultKind?: HandoverKind; title?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const [kind, setKind] = useState<HandoverKind>(defaultKind ?? kinds[0]);
  const [result, setResult] = useState<"ok" | "issue">("ok");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  // After a partial failure: the handover already exists, so a retry only uploads what's left.
  const [pending, setPending] = useState<{ handoverId: string; left: Picked[] } | null>(null);

  const slots: Slot[] = [
    ...units.flatMap((u) => [
      { key: `${u.unitId}:overview`, unitId: u.unitId, shot: "overview" as const, label: `${u.label}: overview` },
      { key: `${u.unitId}:serial`, unitId: u.unitId, shot: "serial" as const, label: `${u.label}: serial plate` },
    ]),
    { key: "all:accessories", unitId: null, shot: "accessories", label: "Accessories laid out" },
    { key: "all:other", unitId: null, shot: "other", label: "Other / damage close-ups / video" },
  ];

  const add = (slot: Slot, files: FileList | null) => {
    if (!files?.length) return;
    setDone("");
    setPicked((p) => [...p, ...[...files].map((file) => ({ slot, file }))]);
  };
  const remove = (i: number) => setPicked((p) => p.filter((_, n) => n !== i));

  async function upload(handoverId: string, list: Picked[]) {
    const db = createClient();
    const saved: Parameters<typeof addHandoverMedia>[0]["files"] = [];
    const failed: Picked[] = [];
    let n = 0;
    for (const p of list) {
      n += 1;
      setProgress(`Uploading ${n} of ${list.length}…`);
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
        setError(e instanceof Error ? e.message : "Upload failed.");
      }
    }
    if (saved.length) {
      const r = await addHandoverMedia({ bookingId, handoverId, files: saved });
      if (r.error) {
        setError(`Uploaded, but couldn’t record the files: ${r.error}`);
        return list; // retry everything
      }
    }
    return failed;
  }

  async function submit() {
    setError(""); setDone("");
    if (!picked.length) { setError("Add at least one photo."); return; }
    if (result === "issue" && note.trim().length < 3) { setError("Describe the problem in the note."); return; }
    if (!window.confirm(`Save this ${kind} handover with ${picked.length} file${picked.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    try {
      let handoverId = pending?.handoverId;
      const list = pending ? pending.left : picked;
      if (!handoverId) {
        setProgress("Starting handover…");
        const r = await createHandover({ bookingId, kind, result, note });
        if (r.error || !r.id) { setError(r.error ?? "Couldn’t start the handover."); return; }
        handoverId = r.id;
      }
      const failed = await upload(handoverId, list);
      if (failed.length) {
        setPending({ handoverId, left: failed });
        setPicked(failed);
        setError((e) => `${failed.length} file${failed.length === 1 ? "" : "s"} didn’t upload. ${e} Check the connection and tap Retry.`);
      } else {
        setPending(null); setPicked([]); setNote(""); setResult("ok");
        setDone("Handover saved.");
        router.refresh();
      }
    } finally {
      setBusy(false); setProgress("");
    }
  }

  const covered = new Set(picked.filter((p) => p.slot.unitId && p.file.type.startsWith("image/")).map((p) => p.slot.unitId));
  const missing = units.filter((u) => !covered.has(u.unitId));

  return (
    <div className="grid gap-3">
      <h3 className="h2" style={{ fontSize: 16 }}>{title}</h3>
      <div className="cols-2">
        <label className="field">
          <span className="field-label">Kind</span>
          <select className="control" value={kind} onChange={(e) => setKind(e.target.value as HandoverKind)} disabled={!!pending || busy}>
            {kinds.map((k) => <option key={k} value={k}>{HANDOVER_LABEL[k]}</option>)}
          </select>
        </label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }} disabled={!!pending || busy}>
          <legend className="field-label">Result</legend>
          <div className="actions">
            <label className="switch"><input type="radio" name={`${uid}-result`} checked={result === "ok"} onChange={() => setResult("ok")} /> All OK</label>
            <label className="switch"><input type="radio" name={`${uid}-result`} checked={result === "issue"} onChange={() => setResult("issue")} /> Problem</label>
          </div>
        </fieldset>
      </div>
      <label className="field">
        <span className="field-label">Note {result === "ok" && <span className="opt">optional</span>}</span>
        <textarea className="control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!!pending || busy}
          placeholder={result === "issue" ? "What’s wrong? e.g. scratch on the LCD, battery missing" : "e.g. Handed to Ada, ID seen"} style={{ minHeight: 60 }} />
      </label>

      <div className="grid gap-2">
        {slots.map((s) => (
          <div key={s.key} className="flex flex-wrap items-center justify-between gap-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <span className="small">{s.label}</span>
            <span className="actions">
              <span className="muted small">{picked.filter((p) => p.slot.key === s.key).length || ""}</span>
              <label className="btn btn-secondary btn-sm" aria-disabled={busy || !!pending}>
                Camera
                <input type="file" accept="image/*,video/*" capture="environment" hidden multiple={false}
                  onChange={(e) => { add(s, e.target.files); e.target.value = ""; }} disabled={busy || !!pending} />
              </label>
              <label className="btn btn-quiet btn-sm" aria-disabled={busy || !!pending}>
                Files
                <input type="file" accept="image/*,video/*" hidden multiple
                  onChange={(e) => { add(s, e.target.files); e.target.value = ""; }} disabled={busy || !!pending} />
              </label>
            </span>
          </div>
        ))}
      </div>

      {picked.length > 0 && (
        <ul className="grid gap-1" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {picked.map((p, i) => (
            <li key={i} className="flex items-center justify-between gap-2 small">
              <span className="min-w-0 truncate"><span className="badge">{p.file.type.startsWith("video/") ? "video" : "photo"}</span> {p.slot.label} · <span className="muted">{(p.file.size / 1024 / 1024).toFixed(1)} MB</span></span>
              {!busy && !pending && <button type="button" className="btn btn-quiet btn-sm" onClick={() => remove(i)}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {units.length > 0 && missing.length > 0 && picked.length > 0 && (
        <p className="warn-box">No photo yet for: {missing.map((u) => u.label).join(", ")}. Riders can’t move the job on until every unit has one.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="ok-box" role="status">{done}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={submit} disabled={busy || !picked.length}>
          {busy ? progress || "Saving…" : pending ? "Retry failed uploads" : "Save handover"}
        </button>
        {pending && !busy && (
          <button type="button" className="btn btn-quiet" onClick={() => { setPending(null); setPicked([]); setError(""); router.refresh(); }}>
            Give up on the rest
          </button>
        )}
      </div>
    </div>
  );
}
