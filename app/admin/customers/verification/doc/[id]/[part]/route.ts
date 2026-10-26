import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/admin/auth";
import { isUuid } from "@/lib/admin/guard";
import { isKycPart, KYC_BUCKET } from "@/lib/admin/kyc";
import { can } from "@/lib/admin/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** Seconds a document link stays valid: just long enough for the browser to follow the redirect. */
const TTL = 60;

const deny = (status: number, text: string) =>
  new NextResponse(text, { status, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } });

/**
 * One ID document or selfie from the private kyc-documents bucket (A-72). Owner, admin and ops only
 * (riders, finance and read-only get 403). Each view is written to audit_log (NDPA: the selfie is
 * biometric data), then the browser is sent to a signed URL that lasts a minute. The URL is made with the
 * reviewer's own session, so storage RLS checks the role a second time. The page never holds signed URLs.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; part: string }> }) {
  const { id, part } = await params;
  if (!isUuid(id) || !isKycPart(part)) return deny(404, "Not found");
  const staff = await getStaff();
  if (!staff) return deny(401, "Sign in again.");
  if (!can(staff.role, "kyc.review")) return deny(403, "Your role can’t view ID documents.");

  const db = await createClient();
  const { data: sub } = await db.from("kyc_submissions")
    .select("id, profile_id, front_path, back_path, selfie_path, media_deleted_at").eq("id", id).maybeSingle();
  if (!sub) return deny(404, "Not found");
  if (sub.media_deleted_at) return deny(410, "These images were deleted under the retention policy.");
  const path = (part === "front" ? sub.front_path : part === "back" ? sub.back_path : sub.selfie_path) as string | null;
  if (!path) return deny(404, "No image for this side.");

  const { data, error } = await db.storage.from(KYC_BUCKET).createSignedUrl(path, TTL);
  if (error || !data?.signedUrl) return deny(404, "Image not found.");

  // No log, no image.
  const { error: logErr } = await createServiceClient().from("audit_log").insert({
    actor_id: staff.userId, action: "kyc_view", entity: "kyc_submissions", entity_id: id,
    after: { part, profile_id: sub.profile_id },
  });
  if (logErr) {
    console.error("[admin] kyc view not logged:", logErr.message);
    return deny(503, "Couldn’t log this view, so the image isn’t shown. Try again.");
  }

  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
