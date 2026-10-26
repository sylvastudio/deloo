# Renter verification (KYC) and Deloo Protection: recommended UX

Status: recommendation, 26 Oct 2026. Covers PRD R-05, R-30 gate, A-71/A-72. No code changed.

## 1. Decisions in one screen

1. **Ask for ID only when the basket needs it.** Ask at the first Review that contains a camera, a lens, or more than ₦400k of gear. Don't ask at sign-up. ShareGrid gates on gear type and value. Airbnb checks at checkout. Fat Llama asks first-time renters of high-value items for more.
2. **Renters send their ID before paying, and staff approve it before dispatch.** The hold lasts 30 min (`app_settings.hold_minutes`), so a manual review can't fit inside it. Paying while the review is pending is allowed. If the renter is rejected, they get a full refund. Fat Llama does the same: it takes payment, then verifies, and refunds on a fail.
3. **Ship the manual path now.** The renter sends a photo of their ID and a selfie holding it, and staff approve in A-72. Add Dojah later through its hosted web widget, so no native module and no new binary are needed.
4. **Keep one mandatory Protection with the same prices, and state the limits in naira.** Don't add plan choices until we have claims data. Theft by the renter is a KYC problem, not a Protection product.

## 2. Trust tiers and the checkout gate

These use the `trust_level` (0–3) column, which already exists. Values are replacement values in `inventory_deloo.sql`.

| Tier | How you get it | What you can rent (basket replacement value) |
|---|---|---|
| 0 | Browsing, not signed in | Nothing |
| 1 | Signed in with a phone OTP, name and email | ≤ ₦400k, and **no camera or lens**: lights, mics (Wireless GO II ₦350k, PodMics), headphones, grip, backdrops |
| 2 | Tier 1 + ID and selfie approved | Up to ₦5m: any single body (FX3 ₦4.9m), or ZV-E10 + lenses, or FX30 + 35mm |
| 3 | Tier 2 + 2 completed rentals with no claims (automatic), **or** a staff call plus proof of address, or a company with CAC | Above ₦5m: FX3 + 24-70 GM (₦7.75m), 2× ZV-E1 kits, full shoot kits |

**Gate rule.** This is server-side, in `create_hold` and in the dispatch transition.

```
required = 3 if basket_replacement > ₦5m
         else 2 if basket has camera|lens or basket_replacement > ₦400k
         else 1
create_hold: if trust < required and no pending/approved submission → error 'verify_needed'
dispatch (preparing → out_for_delivery, or pickup handover): refuse if trust < required
```

- When tier 3 is needed and the renter is tier 2 with no history, the Review screen offers two ways forward. They can split the order ("Book the FX3 now, add the lens on your next rental"). Or they can tap "Ask for a quick call" (WhatsApp), and staff can raise them to tier 3.
- Put both thresholds in `app_settings` (`kyc_value_kobo` = 40,000,000 and `trust3_value_kobo` = 500,000,000), so they change without a deploy.

## 3. End-to-end flow (routes)

| Step | Screen / route | What happens |
|---|---|---|
| 1 | `plan/setup`, `item/[id]` | No gate. A small line under camera items says "ID check needed once". |
| 2 | `book/review.tsx` | A **Verification card** sits above the Pay button (states below). |
| 3 | `verify/index.tsx` (new) | Why we ask, what's needed, and a consent tick. |
| 4 | `verify/id.tsx` (new) | Choose the ID type, then photograph the front (and the back if needed). |
| 5 | `verify/selfie.tsx` (new) | Selfie holding the ID next to your face, using the front camera. |
| 6 | `verify/done.tsx` (new) | "Sent". Returns to Review (`?return=/book/review`), and Pay unlocks. |
| 7 | `book/pay` → `book/success` | The success screen adds "We're checking your ID. Usually under 2 hours." |
| 8 | `booking/[id].tsx` | A banner shows until approved. "Need more" links back to `verify/id`. |
| 9 | `(renter)/me.tsx` | Status chip: Not verified / Under review / Verified / Need more. Tapping it opens `verify/index`. |

