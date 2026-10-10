/**
 * Uploads Deloo's own stock photos (supabase/inventory-photos/<site id>-<n>.jpg) to the public `items`
 * bucket as <in-house vendor id>/<site id>-<n>.jpg, the paths supabase/inventory_deloo.sql stores.
 * Uses the service role key (server only, from .env.local). Safe to re-run: it overwrites.
 *
 *   npx tsx scripts/upload-inventory-photos.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const line = file.split("\n").find((l) => l.startsWith(name + "="));
  if (!line) throw new Error(`${name} missing: set it in the environment or .env.local`);
  return line.slice(name.length + 1).trim();
}

const HOUSE_VENDOR = "de100000-0000-4000-8000-000000000001";
const dir = new URL("../supabase/inventory-photos/", import.meta.url);
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function main() {
  let failed = 0;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort()) {
    const { error } = await supabase.storage
      .from("items")
      .upload(`${HOUSE_VENDOR}/${name}`, readFileSync(new URL(name, dir)), { contentType: "image/jpeg", upsert: true });
    console.log(error ? `✗ ${name}: ${error.message}` : `✓ ${name}`);
    if (error) failed++;
  }
  process.exit(failed ? 1 : 0);
}
main();
