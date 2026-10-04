import type { CopyProvider, UnderstandInput } from "./types";

/*
 * Free, offline provider: the Phase 1 prototype's pattern parser (prototype/index.html parseBrief),
 * ported as-is. It never invents a value: anything it can't find stays empty.
 */
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const MONTH_FULL: Record<string, string> = { jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June", jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December" };
const MONTH_KEYS = Object.keys(MONTH_FULL);
const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const DATE_BITS = new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s*(of\\s+)?(${MONTHS})[a-z]*\\b|\\b(${MONTHS})[a-z]*\\.?\\s*\\d{1,2}(st|nd|rd|th)?\\b|\\b(${DAYS})\\b|\\bfrom\\b|\\bon\\b`, "gi");
const PRIMARY: Record<string, string> = { event: "title", invite: "occasion", announce: "headline", birthday: "name", service: "headline", thanks: "for_what", quote: "quote" };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const titleCase = (s: string) =>
  s.replace(/\S+/g, (w, i: number) => {
    if (/^[A-Z0-9]{2,}$/.test(w)) return w;
    if (i > 0 && /^(and|of|the|for|to|in|at|on|a)$/i.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  });

export function findDate(p: string): string {
  let m = p.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTHS})[a-z]*\\b`, "i")) || p.match(new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"));
  if (m) {
    const day = /\d/.test(m[1]) ? m[1] : m[2], mon = /\d/.test(m[1]) ? m[2] : m[1];
    return parseInt(day, 10) + " " + MONTH_FULL[mon.toLowerCase().slice(0, 3)];
  }
  m = p.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return parseInt(m[1], 10) + " " + MONTH_FULL[MONTH_KEYS[+m[2] - 1]];
  return "";
}
export function findTime(p: string): string { const m = p.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i); return m ? m[1].replace(/\s+/g, "").toLowerCase() : ""; }
function findDay(p: string): string { const m = p.match(new RegExp(`\\b(${DAYS})s?\\b`, "i")); return m ? cap(m[1].toLowerCase()) : ""; }

export function parseBrief(type: string, text: string): { fields: Record<string, string>; unplaced: string[] } {
  const out: Record<string, string> = {};
  const rest: string[] = [];
  let unplaced: string[] = [];
  const q = text.match(/["“]([^"”]{4,})["”]/);
  if (q) { out.quote = q[1].trim(); text = text.replace(q[0], ","); }
  const parts = text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    let m: RegExpMatchArray | null, used = false;
    const date = findDate(p), time = findTime(p);
    if ((m = p.match(/^(?:guest\s+)?(?:speaker|minister(?:ing)?|preacher)[:\s]+(.+)$/i))) { out.speaker = m[1]; used = true; }
    else if ((m = p.match(/^(?:hosted by|host|anchor)[:\s]+(.+)$/i))) { out.host = m[1]; used = true; }
    else if ((m = p.match(/^theme[:\s]+(.+)$/i))) { out.theme = m[1].replace(/^["“']|["”']$/g, ""); used = true; }
    else if ((m = p.match(/^dress\s*code[:\s]+(.+)$/i))) { out.dress = cap(m[1]); used = true; }
    else if ((m = p.match(/^rsvp(?:\s+to)?[:\s]+(.+)$/i))) { out.rsvp = m[1]; used = true; }
    else if ((m = p.match(/^(?:contact|call|enquiries)[:\s]+(.+)$/i))) { out.contact = m[1]; used = true; }
    else if ((m = p.match(/^from[:\s]+(the\s+.+|[A-Z].*)$/i)) && !date) { out.from = cap(m[1]); used = true; }
    else if ((m = p.match(/^(?:tagline|slogan)[:\s]+(.+)$/i))) { out.tagline = cap(m[1]); used = true; }
    if (!used && (m = p.match(/\b((?:[1-3]\s?)?[A-Z][a-z]+\.?\s+\d{1,3}:\d{1,3}(?:-\d{1,3})?)\b/))) { out.reference = m[1].trim(); used = p.replace(m[1], "").trim().length < 3; }
    if (!used && date && !out.date) {
      out.date = date; const dd = findDay(p); if (dd && !out.day) out.day = dd;
      const leftover = p.replace(DATE_BITS, "").replace(/\s+/g, " ").trim();
      if (leftover.length > 2 && type === "announce") rest.push(p);
      used = true;
    }
    if (!used && time) {
      out.time = time;
      const at = p.split(/\s+at\s+/i);
      if (at.length > 1) out.venue = titleCase(at.slice(1).join(" at ").replace(/^the\s+/i, ""));
      const d2 = findDay(at[0]); if (d2) out.day = d2;
      used = true;
    }
    if (!used && !out.venue && (m = p.match(/^(?:at|venue[:\s]+)\s*(?:the\s+)?(.+)$/i))) { out.venue = titleCase(m[1]); used = true; }
    if (!used && (m = p.match(/^(.+?)\s+turns\s+(\d{1,3})/i))) { out.name = titleCase(m[1]); out.milestone = "turns " + m[2]; used = true; }
    if (!used && (m = p.match(/^(?:thank you|thanks)(?:\s+(?:for|to))?\s*(.*)$/i))) { if (m[1]) out.for_what = cap(m[1]); used = true; }
    if (!used && /^see you\b/i.test(p)) { const sd = findDay(p); if (sd) out.day = sd; used = true; }
    if (!used && findDay(p) && p.split(/\s+/).length <= 2) { out.day = findDay(p); used = true; }
    if (!used) rest.push(p);
  }
  const primary = PRIMARY[type];
  if (rest.length && !out[primary] && !(type === "announce" && rest.length === 1 && out.headline)) {
    const main = rest.shift()!;
    out[primary] = type === "quote" ? main : type === "announce" ? cap(main) : titleCase(main);
  }
  if (rest.length) {
    if (type === "announce" || type === "birthday") out.message = rest.map(cap).join(". ").replace(/\.?$/, ".");
    else if (type === "thanks") out.items = rest.map(cap).join("\n");
    else if (type === "quote" && !out.occasion) out.occasion = cap(rest.join(" "));
    else unplaced = rest;
  }
  if (type === "service" && out.headline && /^see you/i.test(out.headline)) delete out.headline;
  return { fields: out, unplaced };
}

export const mockProvider: CopyProvider = {
  name: "mock",
  async understand(input: UnderstandInput) {
    return parseBrief(input.categoryKey, input.brief);
  },
};
