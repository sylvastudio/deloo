"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { posterVars, type Palette } from "@/lib/posters/colour";
import { POSTER_FONTS_URL } from "@/lib/posters/export";
import { posterMarkup, type Content, type PosterContext, type Size, type StyleKey } from "@/lib/posters/render";

/** Paper grain, generated once per page (same noise as the prototype). */
let grainReady = false;
function ensureGrain() {
  if (grainReady || typeof document === "undefined") return;
  grainReady = true;
  try {
    const c = document.createElement("canvas"), n = 160; c.width = n; c.height = n;
    const g = c.getContext("2d")!, img = g.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 34; }
    g.putImageData(img, 0, 0);
    const s = document.createElement("style");
    s.textContent = ".tpl .grain{background-image:url(" + c.toDataURL("image/png") + ");background-size:320px 320px;}";
    document.head.appendChild(s);
  } catch { /* no canvas: posters just have no grain */ }
}

/**
 * Shrinks headline (--hs) then body (--ts) text until nothing spills. Ported from the prototype's fitPoster.
 * Layout offsets ignore transforms, so this measures the full-size poster even while it's shown scaled.
 */
function fitPoster(tpl: HTMLElement, size: Size) {
  tpl.querySelectorAll<HTMLElement>("[data-giant]").forEach((g) => {
    const banner = size.cls.includes("sz-banner");
    const len = Math.max(3, (g.getAttribute("data-giant") ?? "").length), avail = banner ? 128 : 104;
    g.style.fontSize = Math.min(banner ? 44 : 36, avail / (len * .5)) + "cqmin";
  });
  const boxes = Array.from(tpl.querySelectorAll<HTMLElement>(".box")), hls = Array.from(tpl.querySelectorAll<HTMLElement>(".hl"));
  const spills = (b: HTMLElement) => {
    if (b.scrollWidth > b.clientWidth + 2 || b.scrollHeight > b.clientHeight + 2) return true;
    const limit = b.clientHeight - parseFloat(getComputedStyle(b).paddingBottom) + 1;
    for (const el of Array.from(b.children) as HTMLElement[]) if (el.offsetParent === b && el.offsetTop + el.offsetHeight > limit) return true;
    return false;
  };
  const over = () => boxes.some(spills) || hls.some((h) => h.scrollWidth > h.clientWidth + 2);
  let hs = 1, ts = 1, n = 0;
  tpl.style.setProperty("--hs", "1"); tpl.style.setProperty("--ts", "1");
  while (over() && n < 45) {
    if (hs > .42) hs *= .93; else ts *= .93;
    tpl.style.setProperty("--hs", hs.toFixed(3)); tpl.style.setProperty("--ts", ts.toFixed(3)); n++;
  }
}

type Props = {
  style: StyleKey; size: Size; content: Content; ctx: PosterContext; palette: Palette; grain: boolean;
  /** Tallest the preview may be, as CSS (e.g. "62vh"). Width is always at most 100% of the parent. */
  maxHeight?: string;
  label?: string;
  /** The full-size poster element, for PNG export. */
  posterRef?: RefObject<HTMLDivElement | null>;
};

/** A poster rendered at its real pixel size and scaled to fit its box. */
export function Poster({ style, size, content, ctx, palette, grain, maxHeight = "70vh", label, posterRef }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const ownPoster = useRef<HTMLDivElement | null>(null);
  const poster = posterRef ?? ownPoster;
  const [scale, setScale] = useState(0);
  const vars = useMemo(() => posterVars(palette), [palette]);
  const html = useMemo(() => posterMarkup(style, size, content, ctx, grain, vars), [style, size, content, ctx, grain, vars]);

  useEffect(ensureGrain, []);

  // Scale the full-size poster into the frame's current width.
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / size.w);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w]);

  // Fit text now, and again once the poster fonts have loaded (they change every measurement).
  useLayoutEffect(() => {
    const tpl = poster.current?.firstElementChild as HTMLElement | null;
    if (!tpl) return;
    fitPoster(tpl, size);
    let live = true;
    const refit = () => { if (live && tpl.isConnected) fitPoster(tpl, size); };
    document.fonts?.ready.then(refit);
    document.fonts?.addEventListener("loadingdone", refit);
    return () => { live = false; document.fonts?.removeEventListener("loadingdone", refit); };
  }, [html, vars, size, poster]);

  return (
    <>
      <link rel="stylesheet" href={POSTER_FONTS_URL} precedence="default" />
      <div
        ref={frame}
        className="frame"
        role="img"
        aria-label={label}
        style={{ width: `min(100%, calc(${maxHeight} * ${size.w / size.h}))`, aspectRatio: `${size.w} / ${size.h}` }}
      >
        <div
          ref={poster}
          className="poster"
          style={{ ...vars, width: size.w, height: size.h, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" } as React.CSSProperties}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </>
  );
}
