/**
 * Runs sample briefs through the AI layer and checks Deloo's rules hold:
 * fields stay inside the poster type's schema, required fields are found in the examples,
 * and nothing is invented (a brief with no date must come back with no date).
 *
 *   npm run check:ai                 # provider from AI_PROVIDER in .env.local (default mock)
 *   npm run check:ai -- gemini groq  # compare providers side by side
 */
import { readFileSync, existsSync } from "node:fs";
import { understandBrief } from "../lib/ai";
import { CATEGORIES, getCategory } from "../lib/catalog";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const providers = process.argv.slice(2).length ? process.argv.slice(2) : [process.env.AI_PROVIDER || "mock"];
// Same format and timezone as the API route.
const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date());

// The 7 prototype examples, plus messy real-world briefs the mock can't handle well.
// The date a relative day name should resolve to, e.g. nextDay("Wednesday") → "7 October".
function nextDay(weekday: string, skipThisWeek = false): RegExp {
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "Africa/Lagos" }).format(d);
  const now = Date.now();
  let first = 0;
  for (let i = 1; i <= 7; i++) if (fmt(new Date(now + i * 86400000), { weekday: "long" }) === weekday) { first = i; break; }
  const d = new Date(now + (first + (skipThisWeek ? 7 : 0)) * 86400000);
  return new RegExp(`^${fmt(d, { day: "numeric", month: "long" })}$`);
}

// aiOnly: the mock pattern parser isn't expected to understand these; only the "nothing invented" rule applies to it.
const CASES: { category: string; brief: string; expect?: Record<string, RegExp>; absent?: string[]; aiOnly?: boolean }[] = [
  ...CATEGORIES.map((c) => ({ category: c.key, brief: c.schema.example!, expect: Object.fromEntries(c.schema.fields.filter((f) => f.required).map((f) => [f.key, /\S/])) })),
  { category: "event", brief: "pls flyer for youth fest next sat 4pm, pastor tolu ministering, theme rise & shine, main aud", expect: { title: /youth/i, time: /4/, venue: /main auditorium/i, speaker: /^Pastor Tolu$/ }, aiOnly: true },
  { category: "event", brief: "Men's breakfast meeting with Evang. Chinedu Okoro as guest, theme Building Strong Homes", absent: ["date", "venue", "time"] },
  { category: "announce", brief: "Midweek service now holds by 6pm instead of 5pm starting this wednesday", expect: { headline: /\S/, date: nextDay("Wednesday") }, aiOnly: true },
  { category: "event", brief: "Prayer vigil this friday 10pm at the church, minister: Rev. Grace Obi", expect: { date: nextDay("Friday"), time: /10pm/i, speaker: /^Rev\. Grace Obi$/ }, aiOnly: true },
];

async function main() {
let failed = 0;
for (const provider of providers) {
  console.log(`\n=== ${provider} ===`);
  for (const c of CASES) {
    // Free tiers limit tokens per minute (Groq: 8k); pace real providers so the check measures the model, not the limit.
    if (provider !== "mock") await new Promise((r) => setTimeout(r, Number(process.env.AI_CHECK_DELAY_MS ?? 6000)));
    const cat = getCategory(c.category)!;
    const t0 = Date.now();
    try {
      const r = await understandBrief({ brief: c.brief, categoryKey: cat.key, categoryLabel: cat.label, schema: cat.schema, today }, { provider });
      const problems: string[] = [];
      const keys = new Set(cat.schema.fields.map((f) => f.key));
      for (const k of Object.keys(r.fields)) if (!keys.has(k)) problems.push(`unknown field ${k}`);
      for (const [k, re] of Object.entries(c.aiOnly && provider === "mock" ? {} : c.expect ?? {})) if (!re.test(r.fields[k] ?? "")) problems.push(`missing ${k}`);
      for (const k of c.absent ?? []) if (r.fields[k]) problems.push(`invented ${k}="${r.fields[k]}"`);
      if (r.provider !== provider) problems.push(`answered by ${r.provider} (fallback), not ${provider}`);
      if (problems.length) failed++;
      console.log(`${problems.length ? "FAIL" : "PASS"} ${cat.key.padEnd(8)} ${String(Date.now() - t0).padStart(5)}ms [${r.provider}] ${JSON.stringify(r.fields)}${r.unplaced.length ? `  unplaced=${JSON.stringify(r.unplaced)}` : ""}${problems.length ? `  <- ${problems.join("; ")}` : ""}`);
    } catch (e) {
      failed++;
      console.log(`ERR  ${cat.key.padEnd(8)} ${(e as Error).message}`);
    }
  }
}
console.log(failed ? `\n${failed} case(s) failed` : "\nAll AI checks passed");
process.exit(failed ? 1 : 0);
}
main();
