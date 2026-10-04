// Logo analysis and the approved logo tools. Browser only (canvas). Runs on the admin's device at upload,
// so the picker (lib/posters/logos.ts) never needs a canvas.
//
// What's automatic: trimming empty margins (only removes blank space). What needs the admin to ask for it
// and approve the result: removing a flat white box, making a white or black one-colour version.
// Never: AI upscaling, AI background removal, tracing to vector, or any change to the mark's own pixels.

import { hexToRgb, rgbToHex, rgbToHsl } from "./colour";
import type { LogoVariant } from "./logos";

export type LogoFormat = LogoVariant["format"];
export type Analysed = {
  blob: Blob;
  format: LogoFormat;
  sha256: string;
  dataUrl: string;
  meta: Pick<LogoVariant, "w" | "h" | "alpha" | "opaqueBg" | "lumHist" | "colours">;
  trimmed: boolean;
};

export const LOGO_TYPES: Record<string, LogoFormat> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp" };
const MIME: Record<LogoFormat, string> = { png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp" };

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob); });
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("not an image")); i.src = src; });
}
function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png"));
}

/** Strips anything active from an SVG: scripts, foreign HTML, event handlers, external links. */
export function sanitiseSvg(text: string): string | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return null;
  doc.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase(), val = a.value.trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(a.name);
      else if ((name === "href" || name === "xlink:href") && !val.startsWith("#") && !val.startsWith("data:image/")) el.removeAttribute(a.name);
    }
  });
  return new XMLSerializer().serializeToString(doc);
}

/** Draws any logo file onto a canvas at its own size (SVGs at a fixed analysis size). */
async function toCanvas(src: string, format: LogoFormat): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (format === "svg") { const s = 1024 / Math.max(w || 1, h || 1); w = Math.round((w || 1024) * s); h = Math.round((h || 1024) * s); }
  const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const dist = (d: Uint8ClampedArray, i: number, rgb: number[]) => Math.abs(d[i] - rgb[0]) + Math.abs(d[i + 1] - rgb[1]) + Math.abs(d[i + 2] - rgb[2]);
const pxLum = (r: number, g: number, b: number) => {
  const f = (v: number) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
};

/** A solid colour on every edge sample (corners and edge midpoints) means the logo sits on a box. */
function detectBox(d: Uint8ClampedArray, w: number, h: number): string | null {
  const pts = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [w >> 1, h - 1], [0, h >> 1], [w - 1, h >> 1]];
  const px = pts.map(([x, y]) => (y * w + x) * 4);
  if (px.some((i) => d[i + 3] < 250)) return null;
  const ref = [d[px[0]], d[px[0] + 1], d[px[0] + 2]];
  if (px.some((i) => dist(d, i, ref) > 24)) return null;
  return rgbToHex(ref[0], ref[1], ref[2]);
}

function measure(c: HTMLCanvasElement) {
  const { width: w, height: h } = c;
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let alpha = false;
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) { alpha = true; break; }
  const opaqueBg = alpha ? null : detectBox(d, w, h);
  const bg = opaqueBg ? hexToRgb(opaqueBg) : null;
  const isInk = (i: number) => d[i + 3] > 16 && (!bg || dist(d, i, bg) > 30);

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const hist = new Array(16).fill(0), buckets: Record<string, { n: number; r: number; g: number; b: number }> = {};
  let total = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 250000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4;
    if (!isInk(i)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    hist[Math.min(15, Math.floor(pxLum(r, g, b) * 16))]++; total++;
    const key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4), bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
    bk.n++; bk.r += r; bk.g += g; bk.b += b;
  }
  const colours: string[] = [];
  for (const b of Object.values(buckets).sort((a, z) => z.n - a.n)) {
    const hex = rgbToHex(b.r / b.n, b.g / b.n, b.b / b.n), hsl = rgbToHsl(b.r / b.n, b.g / b.n, b.b / b.n);
    if (b.n < total * .03 || colours.some((c) => Math.abs(rgbToHsl(...hexToRgb(c))[0] - hsl[0]) < 12 && Math.abs(rgbToHsl(...hexToRgb(c))[2] - hsl[2]) < .12)) continue;
    colours.push(hex);
    if (colours.length === 4) break;
  }
  return {
    alpha, opaqueBg, colours,
    lumHist: total ? hist.map((n) => +(n / total).toFixed(4)) : null,
    box: x1 >= 0 ? { x: Math.max(0, x0 - step), y: Math.max(0, y0 - step), w: Math.min(w, x1 + step + 1) - Math.max(0, x0 - step), h: Math.min(h, y1 + step + 1) - Math.max(0, y0 - step) } : null,
  };
}

