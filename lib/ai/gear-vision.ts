import "server-only";
import { postJSON } from "./http";
import { AIError } from "./types";

/** Category keys and spec keys match public.categories (migrations 0007, 0009). */
export const GEAR_CATEGORIES = {
  camera: ["kind", "grade", "full_frame", "resolution"], lens: ["kind", "focal_mm", "aperture", "full_frame", "grade"],
  gimbal: ["payload_kg"], light: ["kind", "watts", "rgb", "battery"], mic: ["kind", "wireless", "persons", "usb"],
  mixer: ["channels", "digital", "records"], headphones: [], grip: ["kind"], backdrop: ["kind"],
} as const;
export type GearCategory = keyof typeof GEAR_CATEGORIES;

export type GearSuggestion = {
  category: GearCategory | null;
  brand: string;
  model: string;
  name: string;               // what renters see, e.g. "Sony FX3 cinema camera"
  specs: Record<string, string | number | boolean>;
  confidence: "high" | "medium" | "low";
  note: string;               // one line for the vendor, e.g. "Check the wattage on the back plate."
};

const MODEL = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

const PROMPT = `You help a Lagos rental company list camera, lighting and audio gear for rent. Look at the photo and identify the item.
Return JSON only. Rules:
- category: one of ${Object.keys(GEAR_CATEGORIES).join(", ")}, or null if it isn't camera, lighting, audio or grip equipment.
- brand and model: only if a logo or model text is visible or the product is unmistakable; otherwise "".
- name: a short plain listing name renters understand, e.g. "Sony FX3 cinema camera", "RODE Wireless GO II", "Amaran COB 200x S".
- specs: only keys allowed for the category (${Object.entries(GEAR_CATEGORIES).map(([k, v]) => `${k}: ${v.join("/")}`).join("; ")}). Fill a spec only when it's visible or is the known value for the identified model. Never guess wattage or aperture from looks alone.
- confidence: high when brand+model are clearly visible, medium when the type is clear, low otherwise.
- note: one short sentence telling the owner what to check or photograph next (e.g. "Snap the lens barrel so we can read the focal length."). Plain English.`;

/** Photo of gear → a suggestion the vendor confirms on V7. Never final: the vendor always checks it. */
export async function suggestGear(jpegBase64: string): Promise<GearSuggestion> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError("config", "GEMINI_API_KEY is not set");
  const data = (await postJSON(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`,
    { "x-goog-api-key": key },
    {
      contents: [{ role: "user", parts: [{ text: PROMPT }, { inlineData: { mimeType: "image/jpeg", data: jpegBase64 } }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING", nullable: true }, brand: { type: "STRING" }, model: { type: "STRING" }, name: { type: "STRING" },
            specs: { type: "OBJECT", properties: Object.fromEntries([...new Set(Object.values(GEAR_CATEGORIES).flat())].map((k) => [k, { type: "STRING" }])) },
            confidence: { type: "STRING", enum: ["high", "medium", "low"] }, note: { type: "STRING" },
          },
          required: ["category", "name", "confidence", "note"],
        },
      },
    },
    "gemini",
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new AIError("invalid", "gemini: empty reply");
  return clean(JSON.parse(text));
}

/** Keep only allowed categories and spec keys, and type the spec values. */
function clean(raw: Record<string, unknown>): GearSuggestion {
  const category = (typeof raw.category === "string" && raw.category in GEAR_CATEGORIES ? raw.category : null) as GearCategory | null;
  const allowed: readonly string[] = category ? GEAR_CATEGORIES[category] : [];
  const specs: GearSuggestion["specs"] = {};
  for (const [k, v] of Object.entries((raw.specs as Record<string, unknown>) ?? {})) {
    if (!allowed.includes(k) || v === "" || v == null) continue;
    const s = String(v).trim();
    if (s === "true" || s === "false") specs[k] = s === "true";
    else if (/^\d+(\.\d+)?$/.test(s)) specs[k] = Number(s);
    else specs[k] = s.toLowerCase();
  }
  const str = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const confidence = raw.confidence === "high" || raw.confidence === "medium" ? raw.confidence : "low";
  return { category, brand: str(raw.brand, 40), model: str(raw.model, 40), name: str(raw.name), specs, confidence, note: str(raw.note, 160) };
}
