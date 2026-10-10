/**
 * Handover drafts in IndexedDB (browser only). On low-RAM Android phones the camera app can kill the
 * browser tab; when the rider comes back, the photos they had already taken are restored from here.
 * Every call fails soft: no IndexedDB (private mode, old browser) just means no restore.
 */
const DB_NAME = "deloo-admin";
const STORE = "handover-drafts";

export type DraftFile = { slotKey: string; file: File };
export type HandoverDraft = {
  files: DraftFile[];
  /** The handover id reserved for this attempt (createHandover is idempotent on it). */
  draftId: string | null;
  /** Set once the handover row exists: a retry only uploads what's left. */
  handoverId: string | null;
  result: "ok" | "issue";
  note: string;
  savedAt: number;
};

/** Drafts older than this are dropped on load (a stale draft would attach old photos to a new trip). */
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onabort = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function loadDraft(key: string): Promise<HandoverDraft | null> {
  const d = (await run("readonly", (s) => s.get(key))) as HandoverDraft | null | undefined;
  if (!d) return null;
  if (Date.now() - d.savedAt > MAX_AGE_MS) {
    await clearDraft(key);
    return null;
  }
  return d;
}

export async function saveDraft(key: string, draft: Omit<HandoverDraft, "savedAt">): Promise<void> {
  await run("readwrite", (s) => s.put({ ...draft, savedAt: Date.now() }, key));
}

export async function clearDraft(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}
