import { postJSON } from "./http";
import { buildPrompt } from "./prompt";
import { AIError, type CopyProvider } from "./types";

// Free tier from Google AI Studio. Free-tier prompts may be used by Google to improve its models: TEST DATA only.
const MODEL = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

export const geminiProvider: CopyProvider = {
  name: "gemini",
  async understand(input) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new AIError("config", "GEMINI_API_KEY is not set");
    const { system, user } = buildPrompt(input);
    const properties = Object.fromEntries(input.schema.fields.map((f) => [f.key, { type: "STRING", description: f.label }]));
    const data = (await postJSON(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`,
      { "x-goog-api-key": key },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: { type: "OBJECT", properties: { fields: { type: "OBJECT", properties }, unplaced: { type: "ARRAY", items: { type: "STRING" } } }, required: ["fields"] },
        },
      },
      "gemini",
    )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new AIError("invalid", "gemini: empty reply");
    return text;
  },
};
