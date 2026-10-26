import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * bookings.required_trust for these bookings (null when not set). Read on its own and errors are
 * swallowed, so the dispatch board and booking pages keep working on a database without migration 0023.
 */
export async function requiredTrust(db: SupabaseClient, bookingIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const ids = [...new Set(bookingIds)];
  for (let i = 0; i < ids.length; i += 150) {
    try {
      const { data, error } = await db.from("bookings").select("id, required_trust").in("id", ids.slice(i, i + 150));
      if (error) return out;
      for (const r of (data ?? []) as { id: string; required_trust: number | null }[]) out.set(r.id, r.required_trust == null ? null : Number(r.required_trust));
    } catch {
      return out;
    }
  }
  return out;
}

export type KycSubmissionRow = {
  id: string;
  profile_id: string;
  method: string;
  id_type: string;
  doc_last4: string | null;
  front_path: string;
  back_path: string | null;
  selfie_path: string;
  consent_at: string;
  consent_version: string;
  status: string;
  reason_code: string | null;
  reason_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  media_deleted_at: string | null;
  created_at: string;
};

export const KYC_SUBMISSION_COLUMNS =
  "id, profile_id, method, id_type, doc_last4, front_path, back_path, selfie_path, consent_at, consent_version, status, reason_code, reason_note, reviewed_by, reviewed_at, media_deleted_at, created_at";

export type KycProfile = {
  id: string; full_name: string; phone: string; trust_level: number; blocked: boolean;
  kyc_status: string; kyc_reason: string | null; kyc_verified_at: string | null; kyc_expires_at: string | null;
  kyc_method: string | null; kyc_id_type: string | null; kyc_name: string | null;
};

export const KYC_PROFILE_COLUMNS =
  "id, full_name, phone, trust_level, blocked, kyc_status, kyc_reason, kyc_verified_at, kyc_expires_at, kyc_method, kyc_id_type, kyc_name";