Use `expo-image-picker` (camera only) for the photos. Compress to about 1600px JPEG. Upload works like `handover-media` does today.

### Verification card on Review (states)

- **Verified:** "✓ ID verified" (one quiet line).
- **Needed:** "**Quick ID check.** This kit is worth ₦4.9m, so we check everyone's ID once. It takes 2 minutes and you only do it once." Button: **Verify my ID**. Pay stays disabled until the ID is sent.
- **Under review:** "**ID sent, we're checking.** You can pay now. We'll confirm before your gear leaves us. If we can't verify you, you get every naira back."
- **Need more:** "**We need a clearer photo.** {reason}." Button: **Fix it**.
- **Rejected:** "We couldn't verify your ID, so we can't rent cameras to this account. Questions? Chat with us." This links to WhatsApp, and Pay stays disabled.

### `verify/index`

> **Verify your ID**
> We hand over cameras worth millions, so we check every renter once. It keeps prices low and there's no deposit.
> You'll need:
> • Your NIN slip, driver's licence, voter's card or passport
> • 2 minutes and good light
> ☐ I agree that Deloo may use my ID photo and selfie to confirm who I am. Only Deloo staff see them, and we delete them after we no longer need them. [Privacy]
> **Start**

### `verify/id`

> **Photo of your ID**
> Lay it flat. All four corners in the frame, no glare.
> [NIN slip] [Driver's licence] [Voter's card] [Passport]
> Name on your ID must match your Deloo name: **{full_name}**. [Edit name]

### `verify/selfie`

> **Now a selfie with your ID**
> Hold your ID next to your face. Face and ID both clear.

### `verify/done`

> **Sent. Thanks!**
> We usually check within 2 hours (8am to 8pm). You can pay for your booking now.
> **Back to my booking**

## 4. Edge states

| Case | Behaviour |
|---|---|
| Hold expires while the renter is verifying | Uploading takes about 2 min and the hold is 30. If the hold ran out, Review re-holds the gear (as it does today). Uploads are kept, so the renter never sends them twice. |
| Booking starts tomorrow and is still pending at 6pm the day before | Ops gets an alert (`notifications`) and calls the renter. Bookings already start no sooner than tomorrow, so review time exists. |
| Rejected after paying | Staff cancel with reason `kyc_failed`. Full refund including the Paystack fee (Deloo absorbs it). The gear is released. |
| Need more | Send a reason picklist: blurry / glare / ID expired / face not clear / name doesn't match / ID not accepted. The booking stays confirmed. If nothing comes back 12h before the start, apply the rejected path. |
| Name mismatch | Small differences (order, middle name, spelling) → staff approve and note it. A different person → reject. If the Paystack card name is wildly different, flag it in A-72 but don't block on that alone. |
| Provider down (later) | Fall back to the manual upload automatically. The renter doesn't see an error, only the same screens. |
| Returning verified renter | No step at all. Review shows "✓ ID verified". |
| Expiry | Verification lasts 24 months, or ends when the ID expires (whichever is first). Ask again if the phone number or name changes, or after a `not_returned` claim. |
| Blocked | `blocked_reason` set → the gate refuses everything above tier 1. |

## 5. Provider for later (and why manual first)

The NIN registry is the strongest Nigerian signal, and lookups cost cents. Vendors rarely publish prices.

| Provider | Price signal | Mobile path | Note |
|---|---|---|---|
| **Dojah** (recommended) | NIN lookup from about $0.06 per call (competitor comparison). Prepaid wallet, ₦50k minimum top-up, no subscription. | Hosted no-code widget (EasyOnboard) in a WebView, plus a REST NIN endpoint and a liveness endpoint | No native code, so it ships over the air with `expo-updates`. |
| Smile ID | Pay-as-you-go, no public rate | v11 React Native **Expo** SDK (needs prebuild/EAS) | Strongest liveness. Switch to it if fraud appears. Needs a new binary. |
| Prembly, YouVerify, QoreID | "Contact sales" | REST | Fine alternatives. No price edge. |
| Didit | NIN check $0.20, BVN $0.35 (public) | Web flow | Useful as a price benchmark. |

