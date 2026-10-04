// Logo variants and the per-poster logo picker. Pure functions: the same choice in previews, exports and on the server.
//
// Brand rule (PRD §4.4, decisions of 4 Oct 2026): the pixels of a mark are always the org's own. We only scale it,
// give it room, or put it on a plate. Variants Deloo *made* (white box removed, white/black one-colour version) exist
// only because an admin created and approved them in the brand kit, and each keeps a link to its source.

import { lum } from "./colour";
import { SIZES, type Size, type StyleKey } from "./render";

export type LogoKind = "main" | "mark";
export type LogoTreatment = "full_colour" | "mono_white" | "mono_black";
export type LogoDerivation = "trim" | "white_box_removed" | "silhouette_white" | "silhouette_black";

export type LogoVariant = {
  id: string;
  /** Storage path in the brand bucket: {org_id}/logos/{file}. */
  path: string;
  sha256: string | null;
  /** "What is this?": the full logo, or a small icon/crest on its own. */
  kind: LogoKind;
  /** Does the logo itself show the organisation's name? Then styles that print the name beside it leave it out. */
  includesName: boolean;
  treatment: LogoTreatment;
  /** Admin override of what we detected: which backgrounds this version is made for. */
  madeFor: "auto" | "light" | "dark";
  source: "upload" | "derived";
  derivedFrom?: string | null;
  derivation?: LogoDerivation | null;
  format: "svg" | "png" | "jpg" | "webp";
  /** Stored file size in px (SVG: rendered size used for analysis). */
  w: number;
  h: number;
  /** Has see-through pixels. */
  alpha: boolean;
  /** Colour of a solid box behind the logo (e.g. "#FFFFFF" from a Canva export), or null. */
  opaqueBg: string | null;
  /** 16-bin histogram of the luminance of the logo's visible pixels (sums to 1). Null until analysed. */
  lumHist: number[] | null;
  /** Main colours of the logo, most common first. */
  colours: string[];
  approvedAt?: string | null;
};

/** A variant ready to draw: its pixels as a data URL (signed links expire). */
export type ResolvedLogo = LogoVariant & { src: string };

/** Old kits stored plain path strings. Read them as an unanalysed main logo. */
export function normaliseLogos(raw: unknown): LogoVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v, i): LogoVariant[] => {
    if (typeof v === "string") {
      const ext = (v.split(".").pop() ?? "png").toLowerCase();
      return [{
        id: `legacy-${i}`, path: v, sha256: null, kind: "main", includesName: true, treatment: "full_colour", madeFor: "auto", source: "upload",
        format: ext === "svg" ? "svg" : ext === "jpg" || ext === "jpeg" ? "jpg" : ext === "webp" ? "webp" : "png",
        w: 0, h: 0, alpha: ext === "svg" || ext === "png" || ext === "webp", opaqueBg: null, lumHist: null, colours: [],
      }];
    }
    if (v && typeof v === "object" && typeof (v as LogoVariant).path === "string") return [v as LogoVariant];
    return [];
  });
}

// --------------------------------------------------------------------------------------------
// Where each style puts its logo (from app/posters.css). Heights and max widths in cqmin.
// bg: the poster colour variables behind the slot; for gradients, every end the logo can sit on.
// nameBeside: the style prints the org name next to the logo.
// --------------------------------------------------------------------------------------------
type Slot = { bg: string[]; h: number; bannerH?: number; maxW: number; bannerMaxW?: number; nameBeside?: boolean };
export const SLOTS: Partial<Record<StyleKey, Slot>> = {
  receipt: { bg: ["--pp-light"], h: 7, bannerH: 11, maxW: 34, bannerMaxW: 40 },
  ticket: { bg: ["--p"], h: 6, maxW: 26, nameBeside: true },
  form: { bg: ["--pp"], h: 6, bannerH: 12, maxW: 28, bannerMaxW: 36 },
  editorial: { bg: ["--pp"], h: 3.4, maxW: 18, nameBeside: true },
  note: { bg: ["--ground", "--ground-2"], h: 6, bannerH: 10, maxW: 28, bannerMaxW: 36 },
  sticker: { bg: ["--p"], h: 6, maxW: 36 },
  billboard: { bg: ["--sky-top", "--sky-bot"], h: 8, bannerH: 16, maxW: 40, bannerMaxW: 46 },
  block: { bg: ["--pp-light"], h: 6.5, maxW: 30 },
  // badge prints the org name as text and has no logo slot.
};

/** Output pixels per cqmin (1cqmin = 1% of the poster's shorter side). */
const cqPx = (s: Size) => (Math.min(s.w, s.h) / 100) * (s.ratio ?? 1);
const isBanner = (s: Size) => s.cls.includes("sz-banner");
/** Smallest a logo may print, in px: an icon stays readable smaller than a full logo with lettering. */
const MIN_PX: Record<LogoKind, number> = { mark: 16, main: 28 };
/** Share of a logo's visible pixels that must stand out (3:1) from the background. */
export const LEGIBLE = 0.6;

const binLum = (i: number) => (i + .5) / 16;
const contrastL = (a: number, b: number) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);

