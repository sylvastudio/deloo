import Anthropic from "@anthropic-ai/sdk";

import { readShootWithClaude } from "@/lib/ai/claude";
import { userFromBearer } from "@/lib/api-auth";

export const maxDuration = 15;

const MAX_TEXT = 1000;

/**
 * Fallback reader for the renter app (behind AI_READ=on): the shoot description → planner answers.
 * The app calls it only when its own offline reader left required answers empty or the text is long
 * or slangy, and uses only the answers it couldn't fill itself. Never prices, holds or pays.
 */
export async function POST(request: Request) {
  if (process.env.AI_READ !== "on" || !process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The reader is off." }, { status: 503 });
  }
  const auth = await userFromBearer(request);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => null)) as { text?: unknown; today?: unknown; tz?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Send the description." }, { status: 400 });
  if (text.length > MAX_TEXT) return Response.json({ error: "That’s a lot of words. Keep it short." }, { status: 413 });
  // Lagos only for now: the app's "today", if it's within a day of the server's Lagos date, else the server's.
  const lagosToday = new Date(Date.now() + 3.6e6).toISOString().slice(0, 10);
  const sent = typeof body?.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : "";
  const today = sent && Math.abs(Date.parse(`${sent}T00:00:00Z`) - Date.parse(`${lagosToday}T00:00:00Z`)) <= 864e5 ? sent : lagosToday;

  try {
    const answers = await readShootWithClaude(text, today, 8000);
    return Response.json({ answers, today });
  } catch (e) {
    console.error("[plan/read]", e instanceof Error ? e.message : e);
    const busy = e instanceof Anthropic.RateLimitError;
    const slow = e instanceof Anthropic.APIConnectionTimeoutError;
    return Response.json({ error: busy ? "Busy right now." : slow ? "Took too long." : "Couldn’t read that." }, { status: busy ? 429 : slow ? 504 : 502 });
  }
}
