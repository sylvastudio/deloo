import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { deleteFile, deleteJobFiles, keepFile, readFile } from './handover-files';
import type { Evidence } from './photos';
import { supabase } from './supabase';

/**
 * Renter handover evidence (PRD §5.8, R-42), offline-tolerant:
 *   1. every capture is moved into durable storage (handover-files: documents folder on the phone,
 *      IndexedDB on the web) and recorded in a queue (localStorage)
 *      before anything is uploaded, so closing the app or losing signal loses nothing;
 *   2. the slide ("I received these in this condition") marks the job ready, with the phone's time;
 *   3. sync inserts the `handovers` row, uploads each file to `handover-media/<booking>/<handover>/…`
 *      and inserts its `handover_media` row, retrying with backoff until all of it is up.
 * Row ids are made on the phone, so a retry after a half-finished sync never creates duplicates.
 */

export type Shot = 'overview' | 'serial' | 'accessories' | 'damage' | 'video_test';
export type Capture = {
  id: string; shot: Shot; mediaType: 'photo' | 'video'; uri: string; name: string; bytes: number;
  width?: number; height?: number; durationS?: number; capturedAt: string; unitId: string | null; uploaded?: boolean;
};
export type HandoverKind = 'delivery' | 'collection';
export type HandoverJob = {
  /** Also the `handovers.id`. */
  id: string; bookingId: string; kind: HandoverKind; state: 'draft' | 'ready';
  checklist: Record<string, boolean>; problemNote: string; media: Capture[]; seq: number;
  confirmedAt?: string; inserted?: boolean; error?: string; createdAt: string;
};

const KEY = 'deloo.handover.queue';

/** RFC 4122 v4 id (no crypto module in the app; uniqueness is all we need). */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function load(): HandoverJob[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as HandoverJob[]; } catch { return []; }
}
let jobs: HandoverJob[] = load();
const listeners = new Set<() => void>();
function commit(next: HandoverJob[]) {
  jobs = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full: still in memory */ }
  listeners.forEach((fn) => fn());
}
const patchJob = (id: string, fn: (j: HandoverJob) => HandoverJob) => commit(jobs.map((j) => (j.id === id ? fn(j) : j)));
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Live queue for screens (chips, the capture screen). */
export function useHandoverJobs() {
  return useSyncExternalStore(subscribe, () => jobs);
}

/** Files waiting to upload: all bookings, or one. */
export function pendingUploads(list: HandoverJob[], bookingId?: string) {
  return list.filter((j) => j.state === 'ready' && (!bookingId || j.bookingId === bookingId))
    .reduce((n, j) => n + j.media.filter((m) => !m.uploaded).length, 0);
}
export const waitingText = (n: number) => `${n} ${n === 1 ? 'file' : 'files'} waiting to upload`;

export function findJob(bookingId: string, kind: HandoverKind) {
  return jobs.find((j) => j.bookingId === bookingId && j.kind === kind);
}

/** The in-progress capture for this hand-off, or a new one. */
export function startJob(bookingId: string, kind: HandoverKind): HandoverJob {
  const existing = findJob(bookingId, kind);
  if (existing) return existing;
  const job: HandoverJob = { id: uuid(), bookingId, kind, state: 'draft', checklist: {}, problemNote: '', media: [], seq: 0, createdAt: new Date().toISOString() };
  commit([...jobs, job]);
  return job;
}

/**
 * Keeps a capture: moves the file into the documents folder and records it. One overview and serial
 * per unit, one accessories photo and one video per hand-off (a retake replaces); damage photos add up.
 */
export async function addCapture(jobId: string, shot: Shot, unitId: string | null, e: Evidence) {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return;
  const ext = e.mediaType === 'video' ? 'mp4' : 'jpg';
  const seq = job.seq + 1;
  const name = `${shot}-${seq}.${ext}`;
  const kept = await keepFile(jobId, name, e.uri);
  const capture: Capture = {
    id: uuid(), shot, mediaType: e.mediaType, uri: kept.uri, name, bytes: kept.bytes, width: e.width, height: e.height,
    durationS: e.durationS, capturedAt: new Date().toISOString(), unitId,
  };
  const single = shot !== 'damage';
  const replaced = single ? job.media.filter((m) => m.shot === shot && m.unitId === unitId) : [];
  replaced.forEach(removeFile);
  patchJob(jobId, (j) => ({ ...j, seq, media: [...j.media.filter((m) => !replaced.includes(m)), capture] }));
}

