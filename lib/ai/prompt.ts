import type { UnderstandInput } from "./types";

/**
 * The next three weeks with weekday names. Models get relative dates ("this Wednesday") wrong when
 * they have to count; a lookup table fixes that. Uses Lagos time, Deloo's first market.
 */
export function upcomingDates(now = new Date(), days = 21): string {
  const fmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" });
  return Array.from({ length: days }, (_, i) => fmt.format(new Date(now.getTime() + i * 86400000))).join("; ");
}

/** One prompt for every provider, so switching models doesn't change Deloo's rules. */
export function buildPrompt(input: UnderstandInput): { system: string; user: string } {
  const fieldList = input.schema.fields
    .map((f) => `- "${f.key}": ${f.label}${f.required ? " (required)" : ""}${f.hint ? `. ${f.hint}` : ""}${f.placeholder ? `. Example: ${f.placeholder}` : ""}`)
    .join("\n");
  const system = [
    "You read short poster briefs written by church, school and community volunteers, often in Nigerian English, and pick out the details for a poster.",
    "Rules:",
    "1. Only use details that are in the brief. Never invent a date, time, venue, name or any other fact. If a detail isn't there, leave that field out.",
    "2. Keep every honorific the brief uses (Pastor, Evang., Rev., Chief, Alhaji, HRM, Dr., Sister, Brother) and capitalise names and titles properly (\"pastor tolu\" becomes \"Pastor Tolu\"). Never add a title nobody wrote.",
    "3. Write dates as day then month name, e.g. \"3 October\". For relative dates (\"next Sat\", \"this Wednesday\", \"tomorrow\") look the date up in the calendar given; don't calculate it. \"This <day>\" is the first such day after today; \"next <day>\" is the one after that if today's week still has one, otherwise the first one. Times like \"4pm\" or \"10:30am\".",
    "4. Expand obvious abbreviations (\"main aud\" means \"Main Auditorium\", \"conf\" means \"Conference\") and use title case for event names and venues.",
    "5. Fix obvious typos and use sentence case for taglines, messages and list items. Don't reword quotes or scripture.",
    "6. A required title or headline may be written as a short phrase built only from facts in the brief (\"Midweek service moves to 6pm\"). Never invent new facts to fill it.",
    "7. Put anything useful that fits no field into \"unplaced\".",
    'Reply with JSON only, in this shape: {"fields": {"<field key>": "<value>"}, "unplaced": ["<text>"]}',
  ].join("\n");
  const user = `Today is ${input.today}.\nCalendar (today first): ${upcomingDates()}.\nPoster type: ${input.categoryLabel}\nFields:\n${fieldList}\n\nBrief:\n"""${input.brief.slice(0, 2000)}"""`;
  return { system, user };
}
