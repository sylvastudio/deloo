import { NextResponse, type NextRequest } from "next/server";
import { AIError, understandBrief } from "@/lib/ai";
import { getCategory } from "@/lib/catalog";
import { getMembership } from "@/lib/org";

const MESSAGES: Record<AIError["kind"], string> = {
  rate_limit: "Deloo is busy right now. Try again in a minute.",
  invalid: "I couldn't read that one. Try rewording it, or fill in the details yourself.",
  network: "Couldn't reach the AI service. Check your connection and try again.",
  config: "The AI service isn't set up yet. Fill in the details yourself for now.",
};

/** POST { brief, category } → { fields, unplaced, provider }. Signed-in members only, to protect free-tier quota. */
export async function POST(request: NextRequest) {
  const m = await getMembership();
  if (!m) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { brief?: unknown; category?: unknown } | null;
  const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
  const category = typeof body?.category === "string" ? getCategory(body.category) : undefined;
  if (!brief) return NextResponse.json({ error: "Describe the design first." }, { status: 400 });
  if (!category) return NextResponse.json({ error: "Unknown poster type." }, { status: 400 });

  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date());
  try {
    const result = await understandBrief({ brief, categoryKey: category.key, categoryLabel: category.label, schema: category.schema, today });
    return NextResponse.json(result);
  } catch (e) {
    const kind = e instanceof AIError ? e.kind : "network";
    console.error("[understand]", e);
    return NextResponse.json({ error: MESSAGES[kind], kind }, { status: kind === "rate_limit" ? 429 : 502 });
  }
}
