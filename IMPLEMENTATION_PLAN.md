# Deloo — Implementation Plan (rental)

> **8 Oct 2026: from Phase 1 on, this plan is replaced by `docs/native-app-plan.md`** (native Expo app,
> Android first; steps N0–N7). Phase 0 below is done and still applies: the schema, RLS and demo catalogue
> are shared by the native app. The rest is kept for reference: its product steps carry over into N2–N6.

**Source:** `PRD.md` v2 (8 Oct 2026). Replaces the poster-tool plan (archived at
`docs/archive/poster-tool/IMPLEMENTATION_PLAN.md`).
**Stack:** the live stack: Next.js + TypeScript + Tailwind on Netlify, hosted Supabase, `lib/ai/`
(Groq/Gemini/mock). New: Paystack, an identity-check provider behind `lib/kyc/`.
**Deadline:** Phases 0–2 live on deloo.space by about **22 Oct 2026** (incubator, working MVP).
**Platform:** a **PWA first**, phone-first layouts at 390 px. Then an **Android APK** wrapping the same PWA
as a Trusted Web Activity (Bubblewrap or PWABuilder), published to the Play Store (Phase 6). Every feature
must work in the browser, because the APK is the same web app.

**Rules for every phase**
- A phase starts only after the previous phase's **Exit check** passes.
- Each phase ends with a git tag (`rental-0` … `rental-6`).
- Instructions that change the plan go in `PRD.md` §9.
- Test data is fictional and labelled `TEST DATA`. No real vendor's name or gear without permission.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (see `AGENTS.md`).

**What we keep from the poster app:**
- Supabase auth, sign-up and password reset flows
- Turnstile, Sentry, Resend email templates
- the PWA shell (`app/manifest.ts`, service worker, offline page)
- `lib/ai/` provider layer (validation, retry, fallback)
- `tab-nav` and the design tokens in `design.html`

**What goes:** posters, brand kit, designs, print. They stay in git history and in
`docs/archive/poster-tool/`.

---

## Phase 0 — Reset

**Goal:** a clean rental app shell with no poster features exposed.

1. Delete the poster routes (`app/(app)/brand-kit`, `designs`, `app/api/understand`) and poster libraries
   (`lib/posters`, `lib/kit.ts`, `lib/catalog.ts`, `lib/conventions.ts`, `components/poster.tsx`,
   `spec-sheet.tsx`, `app/posters.css`). Decided 8 Oct 2026.