export function removeCapture(jobId: string, captureId: string) {
  const job = jobs.find((j) => j.id === jobId);
  const m = job?.media.find((x) => x.id === captureId);
  if (!job || !m) return;
  removeFile(m);
  patchJob(jobId, (j) => ({ ...j, media: j.media.filter((x) => x.id !== captureId) }));
}

export function updateJob(jobId: string, patch: Partial<Pick<HandoverJob, 'checklist' | 'problemNote'>>) {
  patchJob(jobId, (j) => ({ ...j, ...patch }));
}

export function discardJob(jobId: string) {
  const job = jobs.find((j) => j.id === jobId);
  if (!job || job.state !== 'draft') return;
  job.media.forEach(removeFile);
  deleteJobFiles(jobId);
  commit(jobs.filter((j) => j.id !== jobId));
}

/** The slide: recorded now, with the phone's time, and uploaded as soon as there's signal. */
export function confirmJob(jobId: string) {
  patchJob(jobId, (j) => ({ ...j, state: 'ready', confirmedAt: new Date().toISOString() }));
  void syncHandovers();
}

function removeFile(m: Capture) {
  deleteFile(m.uri);
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------
let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

/** Uploads everything that's ready. Safe to call often; one run at a time. */
export function syncHandovers(): Promise<void> {
  if (running) return running;
  running = (async () => {
    let ok = true;
    for (const job of jobs.filter((j) => j.state === 'ready')) {
      if (!(await syncJob(job.id))) ok = false;
    }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (ok) failures = 0;
    else {
      // 30 s, 1, 2, 4… up to 10 minutes while the app is open; also retried on every app open.
      failures += 1;
      retryTimer = setTimeout(() => { void syncHandovers(); }, Math.min(10 * 60_000, 30_000 * 2 ** (failures - 1)));
    }
  })().finally(() => { running = null; });
  return running;
}

async function syncJob(jobId: string): Promise<boolean> {
  let job = jobs.find((j) => j.id === jobId);
  if (!job) return true;
  try {
    if (!job.inserted) {
      const { error } = await supabase.from('handovers').insert({
        id: job.id, booking_id: job.bookingId, kind: job.kind, party: 'renter',
        checklist: job.checklist, problem_note: job.problemNote.trim(), result: job.problemNote.trim() ? 'issue' : 'ok',
        confirmed_at: job.confirmedAt, device_completed_at: job.confirmedAt,
      });
      // 23505: inserted on an earlier try whose answer never arrived.
      if (error && error.code !== '23505') throw error;
      patchJob(jobId, (j) => ({ ...j, inserted: true }));
    }
    job = jobs.find((j) => j.id === jobId)!;
    for (const m of job.media.filter((x) => !x.uploaded)) {
      const path = `${job.bookingId}/${job.id}/${m.name}`;
      const file = await readFile(m.uri);
      if (file) {
        const { error: upErr } = await supabase.storage.from('handover-media')
          .upload(path, file.bytes, { contentType: file.type ?? (m.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'), upsert: false });
        if (upErr && !/exists|duplicate/i.test(upErr.message)) throw upErr;
      }
      const { error: rowErr } = await supabase.from('handover_media').insert({
        id: m.id, handover_id: job.id, booking_id: job.bookingId, unit_id: m.unitId, shot: m.shot, media_type: m.mediaType,
        storage_path: path, bytes: m.bytes, width: m.width ?? null, height: m.height ?? null, duration_s: m.durationS ?? null,
        captured_at: m.capturedAt,
      });
      if (rowErr && rowErr.code !== '23505') throw rowErr;
      removeFile(m);
      patchJob(jobId, (j) => ({ ...j, error: undefined, media: j.media.map((x) => (x.id === m.id ? { ...x, uploaded: true } : x)) }));
    }
    // All up: forget the job and its folder.
    deleteJobFiles(jobId);
    commit(jobs.filter((j) => j.id !== jobId));
    return true;
  } catch (e) {
    patchJob(jobId, (j) => ({ ...j, error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }));
    return false;
  }
}

/** Starts syncing on app open and every time the app comes back to the front. Call once. */
export function startHandoverSync() {
  void syncHandovers();
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void syncHandovers(); });
  return () => sub.remove();
}

/** Short-lived links to evidence in the private bucket (RLS: the booking's renter and staff). */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from('handover-media').createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  return Object.fromEntries(data.flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])));
}
