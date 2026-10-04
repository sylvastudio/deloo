import { geminiProvider } from "./gemini";
import { groqProvider } from "./groq";
import { mockProvider } from "./mock";
import { AIError, type CopyProvider, type ProviderName, type UnderstandInput, type Understanding } from "./types";
import { validateUnderstanding } from "./validate";

export { AIError } from "./types";
export type { Understanding } from "./types";

const PROVIDERS: Record<ProviderName, CopyProvider> = { mock: mockProvider, gemini: geminiProvider, groq: groqProvider };

function pick(name: string | undefined): CopyProvider {
  return PROVIDERS[(name as ProviderName) ?? "mock"] ?? mockProvider;
}

/**
 * Brief → fields for one poster type. AI_PROVIDER picks the model (mock | gemini | groq; default mock).
 * An invalid reply is retried once, then reported. A rate-limited or unreachable provider falls back
 * to AI_FALLBACK (e.g. groq, or mock) when set, so free-tier limits don't block testing.
 */
export async function understandBrief(input: UnderstandInput, opts: { provider?: string } = {}): Promise<Understanding> {
  const primary = pick(opts.provider ?? process.env.AI_PROVIDER);
  try {
    return await run(primary, input);
  } catch (e) {
    const fallback = process.env.AI_FALLBACK;
    if (e instanceof AIError && (e.kind === "rate_limit" || e.kind === "network") && fallback && fallback !== primary.name) {
      return run(pick(fallback), input);
    }
    throw e;
  }
}

async function run(provider: CopyProvider, input: UnderstandInput): Promise<Understanding> {
  for (let attempt = 1; ; attempt++) {
    try {
      const raw = await provider.understand(input);
      return { ...validateUnderstanding(raw, input.schema), provider: provider.name };
    } catch (e) {
      if (e instanceof AIError && e.kind === "invalid" && attempt < 2) continue;
      throw e;
    }
  }
}
