/**
 * Renders every Deloo icon (APK, iOS, splash, app web, website + admin favicon) from one vector mark:
 * a white "d" (Inter Bold, as a path in brand/d-glyph.path) and a marigold dot, on lagoon.
 * Run from the repo root: node scripts/make-icons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const LAGOON = "#0F6B73";
const WHITE = "#FFFFFF";
const MARIGOLD = "#F2A900";
const D = readFileSync("brand/d-glyph.path", "utf8").trim();

// Glyph box in font units (Inter Bold "d", 2048 upm): x 81..1163, y -19..1490. The dot sits on the baseline.
const GX = 81, GW = 1082, GTOP = 1490, GH = 1509, DOT = 300, GAP = 70;
const MARK_W = GW + GAP + DOT;

/** The mark centred in a `size` square, `h` = mark height as a share of the square. */
function mark(size, h, { d = WHITE, dot = MARIGOLD } = {}) {
  const s = (size * h) / GH;
  const x0 = (size - MARK_W * s) / 2;
  const top = (size - GH * s) / 2;
  const base = top + GTOP * s;
  const cx = x0 + (GW + GAP + DOT / 2) * s;
  const cy = base - (DOT / 2) * s - 19 * s;
  return `<path fill="${d}" transform="translate(${x0 - GX * s} ${base}) scale(${s} ${-s})" d="${D}"/>`
    + `<circle fill="${dot}" cx="${cx}" cy="${cy}" r="${(DOT / 2) * s}"/>`;
}

const svg = (size, body, bg = "") => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${body}</svg>`);
const square = (size) => `<rect width="${size}" height="${size}" fill="${LAGOON}"/>`;
const rounded = (size) => `<rect width="${size}" height="${size}" rx="${size * 0.225}" fill="${LAGOON}"/>`;

/** Full-bleed square (iOS, Expo, maskable, apple-touch: the platform rounds it). */
const full = (size, h = 0.46) => svg(size, mark(size, h), square(size));
/** Rounded square with transparent corners (favicons, "any" web icons). */
const tile = (size, h = 0.5) => svg(size, mark(size, h), rounded(size));

async function png(buf, out, size) {
  await sharp(buf, { density: 72 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  console.log("wrote", out);
}

/** A .ico holding PNG images (supported by every current browser). */
async function ico(out, sizes) {
  const pngs = await Promise.all(sizes.map((n) => sharp(tile(n, 0.56)).png().toBuffer()));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((n, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(n >= 256 ? 0 : n, e); head.writeUInt8(n >= 256 ? 0 : n, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  writeFileSync(out, Buffer.concat([head, ...pngs]));
  console.log("wrote", out);
}

const A = "mobile/assets/images";
writeFileSync("brand/deloo-icon.svg", full(1024));
writeFileSync("brand/deloo-mark-white.svg", svg(1024, mark(1024, 0.8)));

// Native app (Expo): iOS + generic icon, Android adaptive layers, splash.
await png(full(1024), `${A}/icon.png`, 1024);
// Adaptive icons are masked to the middle ~61% (a circle on many launchers): keep the mark well inside.
await png(svg(1024, mark(1024, 0.3)), `${A}/android-icon-foreground.png`, 1024);
await png(svg(1024, "", square(1024)), `${A}/android-icon-background.png`, 1024);
await png(svg(1024, mark(1024, 0.3, { d: WHITE, dot: WHITE })), `${A}/android-icon-monochrome.png`, 1024);
await png(svg(1024, mark(1024, 0.8)), `${A}/splash-icon.png`, 512);
await png(tile(192), `${A}/favicon.png`, 48);

// App on the web (mobile/public) and the website + admin (public, app/favicon.ico).
for (const dir of ["mobile/public/icons", "public/icons"]) {
  await png(full(180), `${dir}/apple-touch-icon.png`, 180);
  await png(tile(192), `${dir}/icon-192.png`, 192);
  await png(tile(512), `${dir}/icon-512.png`, 512);
  await png(full(512, 0.36), `${dir}/icon-maskable-512.png`, 512);
}
await ico("app/favicon.ico", [16, 32, 48]);
await ico("mobile/public/favicon.ico", [16, 32, 48]);