/** Analyse an uploaded logo. Rasters with wide empty margins are trimmed (same pixels, PNG). SVGs are sanitised. */
export async function analyseLogo(file: Blob, format: LogoFormat): Promise<Analysed> {
  let blob = file;
  if (format === "svg") {
    const clean = sanitiseSvg(await file.text());
    if (!clean) throw new Error("That SVG file couldn't be read.");
    blob = new Blob([clean], { type: MIME.svg });
  }
  let dataUrl = await blobToDataURL(blob);
  const c = await toCanvas(dataUrl, format);
  const m = measure(c);
  if (!m.box) throw new Error("That image looks empty.");
  let trimmed = false, outFormat = format, w = c.width, h = c.height;

  // Trim blank margins: only when they're more than ~4% of the image, so a tight logo is stored untouched.
  if (format !== "svg" && m.box.w * m.box.h < c.width * c.height * .92) {
    const pad = Math.round(Math.max(m.box.w, m.box.h) * .02);
    const x = Math.max(0, m.box.x - pad), y = Math.max(0, m.box.y - pad);
    const cw = Math.min(c.width - x, m.box.w + pad * 2), ch = Math.min(c.height - y, m.box.h + pad * 2);
    const out = document.createElement("canvas"); out.width = cw; out.height = ch;
    out.getContext("2d")!.drawImage(c, x, y, cw, ch, 0, 0, cw, ch);
    blob = await canvasBlob(out); dataUrl = await blobToDataURL(blob);
    trimmed = true; outFormat = "png"; w = cw; h = ch;
  }
  return {
    blob, format: outFormat, sha256: await sha256Hex(blob), dataUrl, trimmed,
    meta: { w, h, alpha: m.alpha, opaqueBg: m.opaqueBg, lumHist: m.lumHist, colours: m.colours },
  };
}

/** Re-measure a stored logo (old kits saved before analysis existed). Doesn't change the file. */
export async function remeasure(src: string, format: LogoFormat) {
  const c = await toCanvas(src, format);
  const m = measure(c);
  return { w: c.width, h: c.height, alpha: m.alpha, opaqueBg: m.opaqueBg, lumHist: m.lumHist, colours: m.colours };
}

/**
 * Admin tool: removes a flat box behind a logo by flood-filling from the edges. Only pixels connected to the
 * edge and close to the box colour go transparent, so a white dove *inside* a crest is usually kept,
 * but the admin must check the preview on a dark background before using it.
 */
export async function removeBox(src: string, format: LogoFormat, boxHex: string, tolerance = 40): Promise<Blob> {
  const c = await toCanvas(src, format);
  const { width: w, height: h } = c, ctx = c.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h), d = img.data, bg = hexToRgb(boxHex);
  const seen = new Uint8Array(w * h), stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4, dd = dist(d, i, bg);
    if (dd > tolerance * 2) continue;
    // Soft edge: near-box pixels fade out, the rest of the anti-aliased rim keeps partial cover.
    d[i + 3] = dd <= tolerance ? 0 : Math.round(d[i + 3] * Math.min(1, (dd - tolerance) / tolerance));
    if (dd > tolerance) continue;
    const x = p % w, y = (p - x) / w;
    if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w);
  }
  ctx.putImageData(img, 0, 0);
  return canvasBlob(c);
}

/** Admin tool: a one-colour version (every visible pixel white or black, transparency kept). Needs a see-through logo. */
export async function silhouette(src: string, format: LogoFormat, colour: "#FFFFFF" | "#000000"): Promise<Blob> {
  const c = await toCanvas(src, format);
  const ctx = c.getContext("2d", { willReadFrequently: true })!, img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  const v = colour === "#FFFFFF" ? 255 : 0;
  for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return canvasBlob(c);
}
