import { AIError, type SlotSchema } from "./types";

/**
 * Checks a provider's reply against the poster type's fields. Keeps only known fields with
 * non-empty string values; anything else is dropped so nothing malformed reaches a poster.
 */
export function validateUnderstanding(raw: unknown, schema: SlotSchema): { fields: Record<string, string>; unplaced: string[] } {
  const obj = typeof raw === "string" ? safeParse(raw) : raw;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new AIError("invalid", "reply is not a JSON object");
  const rawFields = (obj as Record<string, unknown>).fields;
  if (!rawFields || typeof rawFields !== "object" || Array.isArray(rawFields)) throw new AIError("invalid", "reply has no fields object");
  const fields: Record<string, string> = {};
  for (const f of schema.fields) {
    const v = (rawFields as Record<string, unknown>)[f.key];
    if (typeof v === "string" && v.trim() && !/^(n\/?a|none|null|unknown|tbd)$/i.test(v.trim())) fields[f.key] = v.trim().slice(0, f.long ? 600 : 160);
  }
  const rawUnplaced = (obj as Record<string, unknown>).unplaced;
  const unplaced = Array.isArray(rawUnplaced) ? rawUnplaced.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim()).slice(0, 10) : [];
  return { fields, unplaced };
}

function safeParse(s: string): unknown {
  const t = s.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try { return JSON.parse(t); } catch { throw new AIError("invalid", "reply is not valid JSON"); }
}
