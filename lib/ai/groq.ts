import { postJSON } from "./http";
import { buildPrompt } from "./prompt";
import { AIError, type CopyProvider } from "./types";

// Free tier from console.groq.com (OpenAI-compatible API, open models). TEST DATA only.
const MODEL = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export const groqProvider: CopyProvider = {
  name: "groq",
  async understand(input) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new AIError("config", "GROQ_API_KEY is not set");
    const { system, user } = buildPrompt(input);
    const data = (await postJSON(
      "https://api.groq.com/openai/v1/chat/completions",
      { Authorization: `Bearer ${key}` },
      {
        model: MODEL(), temperature: 0.2, response_format: { type: "json_object" },
        // gpt-oss models "think" before answering; low effort keeps each brief well inside the free tier's 8k tokens/minute.
        ...(MODEL().startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      },
      "groq",
    )) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new AIError("invalid", "groq: empty reply");
    return text;
  },
};