Don't use BVN. It is bank data, renters resist sharing it, and NIN plus face match is enough. With a provider, the flow becomes: type your NIN → selfie (provider liveness) → face matched against the NIMC photo → auto-approve when the match score is at least the provider's "high" band. Anything else goes to the A-72 queue.

## 6. Deloo Protection (the "insurance fee")

**What it is now.** It already is that fee. Protection is charged per item at 20% (cameras), 15% (lenses, lights, gimbals) or 10% (audio, grip, backdrops) of the rental, and the deposit was removed. Today it covers accidental damage "up to a limit", but the limit is never stated, so it reads like a vague fee.

**Recommendation.** Keep **one mandatory plan with the same rates**. Never call it insurance (it is a damage waiver). Add a concrete cap on the renter's share:

| Event | Renter pays |
|---|---|
| Accidental damage (drop, knock, fault not from misuse) | Repair cost, **at most 10% of that item's replacement value** (minimum ₦15,000). FX3: at most ₦490,000. 85mm: at most ₦100,000. |
| Theft by force (robbery, burglary), police report within 24h | **30%** of replacement value. Verified (tier 2+) renters only, one claim per 12 months. |
| Theft with no report, loss, not returned, water damage, misuse | 100% of replacement value. |
| Missing accessories | That accessory's price from a fixed list. |

The 10% damage cap mirrors Lensrentals' LensCap (the renter's share is the lesser of the repair cost or 10% of replacement). The 30% share on reported robbery keeps the renter invested, because police reports are easy to obtain.

**Why one plan, not 2–3.** Turo-style tiers (US: no deductible at the top tier, $500 in the middle, $3,000 at the bottom) suit a marketplace with insured hosts. We hold the risk ourselves, and a "minimum" plan would sell best to exactly the riskiest renters. Revisit an optional **Protection Plus** after about 3 months of claims data. Plus would be an add-on at +10% of rental that lowers the damage cap to 5% and robbery to 15%.

**Where it appears (no surprises).**
- **Setup/plan:** the price line says "incl. Deloo Protection".
- **Review:** "Deloo Protection (damage cover) · ₦X". Under it: "If it's damaged by accident, you pay at most ₦490,000 for the FX3." Then a "What's covered" link. This is the worst-case number for the most valuable item in the basket.
- **CoverageSheet:** replace "up to a limit" with a per-item table of the most you'd pay. Add the theft rules above.
- **Pay screen and receipt/booking detail:** same line items, plus the "most you'd pay" line.
- **Terms checkbox:** it already links the damage terms. Add these numbers to the rental agreement.

## 7. Data model, storage, RLS, admin

**Migration 0023 (proposed).**
- `profiles`: `kyc_status` enum (none / pending / needs_more / verified / rejected), `kyc_verified_at`, `kyc_expires_at`, `kyc_method` (manual / dojah / smile), `kyc_ref` (provider ref only), `kyc_id_type`, `kyc_name` (name as on ID). Keep `trust_level`. Leave these out of the existing column `grant update (full_name, phone, …)`, so renters can't write them.
- `kyc_submissions`: `profile_id`, `method`, `id_type`, `doc_last4`, `front_path`, `back_path`, `selfie_path`, `consent_at`, `consent_version`, `status`, `reason_code`, `reason_note`, `provider_ref`, `match_score`, `reviewed_by`, `reviewed_at`, `media_deleted_at`. Never store the full NIN or the document number.
- `bookings`: `required_trust smallint`, a snapshot taken by `create_hold`.
- RPCs:
  - `submit_kyc(...)`: the renter's own submission. It sets `pending`.
  - `staff_decide_kyc(submission, decision, reason, tier)`: roles owner/admin/ops. It sets the status and `trust_level`, and writes `audit_log`.
  - `private.required_trust(lines)`.
