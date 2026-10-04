"use client";
import { useEffect, useState } from "react";
import { blobToDataURL, remeasure } from "./analyse";
import type { LogoVariant, ResolvedLogo } from "./logos";

/**
 * Turns the kit's signed logo links into data URLs (signed links expire; exports must not break) and measures
 * any logo saved before analysis existed, so old kits get the right version picked straight away.
 * A file that fails to load keeps its place with an empty src (never dropped, so a save can't lose it).
 * `ready` stays false until every file has been tried.
 */
export function useResolvedLogos(logos: (LogoVariant & { url: string | null })[]): { logos: ResolvedLogo[]; ready: boolean } {
  const key = logos.map((l) => l.id + (l.url ?? "")).join("|");
  const [state, setState] = useState<{ key: string | null; logos: ResolvedLogo[] }>({ key: logos.length ? null : key, logos: [] });
  useEffect(() => {
    let live = true;
    Promise.all(logos.map(async ({ url, ...l }): Promise<ResolvedLogo> => {
      if (!url) return { ...l, src: "" };
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const src = await blobToDataURL(await res.blob());
        return l.lumHist && l.w ? { ...l, src } : { ...l, ...(await remeasure(src, l.format)), src };
      } catch { return { ...l, src: "" }; }
    })).then((r) => { if (live) setState({ key, logos: r }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures the logos that matter
  }, [key]);
  return { logos: state.key === key ? state.logos : [], ready: state.key === key };
}