2. Migration `0006_rental_core.sql`:
   - drop the poster tables (after confirming there's no real data)
   - create the PRD §6 tables except payments, claims, verifications and reviews
   - include the `booking_units` exclusion constraint (`btree_gist`, `exclude using gist (unit_id with =, period with &&)`
     where the booking is active)
3. RLS:
   - renters see their own events and bookings
   - vendors see their own items, units and the bookings that use them
   - Ops (`profiles.is_ops`) sees everything
   - the catalogue (active items) is readable by anyone
4. Navigation for renters: **Plan · Bookings · Account**. For vendors: **Bookings · Gear · Account**.
   Sign-up asks: "I want to rent" / "I have gear to rent out" / both.
5. Update the manifest name, description and icons for the rental product.

**Exit check:**
- A renter and a vendor can each sign up and land in their own navigation.
- `npm run check:rls` (rewritten for the new tables) passes, including the case where an attempted
  double booking of one unit is refused by the database.

## Phase 1 — Planner (incubator demo core)

**Goal:** answer the questions → see Good/Better/Best setups with reasons, availability and alternatives.

1. `lib/planner/rules.ts`: deterministic sizing (sound, screen, daylight, power/AVR, mics/mixer, livestream
   kit). Return categories with required specs and quantities, plus a reason key for each line.
   Version the rules (`RULES_VERSION`).
2. `lib/planner/rules.test.ts`: at least 20 event scenarios checked against expected setups, e.g.
   "indoor service of 150", "outdoor crusade of 2,000 with livestream", "wedding of 300 with no grid power".
3. `lib/planner/match.ts`: map required specs to real items and units free in the period. When nothing
   matches, try the alternatives in PRD §4.3 order. Write `unmet_demand` rows for anything still unfilled.
4. Intake UI at `/plan`: one question per screen, tap answers, back/forward, progress indicator. Also a free
   text box: `lib/ai` gets an `intake` schema that turns text into answers and lists what's missing.
5. Results at `/plan/[eventId]`:
   - Good/Better/Best tabs; each line shows item, quantity, price, reason and availability
   - "Swap" opens the alternatives
   - a not-available notice when nothing works
   - total, deposit, Protection fee
   - the AI writes the reason text from the reason keys; a fixed reason text is used if the AI fails
6. Seed script `scripts/seed-catalogue.ts`: 3 fictional vendors (company, church, individual), about 60
   items, units, and some existing bookings so "limited" and "not available" appear.

**Exit check:**
- Rule tests pass.
- On a 390 px phone, "outdoor crusade, 2,000 people, livestream, generator" typed as free text produces
  three setups with reasons.
- One item shows not available with an alternative, and an `unmet_demand` row is recorded.
- No horizontal scroll.

## Phase 2 — Vendors and coming soon (incubator MVP complete)

**Goal:** real vendors can list gear and see their calendar; the coming-soon verticals collect interest.

1. Vendor onboarding: type (company / church / individual), city, areas served, delivery and technician
   offer.
2. Gear: add an item (category picker with spec fields from `categories.spec_schema`, photos to `items/`,
   rates, deposit, replacement value → risk tier computed), add units with serials, mark units for repair.
3. Calendar: bookings per unit, plus blocks the vendor sets for their own use (a church's Sunday service).
4. Coming soon pages at `/soon/ad-space`, `/soon/crew` and `/soon/studios`, each with a `waitlist` form.
5. Ops page `/ops` with recent events, recommendations, unmet demand by category and date, and waitlist
   sign-ups.

**Exit check:**
- A vendor lists an item with 2 units and blocks Sunday. A renter's plan for that Sunday shows it as
  limited or not available.
- An Ops user sees that request in unmet demand.
- Deploy to deloo.space; this is the **incubator MVP**.

## Phase 3 — Booking and payments

**Goal:** a renter can book and pay; units are held and confirmed without double booking.

1. Booking flow from a chosen setup:
   - delivery or pickup, address, technician add-on
   - creates a booking with a **30-minute hold** on its units
   - an expiry job releases unpaid holds (Supabase cron, or check on read)
2. Paystack (test mode):
   - one checkout for rental + deposit + Protection fee + add-ons
   - a webhook at `app/api/paystack/webhook` (verify the signature) confirms the booking
   - save the card or bank authorisation for later damage charges
   - write a `payments` row for every movement
3. Vendor accepts or declines within a set time. If they decline, run the rescue flow (PRD §4.4):
   suggest replacements from the matcher, alert Ops, refund if there are none.
4. Notifications by email (Resend) and WhatsApp/SMS later; in-app status everywhere.

**Exit check:** In Paystack test mode:
- Book → pay → confirmed.
- Two renters racing for the last unit: one succeeds and the other sees "just taken" with alternatives.
- A vendor decline triggers replacements.
- An unpaid hold expires and the unit is released.

## Phase 4 — Trust: vetting, checklists, claims

**Goal:** the tier system from PRD §4.5–4.7 is enforced.

1. `lib/kyc/` with a mock and one real provider (Open Question 4):
   - phone OTP, NIN/BVN, selfie liveness for Tier 1
   - address and guarantor for Tier 2
   - CAC check for organisations
   - store results only (NDPA)
2. Gate checkout by the item's risk tier and the renter's trust level. Tier 3 items can only be booked with
   a technician.
3. Pickup and return checklists:
   - per-unit photos taken with the phone camera (`<input capture>`), serial, condition, accessories,
     surge protector or stabiliser (AVR), covered setup for outdoor events
   - timestamp and location; confirmation from both sides
   - **works offline**: the service worker queues photos and uploads them when back online, since venues
     often have poor signal
4. Return outcomes:
   - all fine → deposit refunded and payout scheduled
   - damage → a claim with the evidence, settled from deposit, then Protection, then insurer
   - renter can dispute; Ops decides
5. Two-way reviews, trust level going up, shared blocklist, and automatic warnings (PRD §4.5).

**Exit check:**
- A new account can't book Tier 2 gear.
- After verification it can.
- A return with a damaged unit creates a claim charged against the deposit.
- A checklist completed in airplane mode uploads when the connection returns.

## Phase 5 — Pilot hardening

**Goal:** ready for real money in one city.

1. Paystack live keys, vendor payouts, the refund path, and daily reconciliation.
2. Ops console:
   - stuck bookings, disputes and claims
   - vendor approval
   - manual unit reassignment
   - unmet-demand report (what to source or buy)
3. Busy-period readiness: see bookings by date for December and Easter, and invite vendors from nearby
   cities ahead of time.
4. Terms of service, rental agreement, Protection wording reviewed by a lawyer; privacy policy (NDPA).
5. Rate limits, Sentry alerts on payment and webhook errors, database backups.
6. **Pilot:** 10–20 real vendors, 30 real bookings, with feedback recorded and fixed or listed.

**Exit check:**
- 30 real bookings closed with payouts.
- Every dispute has a recorded outcome.
- No double bookings.

## Phase 6 — Android app

**Goal:** Deloo is in the Play Store, running the same PWA.

1. PWA audit: installable, offline shell, maskable icons, screenshots in the manifest, and Lighthouse PWA
   checks pass.
2. Trusted Web Activity with Bubblewrap (or PWABuilder):
   - package name such as `space.deloo.app`
   - signing key kept outside the repo
   - `/.well-known/assetlinks.json` served from deloo.space so the address bar is hidden
3. Web push for booking updates (works in the TWA); check camera and location permissions inside the TWA.
4. Play Console listing, privacy policy link, internal testing track, then production.

**Exit check:**
- The APK installs on a low-end Android phone and opens without a browser bar.
- A checklist with camera photos works inside it.
- A push notification arrives for a booking update.

---

## Blocked by open questions (PRD §8)

| Question | Blocks |
|---|---|
| 1. Launch areas within Lagos | Phase 1 seed areas, Phase 2 onboarding |
| 2. Fees | Phase 1 totals (placeholders until answered), Phase 3 |
| 3. Paystack holds and licensing | Phase 3 deposit design |
| 4. Identity-check provider | Phase 4 |
| 5. Insurer and legal wording | Phase 5 |
| 6. AV engineer for rules | Phase 1 rules sign-off (rules can be built first) |
| 7. Technicians | Phase 3 add-on, Phase 4 Tier 3 |
| 8. First vendors | Phase 2 exit check, Phase 5 pilot |