- Automatic tier-3 upgrade: a trigger raises the renter to tier 3 when a booking closes with no claim, once they have 2 such bookings.

**Storage.**
- Use a private bucket `kyc-documents` at `<profile_id>/<submission_id>/{front,back,selfie}.jpg`.
- Renters may insert into their own folder only, with no select after upload.
- Staff with roles owner/admin/ops get select through short-lived signed URLs. Riders and readonly get no access.
- Log every view in `audit_log`.

**NDPA.**
- A selfie used to identify someone is biometric, which makes it sensitive data. That needs explicit consent (s.30), hence the tick box with a stored version, and a DPIA (s.28).
- Purpose limitation: use the images for identity and theft claims only.
- Retention: delete the images 90 days after the renter's last return with no open claim, or when a claim closes. Keep only the status, ID type, last 4 digits, name on ID and reviewer.
- On "Delete account" (`account/delete.tsx`), delete the images unless a claim is open.

**Admin.**
- **A-72** at `app/admin/customers/verification/page.tsx`:
  - Sort the queue by the next booking start (the most urgent first).
  - Show the ID and the selfie side by side, with the profile name vs the name on the ID and the Paystack card name.
  - Show the basket value and the required tier, plus any past submissions.
  - Buttons: Approve (tier 2) / Approve as tier 3 / Need more (picklist) / Reject (reason).
  - The nav badge shows the pending count.
  - Target: reviewed within 2 hours, 8am to 8pm.
- **A-71** `customers/[id]`: a KYC panel (status, method, expiry, documents for reviewers only), tier with history, and a Set tier action.
- **A-11 / dispatch:** a "Not verified, can't dispatch" warning chip, and the next-action button is disabled.

## Sources

- Fat Llama: pays first and refunds if verification fails, with more checks for first-time high-value renters (company replies on Trustpilot): https://ch.trustpilot.com/review/fatllama.com?page=8
- ShareGrid: verification by gear type and value, and references for high-value gear: https://support.sharegrid.com/en/articles/9048272-navigating-reference-requirements-for-sharegrid-rentals and https://support.sharegrid.com/en/articles/11817069-sharegrid-account-verification-requirements-and-timeline
- Airbnb: identity verification at booking, ID plus selfie when needed, review up to 12h: https://www.airbnb.com/help/article/1170
- Lensrentals LensCap: renter liability is the lesser of repair or 10% of replacement, and LensCap+ adds theft: https://help.lensrentals.com/26475-damage-lenscap-protection-plans/204122-what-is-covered-by-the-lenscap-plan and https://www.lensrentals.com/lenscap
- Turo protection plans and deductibles: https://help.turo.com/en_us/protection-plans-including-insurance-or-us-guests-HkwgBNgN9.md
- Dojah: wallet pricing, ₦50k minimum top-up, NIN and liveness endpoints: https://docs.dojah.io/dashboard-guide/introducing-dojah and https://dojah.io/blog/kyc-pricing-nigeria
- Published KYC prices compared (Dojah from $0.06 per NIN call, Ninja ₦100): https://www.ninja.ng/blog/dojah-prembly-youverify-ninja-pricing/
- Didit Nigeria NIN $0.20 and BVN $0.35: https://didit.me/solutions/countries/nigeria/
- Smile ID React Native and Expo SDK: https://docs.usesmileid.com/integration-options/mobile/react-native and https://docs.usesmileid.com/developer-resources/sdks/mobile/setup
- YouVerify on KYC pricing models: https://youverify.co/en/blogs/kyc-cost-pricing
- NDPA 2023 (sensitive data s.30, DPIA s.28, GAID 2025): https://fpf.org/?p=234739 and https://securiti.ai/overview-of-nigeria-data-protection-act/

Not verified: Fat Llama's official help-centre terms, Getaround's policy, Smile ID and Prembly per-check prices (ask for quotes before you sign up).
