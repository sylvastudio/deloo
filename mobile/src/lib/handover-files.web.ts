import { useEffect, useState } from 'react';

/**
 * Web version of handover-files.ts. Browsers have no app documents folder, and localStorage is far
 * too small for photos and videos (~5 MB, strings only), so captures are kept as Blobs in IndexedDB
 * (database "deloo-handover", store "files", key "<jobId>/<name>"). A capture's uri is "idb:<key>",
 * which survives a reload or closed tab; useFileUri turns it into an object URL for thumbnails.
 * If IndexedDB is unavailable (some private modes), the Blob is kept in memory for this tab only.
 */

const DB = 'deloo-handover';
const STORE = 'files';
const PREFIX = 'idb:';
const memory = new Map<string, Blob>();
const objectUrls = new Map<string, string>();

let dbPromise: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve, reject) => {
    if (!d) return resolve(undefined);
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

const keyOf = (uri: string) => (uri.startsWith(PREFIX) ? uri.slice(PREFIX.length) : uri);

async function getBlob(key: string): Promise<Blob | null> {
  const mem = memory.get(key);
  if (mem) return mem;
  try { return ((await run<Blob>('readonly', (s) => s.get(key) as IDBRequest<Blob>)) ?? null); } catch { return null; }
}

export async function keepFile(jobId: string, name: string, srcUri: string): Promise<{ uri: string; bytes: number }> {
  const blob = await (await fetch(srcUri)).blob();
  const key = `${jobId}/${name}`;
  try {
    const d = await db();
    if (d) await run('readwrite', (s) => s.put(blob, key));
    else memory.set(key, blob);
  } catch { memory.set(key, blob); }
  if (srcUri.startsWith('blob:')) objectUrls.set(key, srcUri);
  return { uri: PREFIX + key, bytes: blob.size };
}

export async function readFile(uri: string): Promise<{ bytes: Uint8Array; type?: string } | null> {
  const blob = await getBlob(keyOf(uri));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type || undefined };
}

export function deleteFile(uri: string) {
  const key = keyOf(uri);
  memory.delete(key);
  const url = objectUrls.get(key);
  if (url) { URL.revokeObjectURL(url); objectUrls.delete(key); }
  run('readwrite', (s) => s.delete(key)).catch(() => {});
}

export function deleteJobFiles(jobId: string) {
  const range = IDBKeyRange.bound(`${jobId}/`, `${jobId}/￿`);
  for (const key of [...memory.keys()]) if (key.startsWith(`${jobId}/`)) memory.delete(key);
  run('readwrite', (s) => s.delete(range)).catch(() => {});
}

/** An object URL for a stored capture, so thumbnails still show after a reload. */
export function useFileUri(uri: string | undefined) {
  const key = uri ? keyOf(uri) : '';
  const [url, setUrl] = useState<string | undefined>(() => objectUrls.get(key));
  useEffect(() => {
    if (!key) { setUrl(undefined); return; }
    const known = objectUrls.get(key);
    if (known) { setUrl(known); return; }
    let live = true;
    getBlob(key).then((blob) => {
      if (!live || !blob) return;
      const u = URL.createObjectURL(blob);
      objectUrls.set(key, u);
      setUrl(u);
    });
    return () => { live = false; };
  }, [key]);
  return url;
}
