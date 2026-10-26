"use server";
import { updateTag } from "next/cache";
import type { ActionResult } from "@/lib/admin/action-result";
import { friendlyError } from "@/lib/admin/data";
import { act, isUuid, str } from "@/lib/admin/guard";
import { isKycDecision, isKycReason, NAV_COUNTS_TAG } from "@/lib/admin/kyc";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const DONE: Record<string, string> = {
  approve: "Verified at tier 2. They can book camera gear now.",
  approve_t3: "Verified at tier 3.",
  needs_more: "Sent back: the renter is asked for new photos.",
  reject: "Rejected.",
};

/**
 * A reviewer's decision on one ID submission (A-72). staff_decide_kyc runs with the reviewer's own
 * session: it checks the role (owner/admin/ops), sets the profile's status and trust, and writes
 * audit_log. The RPC has no parameter for the name as printed on the ID, so when the reviewer typed one
 * it is saved to profiles.kyc_name after a successful approve, with the service role (renters can't
 * write that column), and audited here. Only 'pending' submissions can be decided; 'needs_more' ones
 * wait for the renter to send a new submission.
 */
export async function decideKyc(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("kyc.review", async (staff) => {
    const submission = str(form, "submission_id");
    const decision = str(form, "decision");
    const reason = str(form, "reason_code");
    const note = str(form, "note").slice(0, 500);
    const name = str(form, "kyc_name").replace(/\s+/g, " ").slice(0, 120);
    if (!isUuid(submission)) return { error: "Unknown submission." };
    if (!isKycDecision(decision)) return { error: "Choose a decision." };
    const needsReason = decision === "needs_more" || decision === "reject";
    if (needsReason && !isKycReason(reason)) return { error: "Pick a reason. The renter sees it." };
    if (reason === "other" && note.length < 3) return { error: "Say what’s wrong in the note: the renter sees it." };

    const db = await createClient();
    const { data: sub, error: subErr } = await db.from("kyc_submissions").select("id, profile_id, status").eq("id", submission).maybeSingle();
    if (subErr) return { error: friendlyError(subErr) };
    if (!sub) return { error: "Submission not found." };
    if (sub.status !== "pending") return { error: sub.status === "needs_more" ? "This one is waiting on the renter’s new photos." : "Someone already decided this one. Reload the page." };
    if (sub.profile_id === staff.userId) return { error: "You can’t review your own ID." };

    const { error } = await db.rpc("staff_decide_kyc", {
      p_submission: submission,
      p_decision: decision,
      p_reason_code: needsReason ? reason : null,
      p_note: note || null,
    });
    if (error) return { error: friendlyError(error) };
    updateTag(NAV_COUNTS_TAG);

    if (name && (decision === "approve" || decision === "approve_t3")) {
      const admin = createServiceClient();
      const { data: before } = await admin.from("profiles").select("kyc_name").eq("id", sub.profile_id).maybeSingle();
      if ((before?.kyc_name ?? "") !== name) {
        const { error: nameErr } = await admin.from("profiles").update({ kyc_name: name }).eq("id", sub.profile_id);
        if (nameErr) return { error: `Decision saved, but the name on the ID wasn’t: ${friendlyError(nameErr)}` };
        await admin.from("audit_log").insert({
          actor_id: staff.userId, action: "kyc_name", entity: "profiles", entity_id: sub.profile_id,
          before: { kyc_name: before?.kyc_name ?? null }, after: { kyc_name: name, submission },
        });
      }
    }
    return { ok: DONE[decision] };
  });
}
