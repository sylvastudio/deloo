# Deloo — Product Requirements Document (rental)

**Status:** v2, 8 Oct 2026. Replaces the poster-tool PRD (archived at `docs/archive/poster-tool/PRD.md`).
**Source:** `README.md` and the owner's decisions of 8 Oct 2026 (§9).
**Positioning:** "Tell us your event, we'll supply the setup."

---

## 1. The problem

See `README.md`. In one line: renting event equipment in Nigeria is a WhatsApp scramble where nobody knows
what's available, what they actually need, or whether the other side can be trusted.

## 2. Users

| User | What they want | First ones |
|---|---|---|
| **Renter** (person or organisation) | The right setup for their event, on the date, at a fair price, without being cheated. | Church media teams and event planners in our network, one city. |
| **Vendor** (rental company, church, individual owner) | More bookings for idle gear, paid on time, gear back undamaged. | 10–20 vendors in the launch city, including churches with idle gear. |
| **Deloo Ops** (us) | See every booking, step in when something fails, settle disputes, learn what's missing. | The founding team. |

## 3. Our edge

1. **We start from the event, not the item.** The questions and sizing rules turn "I need a mic" into a
   complete setup that works. Every rental adds to what we know about which setups work for which events.
2. **We supply equipment from many sources.** Rental companies, churches' idle weekday gear and individual
   owners all go into one pool. Requests we can't fill are recorded and tell us what to source or buy next.
3. **We handle trust.** Verification that gets stricter as the gear gets more valuable, deposits, photo
   evidence at every handover, technician-run high-value gear, and a rescue guarantee.

## 4. The product

### 4.1 Event intake (the questions)

