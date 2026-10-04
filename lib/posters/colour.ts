// Palette maths, ported from prototype/index.html (COLOUR). Pure functions: safe on server and client.

export type Palette = { primary: string; accent: string; paper: string; ink: string };
type RGB = [number, number, number];

export const HEX = /^#[0-9A-Fa-f]{6}$/;

export function hexToRgb(h: string): RGB {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)) as RGB;
}
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => { v = Math.round(Math.max(0, Math.min(255, v))); return (v < 16 ? "0" : "") + v.toString(16); }).join("").toUpperCase();
}
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > .5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r: number, g: number, b: number;
  if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function lum(hex: string): number {
  const c = hexToRgb(hex).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
export function contrast(a: string, b: string): number { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
function onColor(bg: string, prefs: string[], min: number): string {
  for (const p of prefs) if (contrast(p, bg) >= min) return p;
  return prefs.slice().sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];
}
function withAlpha(hex: string, a: number): string { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

export function autoAccent(primary: string): string {
  const h = rgbToHsl(...hexToRgb(primary))[0];
  let acc = (h >= 190 && h <= 290) ? "#F2C230" : hslToHex(h + 165, .7, .62);
  if (contrast(acc, primary) < 2) acc = hslToHex(h + 165, .6, lum(primary) > .4 ? .2 : .85);
  return acc;
}
/** Main + accent in; the full four-colour kit out (paper and ink are tinted from the main colour). */
export function buildPalette(primary: string, accent?: string | null): Palette {
  const hsl = rgbToHsl(...hexToRgb(primary));
  return {
    primary: primary.toUpperCase(), accent: (accent || autoAccent(primary)).toUpperCase(),
    paper: hslToHex(hsl[0], Math.min(.35, hsl[1] * .5 + .08), .925), ink: hslToHex(hsl[0], Math.min(.4, hsl[1] * .6), .09),
  };
}

function zigzag(): string {
  const pts = ["0 0", "100% 0"], teeth = 22;
  for (let i = 0; i <= teeth * 2; i++) { const x = 100 - i * (100 / (teeth * 2)); pts.push(x.toFixed(2) + "% " + (i % 2 ? "100%" : "calc(100% - 2.4cqmin)")); }
  return "polygon(" + pts.join(",") + ")";
}
const ZIG = zigzag();

/** Every colour a poster uses, with readable pairings worked out per palette. */
export function posterVars(pal: Palette): Record<string, string> {
  const p = pal.primary, a = pal.accent, pp = pal.paper, k = pal.ink;
  const ppLight = mix(pp, "#FFFFFF", .45), skyBot = mix(p, "#FFFFFF", .72), ground = mix(p, k, .35), board = mix(ppLight, "#FFFFFF", .35);
  return {
    "--p": p, "--a": a, "--pp": pp, "--k": k, "--pp-light": ppLight,
    "--on-p": onColor(p, [a, pp, k], 3), "--on-p-body": onColor(p, [pp, k, "#FFFFFF"], 4.5), "--on-p-ink": onColor(p, [k, pp, "#FFFFFF"], 4.5),
    "--on-a": onColor(a, [p, k, pp], 3), "--on-pp": onColor(pp, [p, k], 3), "--on-pp-script": onColor(p, [ppLight, "#FFFFFF"], 2.5),
    "--sky-top": mix(p, "#FFFFFF", .42), "--sky-bot": skyBot, "--ground": ground, "--ground-2": mix(ground, k, .35), "--on-ground": onColor(ground, [pp, "#FFFFFF"], 3),
    "--on-sky": onColor(skyBot, [k, p], 3), "--board": board, "--on-board-a": onColor(board, [a, p, k], 1.8),
    "--metal-hi": mix(k, "#FFFFFF", .92), "--metal-mid": mix(k, "#FFFFFF", .62), "--metal-lt": mix(k, "#FFFFFF", .82), "--metal-lo": mix(k, "#FFFFFF", .42),
    "--prop-dark": mix(k, "#FFFFFF", .18), "--prop-mid": mix(k, "#FFFFFF", .32), "--pin-hi": mix(k, "#FFFFFF", .4), "--pin-lo": k, "--post-lo": mix(k, "#FFFFFF", .08), "--post-hi": mix(k, "#FFFFFF", .22),
    "--dot": withAlpha(k, .08), "--dot-on-p": withAlpha(onColor(p, [pp, k], 3), .14), "--shadow": withAlpha(k, .55), "--zig": ZIG,
  };
}

/** Main colours of a loaded logo image (browser only: uses a canvas). */
export function extractColors(img: HTMLImageElement): { primary: string; accent: string | null } | null {
  const c = document.createElement("canvas"), n = 72; c.width = n; c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, n, n);
  const data = ctx.getImageData(0, 0, n, n).data;
  const buckets: Record<string, { n: number; r: number; g: number; b: number }> = {};
  const darks: RGB[] = [];
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2], hsl = rgbToHsl(r, g, b);
    if (hsl[2] > .93) continue;
    if (hsl[2] < .08 || hsl[1] < .12) { darks.push([r, g, b]); continue; }
    const key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4), bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
    bk.n++; bk.r += r; bk.g += g; bk.b += b; total++;
  }
  const list = Object.values(buckets).map((b) => { const hex = rgbToHex(b.r / b.n, b.g / b.n, b.b / b.n); return { hex, n: b.n, hsl: rgbToHsl(...hexToRgb(hex)) }; })
    .sort((a, b) => b.n - a.n);
  if (!list.length) { if (darks.length > 20) { const d = darks[0]; return { primary: rgbToHex(d[0], d[1], d[2]), accent: null }; } return null; }
  let accent: string | null = null;
  for (let j = 1; j < list.length; j++) {
    let dh = Math.abs(list[j].hsl[0] - list[0].hsl[0]); dh = Math.min(dh, 360 - dh);
    if (list[j].n > total * .04 && (dh > 35 || Math.abs(list[j].hsl[2] - list[0].hsl[2]) > .3)) { accent = list[j].hex; break; }
  }
  return { primary: list[0].hex, accent };
}

export const PRESETS = [
  { name: "Cobalt and yellow", p: "#2B3FB8", a: "#F2C230" }, { name: "Red and cream", p: "#D7262F", a: "#F3E9D8" },
  { name: "Navy and gold", p: "#1B2A4A", a: "#E8B84A" }, { name: "Green and cream", p: "#1E5B3F", a: "#F1E3C8" },
  { name: "Purple and gold", p: "#4B2A7B", a: "#F2C230" }, { name: "Maroon and sand", p: "#7A1F2B", a: "#E9D2A8" },
];
