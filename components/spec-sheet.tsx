"use client";
import type { RefObject } from "react";
import type { Palette } from "@/lib/posters/colour";
import type { PrintSpec } from "@/lib/posters/render";

export const SHEET = { w: 1080, h: 1350 };

export type SheetData = {
  org: string; title: string; style: string; spec: PrintSpec; fileName: string; px: { w: number; h: number };
  palette: Palette; thumb: string; date: string;
};

/**
 * The printer's spec sheet (PRD edge #5): one image a volunteer can WhatsApp to the printer at the junction.
 * Inline styles only, so it renders the same off-screen and in the exported PNG.
 */
export function SpecSheet({ data, sheetRef }: { data: SheetData; sheetRef: RefObject<HTMLDivElement | null> }) {
  const { spec } = data;
  const rows: [string, string][] = [
    ["Size", spec.label],
    ["Bleed", spec.bleedMm ? `${spec.bleedMm} mm on every edge. The file is ${spec.outMm[0]} × ${spec.outMm[1]} mm; trim to ${spec.trimMm?.[0]} × ${spec.trimMm?.[1]} mm.` : "None. Print the file edge to edge at full size."],
    ["File", `${data.fileName}\n${data.px.w} × ${data.px.h} px, ${spec.dpi} dpi at full size`],
    ["Material", spec.material],
    ["Finishing", spec.finishing],
    ["Colour", `Made on screen (RGB). Main colour ${data.palette.primary}, accent ${data.palette.accent}. If colour matters, ask for a proof first.`],
    ["Quantity", "____________"],
    ["Needed by", "____________"],
  ];
  return (
    <div ref={sheetRef} style={{
      width: SHEET.w, height: SHEET.h, boxSizing: "border-box", padding: 64, background: "#FFFFFF", color: "#12161C",
      fontFamily: '"Inter Tight", Arial, sans-serif', display: "flex", flexDirection: "column", gap: 28,
      // Inter Tight's contextual alternates turn "3x6" into "3×6"; file names must read exactly as saved.
      fontFeatureSettings: '"calt" 0',
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: '"Space Mono", monospace', fontSize: 22, letterSpacing: ".12em", textTransform: "uppercase" }}>
        <span>Print job</span><span>{data.date}</span>
      </div>
      <div>
        <div style={{ fontSize: 30, color: "#4A5560", fontWeight: 600 }}>{data.org}</div>
        <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-.02em", marginTop: 6 }}>{data.title}</div>
      </div>
      <div style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F5F4", borderRadius: 12, padding: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail inside an exported image */}
        <img src={data.thumb} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", boxShadow: "0 8px 24px rgba(0,0,0,.18)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", rowGap: 16, columnGap: 24, fontSize: 25, lineHeight: 1.3 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 19, textTransform: "uppercase", letterSpacing: ".08em", color: "#4A5560", paddingTop: 4 }}>{k}</div>
            <div style={{ whiteSpace: "pre-line", fontWeight: 500 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 14, fontSize: 20, color: "#4A5560" }}>
        <span style={{ display: "inline-flex", gap: 6 }}>
          {[data.palette.primary, data.palette.accent, data.palette.paper, data.palette.ink].map((c) => <i key={c} style={{ width: 26, height: 26, borderRadius: 13, background: c, border: "1px solid #D3DADB", display: "block" }} />)}
        </span>
        Made with Deloo · {data.style}
      </div>
    </div>
  );
}