Short, tap-to-answer, one question per screen on a phone. Free text is also accepted ("outdoor crusade,
2,000 people, livestream on YouTube"); the AI turns it into the same answers and asks only what's missing.

| Question | Answers | Used for |
|---|---|---|
| Event type | Service, crusade/outdoor service, conference, wedding, concert, product launch, party, other | Default needs (e.g. wedding → playback + 2 mics) |
| Indoor or outdoor | Indoor / outdoor covered / outdoor open | Speaker power, screen type, weather risk |
| Attendance | Bands: <100, 100–300, 300–1,000, 1,000–3,000, 3,000+ | Sound and screen sizing |
| Venue size (indoor) | Small room / hall / auditorium, or length in metres | Screen size from the farthest viewer |
| On stage | Speakers only / band / choir / DJ / panel | Mic count, monitors, mixer channels |
| Livestream or recording | None / record / livestream (platform) | Cameras, switcher, streaming kit, internet |
| Power | Grid / generator available / none | Generator size, surge protection |
| Date, start and end time, setup time | Date and times | Availability, rental length |
| Location | Area in the launch city | Delivery, vendor choice |
| Budget | Bands, or "show me options" | Which level to show first |
| Technician | Yes / no / not sure | Add-on; required for high-value gear |

### 4.2 Recommendation

- **Good / Better / Best** setups. Each item has a quantity, a reason in plain language ("For 2,000 people
  outdoors you need more than 2 speakers, or the back rows won't hear"), and a price.
- **Sizing is fixed rules, not AI** (`lib/planner/`, reviewed by a sound/AV engineer before launch):
  - **Sound:** speaker count and power from attendance and indoor/outdoor.
  - **Screen:** screen height from the farthest viewer's distance.
  - **Daylight outdoors:** LED wall instead of a projector.
  - **Power:** total watts → generator kVA with headroom, plus a compulsory surge protector or stabiliser (AVR).
  - **Mics and mixer:** mic count and mixer channels from who's on stage.
- **The AI only** turns free text into answers and writes the explanations. It never invents stock, prices
  or specs; those come from the database. Its output is validated JSON, reusing the provider layer in `lib/ai/`.

### 4.3 Availability and alternatives

- Each item shows **available / limited / not available** for the booking's dates, counted per physical unit.
- When something isn't available, offer in this order:
  1. the same item from another vendor
  2. an equivalent item (e.g. two 12" speakers instead of one 15")
  3. a different approach (projector and screen instead of an LED wall, indoors only)
  4. a nearby date
- If none of these works: say so plainly and **record the unmet request** (category, spec, date, area,
  quantity) for sourcing.

### 4.4 Booking

- **Request → hold → confirm → out → returned → closed**, plus cancelled and disputed.
- A **hold** reserves units for 30 minutes while the renter pays. Double-booking is prevented in the database
  (§6), not only in the app.
- **Delivery:** the renter picks up, or delivery and setup by the vendor or a Deloo technician.
- **Rescue guarantee:** if a vendor cancels a confirmed booking, Ops is alerted, the system proposes
  replacements from other vendors, and if none exist the renter is refunded in full plus a credit.

### 4.5 Trust and vetting

Every item has a **risk tier** based on its replacement value. The renter's **trust level** must meet the
item's tier.

| Tier | Example gear | Renter must have |
|---|---|---|
| 1 | Mics, small speakers, lights | Phone OTP, email, BVN or NIN check, selfie liveness, saved card/bank authorisation |
| 2 | Full sound system, projectors, cameras | Tier 1 + address check + (larger deposit **or** guarantor). Organisations: CAC check + named responsible officer. |
| 3 | LED walls, full production | Tier 2 + **technician-run only** (gear never leaves our or the vendor's technician) + signed agreement. GPS tracker where fitted. |

- **Trust grows over time:** completed rentals with no problems lower deposits and unlock higher tiers.
- **Two-way ratings:** renters rate vendors and vendors rate renters.
- **Shared blocklist:** a renter who defaults with one vendor is blocked across all vendors.
- **Automatic warnings:**
  - a new account ordering high-value gear
  - a booking for the same or next day
  - delivery far from the verified address
  - a payer whose name doesn't match the account
- **Vendors are vetted too:**
  - CAC or ID verification
  - gear photographed and inspected before listing
  - payouts held until the return checklist is done
  - clawback if their gear fails at an event
- **Data protection (NDPA 2023):** we store verification results and provider references, not raw BVN/NIN
  numbers or ID images beyond what the provider requires.

### 4.6 Handover evidence

- **Pickup and return checklists** for every unit: photos or video, serial number, condition, accessories
  count, a timestamp and location, and confirmation from both sides.
- **Before power-on:** a surge protector or stabiliser (AVR) is confirmed on the checklist.
- **Outdoor bookings:** a covered setup is confirmed.
- The return checklist starts payout, deposit refund or a damage claim.

### 4.7 Protection and insurance

Cover comes in layers:

| Layer | Covers | Paid by |
|---|---|---|
| 1. Security deposit | Small damage, missing accessories | Renter (refunded) |
| 2. **Deloo Protection** fee (5–10% of rental) | Repairs above the deposit, up to a cap | Renter, in the price |
| 3. Insurer-backed cover | Theft, fire, major damage, transit | Pooled premium from layer 2 |
| 4. Vendor's own policy | Gear when not rented | Vendor (required for top-tier vendors) |

- **Legal wording:** only NAICOM-licensed insurers, brokers and agents may sell insurance. Until an insurer
  partner is signed, Deloo Protection is a **damage waiver with a fund held by Deloo**, never called
  insurance. A lawyer and a broker confirm the wording before launch.
- **Named risks in the policy:** power surges, rain, transit damage. Theft by the renter is handled by
  vetting and technician-run Tier 3, because insurers often exclude it.

### 4.8 Payments

- **Paystack**, with test mode until launch.
- **What the renter pays:** rental, deposit, Protection fee, add-ons.
- **Damages:** the card or bank authorisation is saved so damages can be charged after return.
- **Vendor payouts:** after the return checklist, via Paystack Transfers or split subaccounts.
- **Deposits:** whether Paystack can place a hold, or we charge and refund, is Open Question 3. So is
  whether holding funds needs a licence or a partner.

### 4.9 Coming soon

**Ad space, media crew by the hour, studio space.** Each gets a page with a description and a waitlist form
(who, what, where, when). Waitlist sign-ups show us which one to build next.

## 5. Tech stack

The live stack stays the same (see `docs/archive/poster-tool/PRD.md` §5 for why it was chosen):

| Layer | Choice | Note |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript + Tailwind, **PWA first** | Phone first: most renters and vendors book and do checklists on phones. |
| Android | Trusted Web Activity (Bubblewrap/PWABuilder) wrapping the PWA → APK in the Play Store | Same code as the web app; no separate native build. `assetlinks.json` on deloo.space. |
| Data, auth, files | Supabase (Postgres, Auth, Storage), hosted | RLS separates renters, vendors and Ops. Checklist photos and item photos go in private buckets. |
| AI | `lib/ai/` provider layer (Groq, Gemini fallback, mock) | Reused for intake parsing and explanations, with a new schema. |
| Payments | Paystack | New. Test mode first. |
| Identity checks | One of Smile ID, Prembly, Dojah, VerifyMe, behind `lib/kyc/` with a mock | New. Choice is Open Question 4. |
| Hosting and extras | Netlify, Turnstile, Sentry, Resend | Already set up for deloo.space. |

## 6. Data

| Entity | Key fields | Notes |
|---|---|---|
| **profiles** | user_id, name, phone, trust_level (0–3), blocked | One per Supabase Auth user. |
| **organisations** | id, name, kind (renter_org / vendor), vendor_type (company / church / individual), cac_number, verified_at, city | A church can be both a renter and a vendor. |
| **memberships** | user_id, org_id, role (owner / staff) | |
| **verifications** | user_id or org_id, check (phone / nin / bvn / selfie / address / cac / guarantor), provider, provider_ref, status, checked_at | Results only, no raw numbers. |
| **categories** | key (speaker, sub, mic, mixer, monitor, led_wall, projector, projection_screen, tv, camera, switcher, streaming_kit, light, generator, avr), spec schema | Specs the planner reads (watts, size, lumens, kVA). |
| **items** | id, vendor_org_id, category, brand, model, specs JSON, day_rate, deposit, replacement_value, risk_tier, technician_required, photos[], city, active | One listing. |
| **units** | id, item_id, serial, condition, status (active / repair / retired) | One physical piece. Availability is counted in units. |
| **events** | id, renter (user/org), answers JSON, starts_at, ends_at, area | The intake result. |
| **recommendations** | id, event_id, level (good / better / best), lines JSON, reasons, rules_version | Kept so we can see what was suggested against what was booked. |
| **bookings** | id, event_id, renter, status, starts_at, ends_at, delivery, totals, hold_expires_at | |
| **booking_units** | booking_id, unit_id, period (tstzrange) | **Exclusion constraint** on (unit_id, period) for active bookings: the database refuses a double booking. |
| **unmet_demand** | id, event_id, category, spec, quantity, period, area | Every request we couldn't fill. |
| **checklists** | booking_id, unit_id, stage (pickup / return), photos[], condition, accessories, surge_protection, taken_at, location, confirmed_by_renter, confirmed_by_vendor | |
| **claims** | booking_id, unit_id, evidence, amount, status, paid_from (deposit / protection / insurer) | |
| **payments** | booking_id, kind (rental / deposit / protection / addon / refund / payout / damage), paystack_ref, amount, status | |
| **reviews** | booking_id, from, to, rating, text | Two-way. |
| **waitlist** | vertical (ad_space / crew / studio), contact, details | Coming-soon interest. |

**Storage buckets:**
- `items/`: listing photos, public
- `checklists/`: handover evidence, private, visible only to the booking's parties and Ops
- `verifications/`: only if a provider requires us to keep a document, private, Ops only

## 7. Scope by phase

See `IMPLEMENTATION_PLAN.md`. **Incubator MVP = Phases 0–2:**
- intake → recommendation → alternatives on a seeded catalogue
- vendor listings with availability
- coming-soon waitlists

**Real launch:** Phases 3–5, then the pilot in one city.

## 8. Open questions

1. ~~**Launch city**~~ Answered 8 Oct 2026: **Lagos**. Which areas first is still open.
2. **Fees:** decided 8 Oct 2026: **commission taken from the vendor's payout** (about 10–15%), and the renter
   pays the vendor's price plus the Protection fee. Still open: the exact %, Protection %, deposit rules per tier.
3. **Paystack:**
   - Can it hold a deposit without charging it, or do we charge and refund?
   - Split subaccounts or Transfers for payouts?
   - Does holding renter funds until return need a licence or a regulated partner?
4. **Identity-check provider:** compare price per check, NIN/BVN coverage and liveness across the four
   candidates in §5.
5. **Insurer partner:** approach an embedded-insurance platform (e.g. Curacel, MyCover.ai) or an insurer
   (e.g. Leadway, AXA Mansard) through a broker. Needs a lawyer to confirm the Protection wording.
6. **Sizing rules:** which AV engineer reviews `lib/planner/`?
7. ~~**Technicians**~~ Answered 8 Oct 2026: **the vendor's own staff**, vetted and rated by Deloo. The vendor is
   responsible for their technician; Deloo can add a freelancer pool later.
8. **First vendors:** the owner has a few vendors to call (8 Oct 2026). Which 10–20 vendors and churches
   sign up for the pilot?
9. ~~**Poster tool**~~ Answered 8 Oct 2026: **delete it** in Phase 0. It stays in git history and
   `docs/archive/poster-tool/`.
10. ~~**Incubator**~~ Answered 8 Oct 2026: a **working MVP within 2 weeks**, so Phases 0–2 must be live on
   deloo.space by about 22 Oct 2026.

## 9. Agent steering notes

| Date | Instruction I gave | Why | Result (file/section changed) | How I verified |
|---|---|---|---|---|
| 8 Oct 2026 | Pivot from the poster tool to event and media equipment rental. Ad space, media crew and studio space are "coming soon". Supply must not run out: pool many vendors, churches' idle gear, individual owners, record unmet demand. Add an intelligence layer: ask about the event, recommend the setup with alternatives, say plainly when something isn't available. Lock down insurance and customer vetting. Build it for real; the incubator gets the simple MVP. | The poster tool and a general storefront were judged too crowded. Equipment rental is a weekly, trust-heavy problem with an existing network to start from. | `README.md` and this PRD rewritten. Poster docs moved to `docs/archive/poster-tool/`. New `IMPLEMENTATION_PLAN.md`. | Docs only. No code changed yet. |
| 8 Oct 2026 | "We will be building the app as a PWA and eventually get an APK for Android." Ask me questions to guide the build. | Most users are on Android phones; a Play Store listing builds trust. | §5 adds the Android row. `IMPLEMENTATION_PLAN.md` Phase 6 (Trusted Web Activity). Phase 4 checklists must work offline. | Docs only. |
| 8 Oct 2026 | Answers: launch in Lagos; working MVP for the incubator within 2 weeks; owner has a few vendors to call; delete the poster code; technicians are vendor staff; commission from the vendor's payout; start Phase 0. | Guided questions before building. | §8 questions 1, 2, 7, 8, 9, 10 updated. Plan deadline set to about 22 Oct 2026. | Docs only. |
