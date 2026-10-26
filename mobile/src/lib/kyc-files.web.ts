/** Web version of kyc-files.ts: the photo is a blob: or data: URL from the file input or canvas. */
export async function readPhoto(uri: string): Promise<Uint8Array | null> {
  try { return new Uint8Array(await (await fetch(uri)).arrayBuffer()); } catch { return null; }
}
