// PNG export in the browser (Phase 3 decision: render client-side, as the Phase 1 prototype did).
import type { Size } from "./render";

/** Fonts the poster styles use. Loaded as a stylesheet for previews and embedded for downloads. */
export const POSTER_FONTS_URL = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Anton&family=Space+Mono:wght@400;700&family=Yellowtail&family=Mrs+Saint+Delafield&family=Instrument+Serif&family=Inter+Tight:wght@500..800&family=Caveat:wght@600;700&display=swap";

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });
}

/**
 * The image library can't read the cross-origin Google Fonts stylesheet, so fetch the poster
 * fonts once and embed them as data URLs (Latin subset only, to keep it small).
 */
let fontEmbed: Promise<string> | null = null;
function getFontEmbedCSS(): Promise<string> {
  fontEmbed ??= fetch(POSTER_FONTS_URL).then((r) => r.text()).then((css) => {
    const blocks = css.split(/(?=\/\*)/).filter((b) => /^\/\* latin \*\//.test(b));
    return Promise.all(blocks.map(async (b) => {
      const m = b.match(/url\((https:[^)]+)\)/);
      if (!m) return b;
      const data = await fetch(m[1]).then((r) => r.blob()).then(blobToDataURL);
      return b.replace(m[1], data);
    })).then((a) => a.join("\n"));
  }).catch(() => { fontEmbed = null; return ""; });
  return fontEmbed;
}

/** Any element → image file at w×h layout px times `ratio`. PNG by default; JPEG for big print files. */
export async function elementToBlob(node: HTMLElement, w: number, h: number, opts: { ratio?: number; mime?: "image/png" | "image/jpeg" } = {}): Promise<Blob> {
  const [{ toCanvas }, fontEmbedCSS] = await Promise.all([import("html-to-image"), getFontEmbedCSS()]);
  const canvas = await toCanvas(node, {
    width: w, height: h, pixelRatio: opts.ratio ?? 1,
    style: { transform: "none", visibility: "visible" },
    ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
  });
  const mime = opts.mime ?? "image/png";
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, mime === "image/jpeg" ? 0.92 : undefined));
  canvas.width = canvas.height = 0; // free the (possibly huge) canvas straight away
  if (!blob) throw new Error("export produced no image");
  return blob;
}

/** The full-size poster element → the size's file: exact pixels, PNG for social, high-quality JPEG for print. */
export function posterToBlob(node: HTMLElement, size: Size): Promise<Blob> {
  return elementToBlob(node, size.w, size.h, { ratio: size.ratio, mime: size.mime });
}

/** A small JPEG data URL of an image file (for the printer spec sheet). */
export async function thumbnail(blob: Blob, maxSide = 640): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.85);
}

/** Zip several files (no recompression: PNG and JPEG are already compressed). */
export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) entries[f.name] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  return new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

/** Phone share sheet (WhatsApp etc.) when the browser can share files; false if it can't. */
export async function shareFiles(files: File[], text: string): Promise<boolean> {
  if (!navigator.canShare?.({ files })) return false;
  try { await navigator.share({ files, text }); } catch (e) { if ((e as Error).name !== "AbortError") throw e; }
  return true;
}

/** Fetch an image (e.g. a signed storage URL) as a data URL, so previews and exports never depend on the link staying valid. */
export async function urlToDataURL(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't load ${res.status}`);
  return blobToDataURL(await res.blob());
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