/** How much of the logo stands out against a background (0–1). */
export function legibility(v: LogoVariant, bgHex: string): number {
  const bl = lum(bgHex);
  if (v.madeFor === "light") return bl > .35 ? 1 : 0;
  if (v.madeFor === "dark") return bl < .35 ? 1 : 0;
  if (v.treatment === "mono_white") return contrastL(1, bl) >= 3 ? 1 : 0;
  if (v.treatment === "mono_black") return contrastL(0, bl) >= 3 ? 1 : 0;
  // Not analysed yet: assume an ordinary dark-on-light logo.
  if (!v.lumHist) return bl > .35 ? 1 : 0.3;
  return v.lumHist.reduce((sum, share, i) => sum + (contrastL(binLum(i), bl) >= 3 ? share : 0), 0);
}

export type LogoPick = {
  logo: ResolvedLogo;
  /** Drawn size in cqmin (fits the slot's height and width). */
  hCq: number;
  wCq: number;
  /** Poster colour variable for a plate behind the logo when no version stands out on its own. */
  plate: string | null;
  legible: number;
};

/** The best version of the logo for this style and size, or null to print the org name instead. */
export function pickLogo(logos: ResolvedLogo[], style: StyleKey, size: Size, vars: Record<string, string>, overrideId?: string | null): LogoPick | null {
  const slot = SLOTS[style];
  logos = logos.filter((l) => l.src); // a file that failed to load can't be drawn
  if (!slot || !logos.length) return null;
  const banner = isBanner(size), CQ = cqPx(size);
  const slotH = (banner && slot.bannerH) || slot.h, maxW = (banner && slot.bannerMaxW) || slot.maxW;
  const bgs = slot.bg.map((k) => vars[k]).filter(Boolean);

  const fit = (v: ResolvedLogo) => {
    const aspect = v.w && v.h ? v.w / v.h : 1;
    let h = slotH, w = h * aspect;
    if (w > maxW) { w = maxW; h = w / aspect; }
    return { h, w, px: h * CQ };
  };
  const leg = (v: ResolvedLogo) => Math.min(...bgs.map((b) => legibility(v, b)));
  const plateFor = (v: ResolvedLogo) => {
    const light = vars["--pp-light"], dark = vars["--k"];
    return legibility(v, light) >= legibility(v, dark) ? "--pp-light" : "--k";
  };
  const make = (v: ResolvedLogo): LogoPick => {
    const f = fit(v), l = leg(v);
    return { logo: v, hCq: f.h, wCq: f.w, legible: l, plate: l >= LEGIBLE ? null : plateFor(v) };
  };

  const chosen = overrideId ? logos.find((l) => l.id === overrideId) : undefined;
  if (chosen) return make(chosen);

  // Small slots, and slots that already print the name, prefer the icon.
  const wantsMark = slot.nameBeside || slotH * CQ < 60;
  const scored = logos.map((v) => {
    const f = fit(v), l = leg(v);
    return {
      v, l, fits: f.px >= MIN_PX[v.kind],
      score: (l >= LEGIBLE ? 8 : 0) + (wantsMark === (v.kind === "mark") ? 2 : 0) + (slot.nameBeside && !v.includesName ? 1 : 0)
        + (v.treatment === "full_colour" ? 0.5 : 0) + l * 0.4,
    };
  }).filter((s) => s.fits).sort((a, b) => b.score - a.score);
  return scored.length ? make(scored[0].v) : null;
}

/** A short human name for a version, e.g. "Icon, white (3)". */
export function logoLabel(l: LogoVariant, i: number) {
  const base = l.kind === "mark" ? "Icon" : "Full logo";
  const t = l.treatment === "mono_white" ? ", white" : l.treatment === "mono_black" ? ", black" : l.madeFor === "dark" ? ", for dark backgrounds" : "";
  return `${base}${t} (${i + 1})`;
}

/** For brand-kit warnings: styles where the best version still needs a plate, or can't print at all. */
export function logoTroubles(logos: ResolvedLogo[], vars: Record<string, string>, styles: StyleKey[]) {
  const plated: StyleKey[] = [], tooSmall: StyleKey[] = [];
  for (const s of styles) {
    if (!SLOTS[s]) continue;
    for (const size of [SIZES[0], SIZES[2]]) {
      const p = pickLogo(logos, s, size, vars);
      if (!p) { if (!tooSmall.includes(s)) tooSmall.push(s); }
      else if (p.plate && !plated.includes(s)) plated.push(s);
    }
  }
  return { plated, tooSmall };
}

/** Resolution advice for one variant: rasters need about 2× the largest size they'll print at. */
export function resolutionNote(v: LogoVariant): { level: "ok" | "soft" | "blurry"; text: string } {
  if (v.format === "svg") return { level: "ok", text: "Vector file: sharp at every size." };
  if (!v.h) return { level: "ok", text: "" };
  const short = Math.min(v.w, v.h);
  if (short < 70) return { level: "blurry", text: `${v.w}×${v.h}px: will look blurry. Ask whoever designed it for a bigger file.` };
  if (short < 180) return { level: "soft", text: `${v.w}×${v.h}px: fine for social posts, may look soft in print.` };
  return { level: "ok", text: `${v.w}×${v.h}px: sharp for social and A5 print.` };
}
