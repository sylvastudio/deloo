import { AIError } from "./types";

/** POST JSON with a timeout, mapping HTTP failures to AIError kinds the UI can explain. */
export async function postJSON(url: string, headers: Record<string, string>, body: unknown, provider: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new AIError("network", `${provider}: ${(e as Error).message}`);
  }
  if (res.status === 429) throw new AIError("rate_limit", `${provider}: free-tier limit reached`);
  if (res.status === 401 || res.status === 403) throw new AIError("config", `${provider}: API key rejected`);
  // Unknown or retired model: a setup problem, so it must not silently fall back to another provider.
  if (res.status === 404) throw new AIError("config", `${provider}: model not found. Set ${provider.toUpperCase()}_MODEL. ${(await res.text()).slice(0, 160)}`);
  if (!res.ok) throw new AIError("network", `${provider}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
