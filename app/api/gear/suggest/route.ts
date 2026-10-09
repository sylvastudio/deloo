import { suggestGear } from "@/lib/ai/gear-vision";
import { AIError } from "@/lib/ai/types";
import { userFromBearer } from "@/lib/api-auth";

export const maxDuration = 30;

const MAX_BASE64 = 2_000_000; // ~1.5 MB JPEG; the app compresses photos to well under this.

/** V7: photo of gear → suggested category, brand, model and specs. Vendors only. */
export async function POST(request: Request) {
  const auth = await userFromBearer(request);
  if (auth instanceof Response) return auth;
  const { count } = await auth.supabase.from("vendor_members").select("vendor_id", { count: "exact", head: true }).eq("user_id", auth.user.id);
  if (!count) return Response.json({ error: "Only gear owners can add gear." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  const image = typeof body?.image === "string" ? body.image.replace(/^data:image\/\w+;base64,/, "") : "";
  if (!image) return Response.json({ error: "Send a photo." }, { status: 400 });
  if (image.length > MAX_BASE64) return Response.json({ error: "That photo is too large. Try again." }, { status: 413 });

  try {
    return Response.json(await suggestGear(image));
  } catch (e) {
    const kind = e instanceof AIError ? e.kind : "network";
    console.error("[gear/suggest]", e);
    // The app falls back to the manual form on any error, so the vendor is never stuck.
    return Response.json({ error: kind === "rate_limit" ? "Busy right now. Fill it in yourself or try again in a minute." : "We couldn't read the photo. Fill it in yourself." }, { status: kind === "rate_limit" ? 429 : 502 });
  }
}
