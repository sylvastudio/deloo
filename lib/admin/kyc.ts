/**
 * ID verification (KYC, manual path) for the admin: labels, reason codes and the dispatch gate.
 * The data model is docs/kyc-contract.md (migration 0023). Pure, safe on the client.
 */
import type { Tone } from "./status";

export type KycStatus = "none" | "pending" | "needs_more" | "verified" | "rejected";
export type KycSubmissionStatus = "pending" | "needs_more" | "verified" | "rejected";
export type KycIdType = "nin_slip" | "drivers_licence" | "voters_card" | "passport";
export type KycDecision = "approve" | "approve_t3" | "needs_more" | "reject";
export type KycPart = "front" | "back" | "selfie";

export const KYC_BUCKET = "kyc-documents";
export const KYC_PARTS: KycPart[] = ["front", "back", "selfie"];
export const KYC_PART_LABEL: Record<KycPart, string> = { front: "ID front", back: "ID back", selfie: "Selfie" };

export const KYC_STATUS_LABEL: Record<KycStatus, string> = {
  none: "Not verified", pending: "ID in review", needs_more: "Needs more", verified: "Verified", rejected: "Rejected",
};
export const KYC_STATUS_TONE: Record<KycStatus, Tone> = {
  none: "hollow", pending: "warn", needs_more: "warn", verified: "good", rejected: "bad",
};

export const KYC_ID_TYPE_LABEL: Record<KycIdType, string> = {
  nin_slip: "NIN slip", drivers_licence: "Driver’s licence", voters_card: "Voter’s card", passport: "Passport",
};
export const KYC_METHOD_LABEL: Record<string, string> = { manual: "Manual review", dojah: "Dojah", smile: "Smile ID" };

/** staff_decide_kyc reason codes. The DB stores the code and the note; the words are ours. */
export const KYC_REASONS = ["blurry", "glare", "id_expired", "face_unclear", "name_mismatch", "id_not_accepted", "other"] as const;
export type KycReason = (typeof KYC_REASONS)[number];
export const KYC_REASON_LABEL: Record<KycReason, string> = {
  blurry: "Photo is blurry",
  glare: "Glare covers the details",
  id_expired: "ID has expired",
  face_unclear: "Face not clear in the selfie",
  name_mismatch: "Name doesn’t match the account",
  id_not_accepted: "ID type not accepted",
  other: "Other (explain in the note)",
};

export const isKycReason = (v: string): v is KycReason => (KYC_REASONS as readonly string[]).includes(v);
export const isKycDecision = (v: string): v is KycDecision => ["approve", "approve_t3", "needs_more", "reject"].includes(v);
export const isKycPart = (v: string): v is KycPart => (KYC_PARTS as string[]).includes(v);

export const kycStatusLabel = (s: string | null | undefined) => KYC_STATUS_LABEL[(s ?? "none") as KycStatus] ?? s ?? "Not verified";
export const kycStatusTone = (s: string | null | undefined): Tone => KYC_STATUS_TONE[(s ?? "none") as KycStatus] ?? "neutral";
export const kycIdTypeLabel = (s: string | null | undefined) => (s ? KYC_ID_TYPE_LABEL[s as KycIdType] ?? s : "");
export const kycReasonLabel = (s: string | null | undefined) => (s ? KYC_REASON_LABEL[s as KycReason] ?? s : "");

/** Where the admin shows one document image: a route that checks the role, logs the view and redirects to a signed URL. */
export const kycDocHref = (submissionId: string, part: KycPart) => `/admin/customers/verification/doc/${submissionId}/${part}`;

/** The renter's trust is below what the booking needs (bookings.required_trust, snapshotted by create_hold). */
export function trustShort(trust: number | null | undefined, required: number | null | undefined): boolean {
  return required != null && Number(trust ?? 0) < Number(required);
}

/**
 * The status moves the database refuses with 'not_verified' while trust is short: the trip out, and the
 * handover at base for a pickup (preparing → delivered).
 */
export function isDispatchMove(from: string, to: string, delivery: string): boolean {
  return to === "out_for_delivery" || (to === "delivered" && from === "preparing" && delivery === "pickup");
}

export const NOT_VERIFIED_LABEL = "Not verified, can’t dispatch";

/** Cache tag of the sidebar counts (app/admin/layout.tsx), so a decision clears the badge straight away. */
export const NAV_COUNTS_TAG = "admin-nav-counts";
