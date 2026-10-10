import { Directory, File, Paths } from 'expo-file-system';

/**
 * Where handover captures live until they upload (native: the app's documents folder).
 * The web build uses handover-files.web.ts (IndexedDB) behind the same functions.
 */

function folder(jobId: string) {
  const dir = new Directory(Paths.document, 'handover', jobId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Moves a fresh capture (camera cache) into durable storage; returns where it is now and its size. */
export async function keepFile(jobId: string, name: string, srcUri: string): Promise<{ uri: string; bytes: number }> {
  const dest = new File(folder(jobId), name);
  await new File(srcUri).move(dest);
  return { uri: dest.uri, bytes: dest.size ?? 0 };
}

/** The file's bytes for upload, or null if it's gone. `type` is the real MIME type when known. */
export async function readFile(uri: string): Promise<{ bytes: Uint8Array; type?: string } | null> {
  const file = new File(uri);
  if (!file.exists) return null;
  return { bytes: await file.bytes() };
}

export function deleteFile(uri: string) {
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* ignore */ }
}

export function deleteJobFiles(jobId: string) {
  try { new Directory(Paths.document, 'handover', jobId).delete(); } catch { /* already gone */ }
}

/** A uri an <Image> can show (native: the file uri itself). */
export function useFileUri(uri: string | undefined) {
  return uri;
}
