# KYC build contract (manual path)

The interface shared by migration 0023, the renter app and the admin portal. The UX is in
docs/ux-kyc-protection.md (sections 2–4 and 7). This is the manual path only, with no provider.

## Database (supabase/migrations/0023_kyc.sql)

`public.profiles` new columns (NOT in the renter's column update grant):
- `kyc_status text not null default 'none'` check in ('none','pending','needs_more','verified','rejected')
- `kyc_reason text` (latest renter-facing reason for needs_more / rejected)
- `kyc_verified_at timestamptz`, `kyc_expires_at timestamptz`, `kyc_method text` ('manual'|'dojah'|'smile'),
  `kyc_ref text`, `kyc_id_type text`, `kyc_name text`

`public.kyc_submissions`: `id uuid pk`, `profile_id uuid → profiles`, `method text default 'manual'`,
`id_type text` check in ('nin_slip','drivers_licence','voters_card','passport'), `doc_last4 text null`,
`front_path text not null`, `back_path text null`, `selfie_path text not null`, `consent_at timestamptz not null`,
`consent_version text not null`, `status text` ('pending','needs_more','verified','rejected') default 'pending',
`reason_code text`, `reason_note text`, `reviewed_by uuid`, `reviewed_at timestamptz`, `media_deleted_at timestamptz`,
`created_at timestamptz default now()`.
RLS: renters select their own rows, but only id, status, reason_code, reason_note, created_at matter to them. Renters have no direct insert/update (they use the RPC). Staff (owner/admin/ops) can select all rows.

`public.bookings`: `required_trust smallint`, snapshotted by `create_hold`.

`app_settings`: `kyc_value_kobo` = 40000000 (₦400k), `trust3_value_kobo` = 500000000 (₦5m).

Storage bucket `kyc-documents` (private, image/jpeg + image/png, 8 MB). Paths are
`<auth.uid()>/<client-generated uuid>/{front,back,selfie}.jpg`. Renters may INSERT only under their own uid
folder. They have no select, update or delete. Staff (owner/admin/ops) may select. Admin reads use signed URLs from the server.

### RPCs
- `public.kyc_gate(p_lines jsonb) returns jsonb`. `p_lines` has the same shape as `quote_booking`'s `p_lines`. Returns
  `{ required: 1|2|3, trust: int, kyc_status: text, kyc_reason: text|null, basket_value_kobo: bigint,
     top_item: { name: text, value_kobo: bigint } | null, ok_to_pay: boolean, blocked: boolean }`
  - required: 3 if the basket replacement value is above trust3_value_kobo; else 2 if the basket has a camera or lens category, or its value is above kyc_value_kobo; else 1.
  - ok_to_pay: true if trust ≥ required; or if required = 2 and kyc_status = 'pending'. False if blocked.
- `public.submit_kyc(p_id_type text, p_front_path text, p_back_path text, p_selfie_path text, p_consent_version text, p_doc_last4 text default null) returns uuid`.
  Checks every path starts with `auth.uid()::text || '/'`. Inserts the submission and sets profiles.kyc_status = 'pending' and kyc_reason = null.
  Refuses if the renter is already verified (unless expired) or rejected.
- `public.staff_decide_kyc(p_submission uuid, p_decision text, p_reason_code text default null, p_note text default null) returns void`.
  For owner/admin/ops only. p_decision is one of:
  - 'approve': sets verified, trust_level = greatest(trust_level, 2), kyc_verified_at = now(), expires at now() + 24 months, kyc_method 'manual', kyc_id_type.
  - 'approve_t3': the same as approve, with trust 3.
  - 'needs_more': requires a reason_code.
  - 'reject': requires a reason_code.
  Each decision writes audit_log. Reason codes: blurry, glare, id_expired, face_unclear, name_mismatch, id_not_accepted, other.
  The renter-facing text for each code is decided in the app and admin. The DB stores the code and the note, and sets profiles.kyc_reason to the note, or to the code if there is no note.
- `create_hold` gate: compute required. If trust < required and NOT (required = 2 and kyc_status = 'pending') → raise
  exception 'verify_needed'. Use 'trust3_needed' when required = 3 and the renter is verified at tier 2. Use 'account_blocked' if blocked_reason is set.
  Snapshot required_trust on the booking.
- Dispatch gate: the staff transition to out-for-delivery, or a pickup handover, is refused with 'not_verified' while profiles.trust_level < bookings.required_trust.
- Tier 3 is automatic: once a renter has 2 completed bookings with no claim, raise trust_level to 3, but only if it is ≥ 2 already.

## Renter app (mobile/src)
- `lib/kyc.ts`: kycGate(lines), uploadKycPhoto(localUri, folderId, name), submitKyc(...), plus reason-code → copy.
- Routes: `app/verify/index.tsx`, `app/verify/id.tsx`, `app/verify/selfie.tsx`, `app/verify/done.tsx`.
- Review: a verification card (5 states) above Pay, which stays disabled unless ok_to_pay. Me: a status chip. booking/[id]: a banner while pending, needs_more or rejected. success: a "We're checking your ID" line when pending.
- Map create_hold errors verify_needed, trust3_needed and account_blocked to friendly copy.

## Admin (app/admin)
- A-72 `customers/verification/page.tsx`: a pending queue sorted by next booking start. ID and selfie side by side (signed URLs), with the profile name vs the name on the ID. Shows the basket value and required tier. Actions: Approve / Approve as tier 3 / Need more / Reject, with the reason picklist. Sidebar badge for the pending count.
- A-71 customer detail: a KYC panel (status, method, expiry, past submissions).
- Dispatch / booking: a "Not verified, can't dispatch" chip when trust < required_trust.
