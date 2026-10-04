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

/** The full-size poster element → PNG at the size's exact pixel dimensions. */
export async function posterToBlob(node: HTMLElement, size: Size): Promise<Blob> {
  const [{ toBlob }, fontEmbedCSS] = await Promise.all([import("html-to-image"), getFontEmbedCSS()]);
  const blob = await toBlob(node, {
    width: size.w, height: size.h, pixelRatio: 1,
    style: { transform: "none", visibility: "visible" },
    ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
  });
  if (!blob) throw new Error("export produced no image");
  return blob;
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
