// Local naming conventions (PRD §3 edge #2, Phase 4). The AI is told to keep honorifics; this makes sure.
// For every field that holds a person's name, the title is whatever the brief wrote in front of that name:
// dropped titles are put back, invented ones are taken off. Pure: runs on the server after validation.

import type { SlotSchema } from "./ai/types";

/** Titles used on Nigerian church, school and community posters. Longest first so chains match whole. */
export const HONORIFICS = [
  "Pastor (Mrs.)", "Pastor (Mrs)", "Chief (Dr.)", "Rev. Dr.", "Rev Dr", "Archbishop", "Prophetess", "Evangelist", "Deaconess", "Reverend",
  "Apostle", "Prophet", "Bishop", "Deacon", "Pastor", "Alhaja", "Alhaji", "Mallam", "Sister", "Brother", "Elder", "Chief", "Mummy", "Daddy",
  "Evang.", "Evang", "Engr.", "Engr", "Barr.", "Barr", "Prof.", "Prof", "Dcns.", "Dcn.", "Mama", "Papa", "Miss", "Rev.", "Rev", "Pst.", "Pst",
  "Hon.", "Hon", "Sis.", "Bro.", "Mrs.", "Mrs", "Dr.", "Dr", "Mr.", "Mr", "Ms.", "HRM", "HRH", "Oba",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ALT = HONORIFICS.map(esc).join("|");
/** One or more titles at the start of a value, e.g. "Rev. Dr. " in "Rev. Dr. Grace Obi". */
const LEADING = new RegExp(`^((?:(?:${ALT})(?=[\\s(]|$)\\s*)+)`, "i");

/** A title as the brief wrote it, with its letters cased the conventional way ("pst" → "Pst", "hrm" → "HRM"). */
function caseTitles(raw: string): string {
  return raw.trim().split(/\s+/).map((w) => HONORIFICS.find((h) => h.toLowerCase() === w.toLowerCase()) ?? w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** The titles the brief puts directly in front of `name`, or "" if none (or the name isn't in the brief). */
export function titlesBefore(brief: string, name: string): string {
  if (!name.trim()) return "";
  const re = new RegExp(`((?:\\b(?:${ALT})\\s+)+)${esc(name.trim()).replace(/ +/g, "\\s+")}\\b`, "i");
  const m = brief.match(re);
  return m ? caseTitles(m[1]) : "";
}

/** Role words a model sometimes glues onto a name ("Minister pst. Femi"); the role belongs in the role line. */
const ROLE_WORDS = /^(?:guest\s+speaker|special\s+guest|guest\s+minister|guest|speaker|minister(?:ing)?|preacher|host(?:ed\s+by)?|anchor(?:ed\s+by)?|with|by)[:\s]+/i;
const ROLES: [RegExp, string][] = [
  [/guest\s+speaker/i, "Guest speaker"], [/special\s+guest/i, "Special guest"], [/guest\s+minister/i, "Guest minister"],
  [/preacher/i, "Preacher"], [/minister(?:ing)?/i, "Ministering"], [/speaker/i, "Speaker"], [/guest/i, "Special guest"],
];

/** The role the brief puts in front of a person ("guest speaker Pastor Tolu" → "Guest speaker"), or "". */
export function roleBefore(brief: string, name: string): string {
  const bare = name.replace(LEADING, "").trim();
  if (!bare) return "";
  const m = brief.match(new RegExp(`(guest\\s+speaker|special\\s+guest|guest\\s+minister|preacher|minister(?:ing)?|speaker|guest)\\b[:\\s-]*(?:(?:${ALT})\\s+)*${esc(bare).replace(/ +/g, "\\s+")}\\b`, "i"));
  if (!m) return "";
  return ROLES.find(([re]) => re.test(m[1]))?.[1] ?? "";
}

/** Keeps a person's title exactly as the brief has it. */
export function fixPerson(brief: string, value: string): string {
  let v = value.trim();
  while (ROLE_WORDS.test(v) && !LEADING.test(v)) v = v.replace(ROLE_WORDS, "").trim();
  const lead = caseTitles(v.match(LEADING)?.[1] ?? "");
  const name = v.slice(lead.length).trim();
  if (!name) return v;
  const fromBrief = titlesBefore(brief, name);
  if (fromBrief) return `${fromBrief} ${name}`; // dropped or reworded ("pst." → "Pastor"): the brief's own title wins
  if (lead && !fromBrief && new RegExp(`\\b${esc(name).replace(/ +/g, "\\s+")}\\b`, "i").test(brief)) return name; // invented: the brief names them without it
  return lead ? `${lead} ${name}` : v;
}

/** Applies the conventions to every person field of a poster type. */
export function applyConventions(schema: SlotSchema, brief: string, fields: Record<string, string>): Record<string, string> {
  const out = { ...fields };
  for (const f of schema.fields) if (f.person && out[f.key]) out[f.key] = fixPerson(brief, out[f.key]);
  // The role line comes from the brief's own words in front of the speaker; never a role nobody wrote.
  if (schema.fields.some((f) => f.key === "speaker_role")) {
    const role = out.speaker ? roleBefore(brief, out.speaker) : "";
    if (role) out.speaker_role = role;
    else if (out.speaker_role && !new RegExp(esc(out.speaker_role).replace(/ +/g, "\\s+"), "i").test(brief)) delete out.speaker_role;
  }
  return out;
}
