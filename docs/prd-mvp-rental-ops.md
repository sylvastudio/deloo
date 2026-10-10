# PRD addendum: MVP rental operations (renter app + admin portal)

**Status:** draft for build, 10 Oct 2026. **Demo:** incubator, ~22 Oct 2026.
**Supersedes, for the MVP only:** the peer-vendor parts of `PRD.md`, `docs/native-app-plan.md` §3–4 and the vendor flows (F10–F15) in `docs/ux/user-flows.md`. Those stay valid for later.
**Reads with:** `PRD.md` (fees, trust, protection), `docs/ux/screen-specs.md` (visual specs; R-numbers there are the old numbering, mapped in §3), migrations `0007_rental_core.sql`, `0008_availability.sql`.

Conventions: money in kobo (`bigint`), times in `Africa/Lagos`, "day" means a calendar rental day. **EXISTS** means a file is already in `mobile/src/app`, **CHANGES** means that file needs real work, and **NEW** means there is no file yet.

---

## 1. Scope and principles

**What we are building:** a rental shop for our own stock: 26 SKUs, about 28 units, in Lagos. Two surfaces:

1. **Renter app** (Expo, Android first). Renters plan a shoot or browse, book dates, pay with Paystack, track the delivery, record handover evidence and get their deposit back.
2. **Admin portal** (Next.js, `admin.deloo.space`). Staff use it to run stock, bookings, dispatch, evidence, returns, claims, money and customers.

**Out of scope for the MVP:**
- peer vendors: "List your gear" is a waitlist only
- ad space, crew and studios: waitlist only
- automated insurance
- live rider GPS
- ratings
- multi-city

**Principles**
1. **Single supplier, honest stock.** We show only what we own. When we don't stock something, the app says **"We don't have this yet"** and records the request. When a unit is booked, the app says so and offers the nearest free dates or an alternative.
2. **The database is the referee.**
   - Availability comes from `reservations` and its exclusion constraint, never from the app's memory.
   - A booking is confirmed by the verified Paystack webhook, never by the app's "success" screen.
3. **Money is always itemised.** Rental, deposit (refundable), Deloo Protection, delivery and total are shown the same way on every screen, receipt and admin view. The app always says when the deposit comes back.
4. **Evidence or it didn't happen.** Every handover (out and back) has timestamped photos or video per unit, attached to the booking, the unit and the renter. Without it there is no damage claim.
5. **Built for the phones and networks our renters have:**
   - compressed media
   - an upload queue that survives offline use and app restarts
   - cached catalogue
   - no screen that blocks on the network without a retry
6. **WhatsApp is the support channel.** Every booking screen has "Chat on WhatsApp" with the booking reference prefilled.
7. **Staff tools are boring and fast.** Tables, filters, one-click status moves, and an audit trail on everything that touches money or custody.

---

## 2. Roles and permissions

### 2.1 Roles

| Role | Who | Where they work |
|---|---|---|
| **Renter** | Any signed-up user | Mobile app |
| **Owner** | Founder(s) | Admin; everything, including staff and settings |
| **Admin** | Ops lead | Admin; everything except staff roles and payout/bank settings |
| **Ops / dispatch** | Day-to-day operator | Admin: bookings, inventory, dispatch, returns, customers (no refunds) |
| **Rider / handover agent** | Delivery and collection staff | Admin "Jobs" view on their phone (mobile web): only the jobs assigned to them |
| **Finance** | Bookkeeper | Admin: payments, refunds, deposits, claims settlement, reports |
| **Read-only** | Investor, advisor, auditor | Admin: view everything, change nothing; customer PII masked |

There is one in-house `vendors` row: **Deloo**, `approved_at` set. All items belong to it. The `vendor_members` table is not used for staff. Staff live in `staff_members` (§7).

### 2.2 Permission matrix (admin)

Legend: **V** view, **E** create/edit, **A** approve or trigger money movement, **—** no access.

| Area | Owner | Admin | Ops | Rider | Finance | Read-only |
|---|---|---|---|---|---|---|
| Dashboard | V | V | V | — | V | V |
| Bookings (list, detail, notes) | E | E | E | own jobs V | V | V |
| Booking status moves (prepare, dispatch, deliver, collect, receive) | E | E | E | own jobs E | — | — |
| Cancel booking | A | A | E (before dispatch; refund goes to Finance) | — | A | — |
| Assign or swap units | E | E | E | — | — | V |
| Inventory: items, units, photos, pricing | E | E | E (no pricing) | — | V | V |
| Retire unit, set replacement value | A | A | — | — | V | V |
| Availability blocks | E | E | E | — | — | V |
| Dispatch schedule, assign riders | E | E | E | — | — | V |
| Handover capture | E | E | E | own jobs E | — | — |
| Evidence review | V | V | V | own jobs V | V | V |
| Return inspection | E | E | E | own jobs E (capture only) | — | V |
| Damage claims: open, assess | E | E | E | — | E | V |
| Damage claims: settle (deduct, charge, waive) | A | A | — | — | A | V |
| Payments and transactions | V | V | V (no card details) | — | V | V |
| Refunds and deposit release | A | A | — | — | A | — |
| Reconciliation | V | V | — | — | E | V |
| Customers: profile, notes | E | E | E | name/phone/address for own jobs | V | V (masked) |
| KYC decision, trust tier, blocklist | A | A | E (propose) | — | — | — |
| Unmet demand, waitlists, plans | V | V | V | — | V | V |
| Reports | V | V | V | — | V | V |
| Settings: fees, protection, zones | A | A | — | — | V | V |
| Staff and roles | A | — | — | — | — | — |
| Audit log | V | V | — | — | V | V |

Every **A** action requires a reason and is written to `audit_log`. Refunds over ₦100k (setting) need a second approver from Owner or Finance (P1).

### 2.3 Renter permissions (RLS)
- Renters read their own profile, bookings, booking items, payments (status and amounts only), deliveries (slot, rider first name and phone on the day), handovers and media, and claims.
- Renters write:
  - their own handover captures and confirmations
  - claim responses
  - extension requests
  - cancellation requests
  - profile and address fields
  - the refund bank account
- Renters never see unit serials of other bookings, other renters, or reservations. Availability comes from `free_units` (counts) and a new `item_calendar` function (§7).

---

## 3. Renter app: screen inventory

Status key: **EXISTS** means the file exists and is usable as is (copy changes only). **CHANGES** means the file exists but needs real logic or layout work. **NEW** means it must be built. *Old ID* refers to `docs/ux/screen-specs.md`.

Universal states, which apply to every data screen unless the table says otherwise:
- **Loading:** skeletons, never a full-screen spinner.
- **Error:** inline notice with **Try again** and **Chat on WhatsApp**.
- **Offline:** banner "You're offline. Showing what we saved at 14:05"; cached data stays visible and money actions are disabled.

### 3.1 Entry and account

| ID | Screen (file) | Status | Purpose and key content/actions | Non-default states |
|---|---|---|---|---|
| R-01 | Welcome (`welcome.tsx`) | CHANGES | Rotating words switch to camera gear ("Cameras / Lenses / Light / Sound"), with the line "Pro camera gear, delivered in Lagos". Buttons: **Get started**, **I have an account**. Old A1. | Offline: still renders (bundled). |
| R-02 | Sign in (`sign-in.tsx`) | EXISTS | Email one-time code (phone OTP later). Auto-advances on 6 digits; resend after 30s. | Wrong code; too many tries; offline: "Connect to get your code". |
| R-03 | Onboarding (`onboarding.tsx`) | CHANGES | Name, phone (WhatsApp number, with the same-number toggle), optional "What do you shoot?" chips. **Remove the "rent out my gear" branch.** Replace it with a small link, "Own gear? Join the waitlist" → R-31. | Validation errors inline. |
| R-04 | Me (`(renter)/me.tsx` → `screens/account.tsx`) | CHANGES | Name, phone, email, verification status chip, delivery addresses, refund bank account, help (WhatsApp), terms/privacy, sign out, app version. Remove the mode switch to vendor. | — |
| R-05 | Verify identity | NEW (P1) | Explains why ("₦1.2m camera kit: we verify everyone once"). Collects the NIN (via the KYC provider) and a selfie; the photo of an ID is a manual fallback. Shows "Under review / Verified / Need more". MVP: a staff-reviewed upload (A-71). | Pending review; rejected with reason; provider down → manual. |
| R-06 | Addresses | NEW | List and add delivery addresses: area (zone chip), street, landmark (Lagos reality), contact phone. The zone sets the delivery price. | Area outside zones: "We don't deliver there yet. Pick up from our base?" |
| R-07 | Refund account | NEW | Bank picker and account number; the name is resolved via Paystack, and the renter confirms "Is this you?". Used for deposit refunds (§5.13). | Name mismatch: warn and flag to Finance. |
| R-08 | Help | CHANGES (part of Me) | WhatsApp chat deep link, call, FAQ (deposit, damage, late return, cancellation). | — |

### 3.2 Discover (item-led)

| ID | Screen (file) | Status | Purpose and key content/actions | Non-default states |
|---|---|---|---|---|
| R-10 | Home / Plan (`(renter)/index.tsx`) | CHANGES | Top card: "What are you shooting?", with shoot-type tiles (Podcast, Interview, YouTube/social, Music video, Short film, Photo shoot, Event coverage) → R-20. Below: "Or browse gear" category row, "Continue your plan" card, and an "Upcoming booking" mini-tracker if one is active. | Empty (new user): no continue card. Offline: tiles work, the planner runs on cached stock and checks again before booking. |
| R-11 | Explore (`(renter)/explore.tsx`) | CHANGES | Category chips: Cameras, Lenses, Gimbals, Lighting, Audio, Grip. Search box. Grid card: photo, name, ₦/day, chip ("Available today" / "Booked today" / "1 of 2 free"). Optional date filter ("Show what's free 14–16 Oct"). | Empty search: "We don't have that yet" + **Tell us what you need** → R-33. |
| R-12 | Item detail (`item/[id].tsx`) | CHANGES | Photo carousel; name; **₦X / day** large; refundable deposit line; key specs (sensor, mount, output, battery); **What's in the box** (batteries, charger, cards, cables); compatible add-ons ("Pairs with: 24-70 GM, RODE Wireless PRO"); availability strip (next 14 days, free/booked); **Choose dates** → R-13. Remove the "vendor card". Show **"From Deloo's own kit · insured handover"**. | All units booked on the chosen dates: banner "Booked 14–16 Oct. Free from 17 Oct" + alternatives row. Retired item: 404 → back to Explore. |
| R-13 | Choose dates (sheet) | NEW | Month calendar. Booked days are struck through and disabled; partially booked days for multi-unit items show "1 left". Tap the start day, then the end day. Live footer: "3 days × ₦40,000 = ₦120,000", **Continue**. Shows the lead time rule ("Book by 6pm for next-day delivery"). | A range crossing a booked day: snaps back with "16 Oct is booked. Choose up to 15 Oct, or from 17 Oct." Loading calendar: skeleton month. Offline: disabled with notice (availability must be live). |
| R-14 | Bag | NEW (P0-lite) | A shoot needs camera + lens + mic. Holds items with **one shared date range**. Adding an item checks it is free for the bag's dates; if not: "Not free on your dates. Change dates or remove". Badge on the tab bar. *MVP:* a bag is one booking; one date range per bag. | Empty: "Your bag is empty" + Explore. |
| R-15 | Vendor profile (`vendor/[id].tsx`) | REMOVE / hide | Not needed with a single supplier. Keep the file and route to an "About Deloo" content screen. | — |

### 3.3 Plan-led

| ID | Screen (file) | Status | Purpose and key content/actions | Non-default states |
|---|---|---|---|---|
| R-20 | Plan question flow (`plan/ask/[q].tsx`) | CHANGES | One question per screen with a progress bar. **New question set** (replaces the event/crowd set):<br>1. shoot type<br>2. people on camera (1 / 2 / 3–4 / 5+)<br>3. camera angles (1 / 2 / 3)<br>4. indoor / outdoor / both<br>5. day / night / both<br>6. audio (talking heads / music playback / ambient / none)<br>7. moving shots (none / some / lots)<br>8. look (natural / clean studio / cinematic)<br>9. budget ("Show me options")<br><br>Questions that don't apply are skipped by shoot type; for example, music video skips "people talking". | Back always works; answers persist locally (resume). |
| R-21 | Shoot details (`plan/details.tsx`) | CHANGES | Dates (same calendar as R-13, but with no item yet, so all days are selectable), area or zone, delivery or pickup. | Area out of zone → pickup suggestion. |
| R-22 | Sizing (`plan/sizing.tsx`) | EXISTS | Honest "thinking" step (~1s): "Matching 2 cameras and 3 mics for a 3-person podcast…". | — |
| R-23 | Your setup (`plan/setup.tsx`) | CHANGES | **Good · Better · Best** segmented control. The total is at the top with rental, deposit, protection and delivery broken out. Line cards: photo, name, qty, availability chip, **Why?** Lines that can't be filled show a **"We don't have this yet"** card (e.g. "Teleprompter: we don't stock it. Noted; we'll tell you when we do."), written to `unmet_demand`. Lines whose item is booked on these dates show **"Booked on your dates"**, with alternative item(s) or the nearest free dates ("Everything is free 17–19 Oct → Switch dates"). Sticky footer: **Share** · **Book this setup** → R-30 (with the bag filled). | A level that is entirely unavailable is greyed out with the reason. Offline: shows the cached result with "Prices and availability checked again before you pay". |
| R-24 | Swap sheet (`plan/swap.tsx`) | EXISTS | Alternatives in our stock for this line, each with a one-line trade-off and price difference. | No alternatives: "This is the only one we have". |
| R-25 | Share (`plan/share.tsx`) | EXISTS | Share the setup and total to WhatsApp as text with a deep link. | — |

### 3.4 Checkout

| ID | Screen (file) | Status | Purpose and key content/actions | Non-default states |
|---|---|---|---|---|
| R-30 | Review booking (`book/review.tsx`) | CHANGES | Items with dates and days. **Delivery or pickup** toggle: address (R-06) and delivery slot (morning 8–11 / afternoon 12–3 / evening 4–7, from settings), plus return collection slot. **Fee breakdown** (§5.1): rental, Deloo Protection (one-line explainer + "What's covered" sheet), delivery and collection, refundable deposit, **Total today**. "Deposit back within 48h after we check the gear". Terms checkbox (rental agreement, damage, late fees, cancellation). Verification gate if required (P1). **Pay ₦X** creates the hold (§5.3) → R-31. | Price changed since the plan: highlighted line "Price updated". Item no longer free: blocks the pay button and offers to remove it or change dates. Hold creation failed (race): "Someone just booked the last FX3 for 15 Oct" + alternatives. |
| R-31 | Pay (`book/pay.tsx`) | CHANGES | Shows the hold countdown ("We're holding your gear for 29:41"). **Slide to pay** opens Paystack checkout (card / transfer / USSD) in an in-app browser. On return: polls booking status. | Countdown < 5 min: amber. Hold expired: "Your hold ended. Try again" (re-check availability). Browser dismissed: "Payment not finished. Resume / Change method". |
| R-32 | Payment pending | NEW | For bank transfer or USSD where money is in flight: "We're waiting for your transfer to land. This usually takes under 10 minutes. You can close the app; we'll notify you." Live status via realtime or polling. | > 30 min: "Still waiting. If you've paid, tap **I've paid** and send the receipt on WhatsApp" (flags for Finance). |
| R-33 | Request gear we don't have (sheet) | NEW | "What do you need?" (free text + category), dates, how many → `unmet_demand`. Toast: "Noted. We'll message you if we get it." | — |
| R-34 | Success (`book/success.tsx`) | CHANGES | Shown only once the webhook has confirmed: booking reference, dates, delivery slot, total paid, and "What happens next" (3 steps). Buttons **View booking**, **Share to WhatsApp**. | If reached before confirmation, redirect to R-32. |

### 3.5 Bookings and tracking

| ID | Screen (file) | Status | Purpose and key content/actions | Non-default states |
|---|---|---|---|---|
| R-40 | Bookings list (`(renter)/bookings.tsx`) | CHANGES | Tabs: **Active**, **Past**. Card: reference, item thumbnails, dates, current stage chip, next action ("Record handover photos", "Return due tomorrow 10am"). Real data replaces `demo-bookings`. | Empty: "No bookings yet" + Explore / Plan. |
| R-41 | Booking tracker (`booking/[id].tsx`) | CHANGES | **Checkpoint tracker**, each step with a timestamp: Confirmed → Being prepared → Out for delivery (slot + rider name and phone + "Call / WhatsApp rider") → Delivered → In use → Return due (date/time) → Collected → Checked → Deposit refunded. Below the tracker:<br>• items and units (serials shown after delivery)<br>• delivery address<br>• **Payment summary** (paid, deposit status, refunds)<br>• **Handover evidence** (thumbnails: ours and yours, out and back)<br>• actions by stage: Cancel (before dispatch), Extend, Report a problem, Chat on WhatsApp, Download receipt (P1) | Cancelled: banner + refund status. Disputed: claim card on top → R-44. Media uploading: "3 photos waiting to upload" chip. |
| R-42 | Handover capture (delivery/collection) | NEW | Opens from a push notification or the tracker when the rider marks "arrived". Per unit, it guides the shots:<br>• **overview**<br>• **serial plate**<br>• **accessories laid out**<br>• optional **15s video** (power-on test for cameras/lights)<br><br>It also shows the staff photos taken at dispatch ("Compare with ours"). Checklist ticks: "All accessories present", "No visible damage", or "Note a problem" (text + photo). **Slide to confirm: I received these items in this condition.** | Offline: captures save locally, confirmation is queued, a chip shows the queue. Camera permission denied: explain, with an "Open settings" button. Renter refuses or is absent: staff evidence stands (§5.8). |
| R-43 | Extend booking (sheet) | NEW (P1) | Pick a new end day. Checks availability → shows extra cost → pay via Paystack → tracker updates. | Next day booked: "We can only extend to 17 Oct; someone has it from 18 Oct". |
| R-44 | Damage claim (renter view) | NEW (P1) | What we found, side-by-side **before/after** photos, cost breakdown, what's covered by the deposit and Protection, and the amount due or deducted. Actions: **Accept**, **Dispute** (comment + photos), **Chat on WhatsApp**. Countdown: "Respond by 15 Oct, 6pm". | Settled: read-only with the outcome. |
| R-45 | Report a problem (sheet) | NEW (P1) | Gear not working, missing item, late delivery, other. Photo optional. Creates a ticket (booking note + alert to Ops); P0 = opens WhatsApp prefilled. | — |
| R-46 | Cancel booking (sheet) | NEW | Shows the policy result **before** confirming: "Cancelling now: you get back ₦X (rental refund ₦Y + deposit ₦Z + delivery ₦W)". Reason chips. Slide to cancel. | After dispatch: hidden; "Chat with us" instead. |

### 3.6 Other

| ID | Screen (file) | Status | Purpose | Notes |
|---|---|---|---|---|
| R-50 | Coming soon / waitlist (`coming-soon.tsx`) | CHANGES | "List your gear on Deloo: coming soon". Form: name, phone, gear list, area → `waitlist` (new vertical `gear_owner`). Also crew/studio. | — |
| R-51 | Notifications permission prompt | NEW | Asked after the first booking ("We'll tell you when your gear is on the way"), not at launch. | — |
| R-52 | Force update / maintenance | NEW (P1) | Blocks old app builds that use a retired API. | — |
| — | Vendor mode: `(vendor)/*`, `add-gear.tsx` | HIDE | Behind a feature flag, off for renters. Do not delete; it is the base for peer vendors later. Some pieces (the calendar UI, photo capture) are reused for R-13 and R-42. | — |

**Tab bar (renter):** Plan · Explore · Bookings · Me (Bag is reached from the header icon with a badge).

---

## 4. Admin portal: section and screen inventory

**Stack:**
- Next.js app in this repo, served on `admin.deloo.space` by host-based routing (check `node_modules/next/dist/docs` for the current middleware/proxy convention before building) or as a route group `app/(admin)`.
- Supabase auth (email OTP) plus a `staff_members` check. Non-staff get "No access".
- All mutations go through server actions / route handlers using the service role **after** a role check, and every one writes `audit_log`.

**Layout:**
- desktop-first with a collapsible sidebar
- **the Jobs view must work on a phone**, because riders use it in the field
- global search (booking ref, phone, name, serial)
- a "New" menu (manual booking, block dates, add item)

### 4.1 Sidebar

```
Dashboard
Bookings        (Pipeline · Calendar)
Dispatch        (Today · Schedule · Riders)
Jobs            (rider's own list; the only section a Rider sees)
Inventory       (Items · Units · Availability · Maintenance)
Handovers       (Evidence queue · Returns inspection)
Claims
Payments        (Transactions · Refunds & deposits · Reconciliation)
Customers       (All · Verification queue · Blocklist)
Demand          (Unmet demand · Plans · Waitlists)
Reports
Settings        (Fees & protection · Delivery zones & slots · Policies · Notifications · Staff & roles · Audit log)
```

### 4.2 Screens

| ID | Screen | Purpose and key content/actions | States / notes | Pri |
|---|---|---|---|---|
| A-00 | Sign in / No access | Email OTP. If the user is not in `staff_members` (active): "No access. Ask an owner." | — | P0 |
| A-01 | Dashboard | **Today:** deliveries and collections (count and late), returns awaiting inspection, holds pending payment, payments needing attention (late or unmatched), claims open, deposits to release. **This week:** bookings, revenue (rental vs protection vs delivery), utilisation % per item, top unmet demand. | Empty states per tile. | P1 (P0: the Today list only) |
| A-10 | Bookings pipeline | Table, plus a board toggle by status (§6). Columns: ref, renter, items, dates, stage, payment status, delivery slot, rider, flags (new customer, same-day, high value, late). Filters: status, date range, rider, unpaid, has claim. | Saved views: "Needs action today". | P0 |
| A-11 | Booking detail | Header: ref, renter (link to A-71), stage chip, total, **next action button** (e.g. "Mark prepared"). Tabs or sections:<br>**Items & units:** assign or swap units, with a conflict warning<br>**Timeline:** every status change, who, when<br>**Payments:** charges, refunds, deposit state<br>**Delivery:** slot, address, rider, notes<br>**Handovers:** out/back evidence, side by side<br>**Claim**<br>**Notes:** internal<br>**Messages:** WhatsApp quick-send templates via `wa.me` links<br>Actions: cancel (policy calculator), extend, record late return, open claim, send reminder. | Read-only users see no buttons. | P0 |
| A-12 | New manual booking | For WhatsApp or phone orders: pick the customer (or create one), items, dates, delivery. Then either send a **Paystack payment link** (Payment Request API) or mark "paid offline" (Finance approval). Same hold rules. | — | P1 |
| A-13 | Bookings calendar | Gantt: rows = units, columns = days. Bars = reservations (colour by stage) and blocks (grey). Drag to move a reservation to another unit of the same item (P2); click to open the booking. | Doubles as A-33. | P0 (read-only) |
| A-20 | Dispatch: Today | Two lists, **Out** (deliveries) and **In** (collections), sorted by slot. Each shows address, zone, items, rider, status (to prepare / ready / en route / done / failed). Bulk-assign rider. | Late items in red. | P1 (P0: deliveries visible on A-10 with slot and rider fields) |
| A-21 | Dispatch: Schedule | Next 7 days of jobs per slot; capacity per slot (settings) shown as "3/4". | — | P2 |
| A-22 | Riders | Staff with the rider role: phone, active, today's jobs. | — | P1 |
| A-23 | Jobs (rider, mobile web) | The rider's jobs for today. Tap a job to see address (Maps link), customer call/WhatsApp, item list with serials, **Start trip** → **Arrived** (pushes the renter to open R-42) → **Handover capture** (same shot list as R-42, via `<input type=file accept=image/*,video/* capture>`), customer present yes/no, **Complete**. Failed delivery: reason + photo. | Offline: the page caches the job; uploads retry (service worker P2; P0 = retry button). | P0 (simplified) |
| A-30 | Items | Table: photo, name, category, day rate, deposit, replacement value, units (active/total), utilisation 30d, active toggle. | — | P0 |
| A-31 | Item edit | Name, brand/model, category, description, specs, **what's in the box** (checklist used in handovers), photos (upload/reorder), day rate, deposit, replacement value, risk tier (computed), add-ons/compatible items, planner tags (e.g. `podcast_mic`, `interview_cam`), active. | Price change only affects new bookings (bookings snapshot prices). | P0 |
| A-32 | Unit detail | Serial, internal tag (e.g. `FX3-01`), condition grade (A/B/C) and notes, photos, status (active / repair / quarantine / retired / lost), acquisition date and cost, **history**: bookings, handover media, claims, maintenance. Actions: send to repair, retire (reason), mark found/lost. | — | P0 (fields + status); history P1 |
| A-33 | Availability | Same grid as A-13. **Block dates** sheet: unit(s), range, reason (maintenance, own shoot, cleaning) → a reservation with `booking_id null`. | Overlap refused by the DB: shows the conflicting booking. | P0 |
| A-34 | Maintenance log | Per unit: issue, sent date, vendor/repairer, cost, back date. Linked to claims. | — | P2 |
| A-40 | Evidence queue | Handovers completed in the last 48h, with flags: missing required shots, renter didn't confirm, renter noted a problem, upload incomplete. Mark reviewed. | — | P1 |
| A-41 | Handover detail | Per unit, a **side-by-side** grid: dispatch (staff), delivery (renter), collection (staff/renter), receipt (inspection). Each shot shows capture time (device and server), uploader, GPS if any, and file hash. Video player. Checklist answers. Download all (zip) for an insurer. | Missing media shown as dashed placeholders. | P0 (simple gallery per handover); side-by-side P1 |
| A-42 | Return inspection | For each unit received: guided shots (same list), function test checkboxes (powers on, sensor clean, buttons, battery count, accessories against "what's in the box"), condition grade, **result: OK / issue**. All OK → booking "checked", deposit release queued. Issue → creates a claim draft (A-51) with media pre-attached, unit → quarantine. | — | P0 (OK/issue + photos); claim draft P1 |
| A-50 | Claims list | Status, booking, renter, unit, amount assessed, amount recovered, age. | — | P1 |
| A-51 | Claim detail | Before/after evidence (pulled from A-41). Assessment: repair quote or replacement value, attachments (quotes, receipts). **Settlement calculator:** deposit applied, Protection covers (rate/cap from settings), renter owes. Send to renter (→ R-44, WhatsApp). Renter response. Decision: settle (deduct / charge via payment link / waive), with reason. Timeline. | — | P1 |
| A-60 | Transactions | All `payments`: ref, booking, renter, channel, amount, fees, status (initialized / pending / success / failed / abandoned / refunded-partial / refunded), Paystack id, paid at. Webhook events visible per payment (from `payment_events`). "Verify with Paystack" button (re-query). | Unmatched: money received for an expired hold (needs action). | P0 (list + detail); verify button P0 |
| A-61 | Refunds and deposits | Queue: deposits due for release (booking checked, no claim), cancellations to refund, claim deductions. For each: amount, method (Paystack refund to the original payment / transfer to the renter's bank account), **Release** (Finance/Admin/Owner). Status tracked from the `refund.*` webhooks. | Refund failed: retry / switch to transfer. | P0 (manual: record a refund done in the Paystack dashboard); API refund P1 |
| A-62 | Reconciliation | Paystack settlements (daily payouts to our bank) matched against payments; Paystack fees; deposits held (a liability) vs released; protection fund balance. Export CSV. | — | P2 (P1: CSV export of A-60) |
| A-70 | Customers | Table: name, phone, email, verified, trust tier, bookings, lifetime value, open claims, blocked. | — | P0 (simple) |
| A-71 | Customer profile | Contact, addresses, refund account (masked), KYC result and documents (reviewer only), trust tier (0–3) with history, **all bookings**, **all handover evidence** (gallery across bookings), claims, notes, flags. Actions: verify / reject, set tier, block / unblock (reason). | — | P0 (contact + bookings + evidence + notes + block); KYC P1 |
| A-72 | Verification queue | Pending KYC submissions: selfie vs ID, provider result; approve / reject. | — | P1 |
| A-80 | Unmet demand | Grouped by category/spec: count of requests, dates, areas, sample text; "Mark sourced" to notify requesters. | — | P1 (P0: raw table view) |
| A-81 | Plans | Recent plan-led sessions: shoot type, answers, level picked, converted yes/no; why not (unavailable, price). | — | P2 |
| A-82 | Waitlists | `waitlist` rows by vertical (gear_owner, crew, studio, ad_space); export. | — | P1 |
| A-90 | Reports | Revenue by week/item, utilisation per unit, conversion funnel (plan → review → pay → paid), late returns, claim rate, refund turnaround time. | — | P2 |
| A-91 | Settings: fees | Protection % (default 10% of rental) and cap; deposit rule; minimum rental days; lead time cutoff (e.g. 18:00 for next day); hold minutes (30); late fee rule; cancellation tiers; refund second-approver threshold. | Changes are versioned; bookings snapshot the values. | P0 (as a DB row edited in SQL; UI P1) |
| A-92 | Settings: zones and slots | Delivery zones (name, areas, price one-way, active), base address for pickup, slots per day and capacity. | — | P0 (seeded); UI P1 |
| A-93 | Staff and roles | Invite by email, set role, deactivate. | — | P0 (seeded via SQL); UI P1 |
| A-94 | Notification templates | Text for WhatsApp/SMS/email/push per event (§8). | — | P2 |
| A-95 | Audit log | Who, what, when, before/after JSON, reason. Filter by entity. | — | P1 (the table and writes are P0) |

---

## 5. End-to-end flows

Notation: **[R]** renter app, **[A]** admin, **[S]** system (Edge Function, webhook or cron), **→ state** for the data change.

### 5.1 Pricing (used by every flow)
- `days` = number of calendar days in the range (start and end inclusive). Minimum 1.
- `rental` = Σ item day rate × days × qty. (Multi-day discount is P2.)
- `protection` = round(rental × protection_rate) (setting, default 10%), applied per booking. This is a **damage waiver**, not insurance (PRD §4.7).
- `deposit` = Σ item deposit × qty. Refundable. Shown separately and never mixed into "price".
- `delivery` = zone price × 2 (drop and collect) if delivery; 0 if pickup.
- `total_due` = rental + protection + delivery + deposit.
- All values are snapshotted onto `bookings` and `booking_items` at hold time. Paystack fees are absorbed (Open Q).

### 5.2 Item-led booking with calendar day selection
1. **[R] Explore → R-12.** The app calls `item_calendar(item_id, from=today, to=+90d)`, which returns for each day the free unit count (no renter info).
2. **[R] R-13:** the renter taps the start and end days. The client blocks ranges that include a day with free=0. Footer shows days × rate.
3. **[R] Add to bag (R-14)** or **Book now** (bag with one item) → **R-30 Review**: choose delivery/pickup, address, slots; the fees are computed by `quote_booking(items[], range, delivery, zone)` (server, so prices can't be tampered with).
4. **[R] Pay ₦X → [S] `create_hold`** (RPC, security definer, one transaction):
   - checks the renter is not blocked and the lead time is OK;
   - for each item × qty, picks a free `active` unit (lowest utilisation first) and inserts a `reservations` row for the period (§5.5); the exclusion constraint guarantees no double-booking; on conflict the whole transaction fails → R-30 shows "just booked" + alternatives;
   - inserts `bookings` (status `hold`, `hold_expires_at = now()+30m`), `booking_items` (price snapshot, unit_id);
   - **→ booking `hold`, reservations live.**
5. **[S] `paystack-init`** (Edge Function) creates a `payments` row (`initialized`, reference = `DLO-<booking ref>-<n>`) and calls Paystack `transaction/initialize` (amount = total_due in kobo, email, channels card/bank_transfer/ussd, metadata {booking_id, payment_id}, callback to the deep link). Returns `authorization_url`.
6. **[R] R-31** opens the in-app browser. Then the payment flow, §5.4.
7. **[S] Webhook `charge.success`** → booking `confirmed` → **[R] R-34 Success**; push + WhatsApp/SMS confirmation; booking shows in R-40.

### 5.3 Plan-led booking
1. **[R] R-10 → R-20:** answers are stored in `events.answers` (an event row is created at the first answer; `events.kind = 'shoot'`).
2. **[R] R-21:** dates, zone, delivery → `events.starts_at/ends_at/area`.
3. **[S] Planner** (`mobile/src/planner`, rules rewritten for shoot types) produces **lines** (needs), for example 3-person podcast, Better:
   - 3× dynamic mic
   - 1× audio interface/mixer
   - 3× headphones
   - 2× cameras
   - 2× lenses
   - 2× key lights
   - 3× mic stands

   Each line is matched against our stock with `free_units(range, categories)`.
4. **[S]** For each line, the planner works through these cases in order:
   - **Fully free:** add it.
   - **Partly free:** take what's free; the rest becomes "Booked on your dates". The planner proposes, in order: (a) a swap within the category (e.g. ZV-E1 instead of FX3), (b) the nearest window where the *whole* setup is free (search ±7 days), (c) dropping the line with the trade-off explained.
   - **Not stocked at all** (e.g. teleprompter, 4th mic, drone if it is retired): a "We don't have this yet" card; insert `unmet_demand` (category, spec, qty, period, area, event_id). The planner never pretends.
   - Rows go to `recommendations` (one per level, with `lines` JSON).
5. **[R] R-23:** the renter picks a level, swaps (R-24), may share (R-25).
6. **[R] Book this setup** → the bag is filled with the chosen items and the event's dates → **R-30** (same as §5.2 step 3 onward); `bookings.event_id` = this event.
7. Unmet lines stay visible on the booking ("Not included: teleprompter, we don't stock it").

### 5.4 Paystack payment, including failure, abandonment and pending transfer
**Source of truth:** a webhook (`/functions/v1/paystack-webhook`) that passes all of these:
- the `x-paystack-signature` HMAC-SHA512 check with the secret key
- a re-query of `transaction/verify/:reference`
- amount = expected, and currency = NGN

Every event is stored in `payment_events` (idempotent on Paystack event id + reference).

| Case | What happens | State changes |
|---|---|---|
| **Success, card / USSD** | Webhook `charge.success` arrives within seconds. | payment `success` (paid_at, channel, fees); booking `hold → confirmed`; `hold_expires_at = null`; notifications. The app (R-31 polling / realtime) moves to R-34. |
| **Success, bank transfer** | The renter sees Paystack's transfer account; money lands after 1–15 min. The app shows **R-32 Pending** (the renter tapped "I've sent it" or closed checkout). | Payment stays `initialized` → `success` on the webhook. If the hold is still live → `confirmed`. |
| **Late success** (webhook after the hold expired) | Run `reconfirm_late_payment`: try to re-reserve the same items and period. | Units still free: re-reserve → `confirmed` (normal path). Not free: payment `success` + booking `expired` + `needs_refund` flag → A-61 queue, plus an urgent alert to Ops/Finance to offer alternatives or refund in full within 24h. Renter sees "We received your payment but the gear was taken. We'll call you in 15 minutes." |
| **Failed** (card declined, insufficient funds) | Paystack shows the error in checkout; the renter can retry inside the same checkout. No webhook guaranteed. | payment stays `initialized`; the hold stays until expiry. R-31 shows **Try again / Change method**. Retrying creates a new payment row and reference while the same hold continues. |
| **Abandoned** (browser closed, no attempt) | R-31 shows "Payment not finished" + Resume (re-opens the same `authorization_url` if < 30 min) or Change method (new reference). | Nothing until hold expiry → payment `abandoned`. |
| **Wrong amount** (underpaid transfer) | The webhook amount differs from expected. | payment `mismatch`; booking stays `hold` and the hold is extended by 60 min; Finance is alerted to contact the renter. |
| **Duplicate payment** | A second success for a booking that is already confirmed. | The second payment is flagged `duplicate` → A-61 refund queue. |
| **App killed mid-payment** | On next launch, R-40 shows the booking as "Awaiting payment" with Resume until expiry, or confirmed if the webhook arrived. | — |

Also: the success screen never trusts the client. When R-31 returns from the browser it calls `paystack-verify` (server) as a speed-up, which runs the same idempotent confirm logic as the webhook.

### 5.5 Rental period, buffers and hold expiry
- Reservation period = `[start_day 00:00 − prep_buffer, end_day+1 12:00 + turnaround_buffer)` in Lagos time.
  - Defaults: prep_buffer 0h, turnaround_buffer 12h. Example: a return collected the morning after, plus half a day to inspect and charge.
  - Settings-driven (Open Q 2).
- **Hold:** 30 min (setting). A **[S] pg_cron job runs every minute** and does three things:
  - bookings `hold` with `hold_expires_at < now()` and no payment in `pending`/`mismatch` → `expired`; reservations `live=false` (trigger);
  - payments `initialized` on those bookings → `abandoned`;
  - the renter gets "Your hold ended" (push only if they've left the app).
- A transfer the renter says they sent (R-32 "I've sent it") extends the hold once by 30 min.

### 5.6 Unit assignment
- **Automatic at hold.** The reservation needs a unit. Picker rule:
  - active units of that item with no overlapping live reservation;
  - prefer the unit that is already at base on the start day (no back-to-back), then the lowest 30-day utilisation, then the best condition grade.
- **Staff swap (A-11),** allowed until the booking is dispatched:
  - choose another unit of the same item, or of an equivalent item (with a price difference handled as a note; P1: auto credit);
  - in one transaction: insert the new reservation, then set the old one `live=false`;
  - logged to `audit_log`;
  - the renter isn't notified unless the item changes.
- **Unit goes to repair** with future bookings: A-32 warns "2 future bookings use FX3-01" and offers a reassign wizard. If no spare exists, Ops is alerted to do a rescue (call the renter, offer a swap or refund).

### 5.7 Dispatch and delivery tracking
1. **D-1 18:00 [S]:** jobs for tomorrow appear in A-20 (P0: A-10 filter "Delivering tomorrow"). Ops assigns a rider and confirms the slot. **[R]** reminder: "Your gear arrives tomorrow, 8–11am. Someone at the address?"
2. **[A] Mark "Being prepared":**
   - staff pull the units, charge the batteries, format the cards and pack the box against the "what's in the box" list;
   - they capture **dispatch evidence** (a staff-only handover `kind=dispatch`) at base, which is the strongest "before" record.
   - → booking `preparing`.
3. **[A/rider] Start trip** → booking `out_for_delivery`; `deliveries.departed_at`; **[R]** push and SMS/WhatsApp: "Out for delivery. Rider: Tunde, 0803…, ETA 10:30".
4. **[A/rider] Arrived** → push to the renter: "Your rider is here. Check your gear and take photos" → opens R-42.
5. **Handover** (§5.8) → **Complete** → booking `delivered`; `deliveries.delivered_at`.
6. **Failed delivery** (no one there, wrong address):
   - the rider records the reason and a photo;
   - booking stays `out_for_delivery` with `deliveries.status=failed`;
   - Ops calls the renter and reschedules (a new delivery row);
   - a second failure follows the cancellation policy.
- **Pickup instead of delivery:** step 3 is skipped; the renter arrives at base, the staff "Handover" happens at the counter, and the same evidence rules apply.

### 5.8 Delivery handover evidence (both parties, offline-tolerant)
**Required per unit:**
- overview photo
- serial plate photo
- accessories laid out (one photo per booking can cover all small items)
- for cameras and lights: a ≤15s power-on video (P1 required, P0 optional)

**Optional:** a close-up of any existing mark (pre-existing damage is noted here, so it can't be blamed later).

| Who | Captures | Confirms |
|---|---|---|
| Staff at base (dispatch) | Full set; this is the reference | — |
| Rider at door | Overview + serial per unit (fast) | "Handed to [name], ID seen" |
| Renter at door (R-42) | Full set on their phone | Slide: "I received these in this condition", or "Note a problem" |

**Rules**
- **A handover is complete** when the rider completes it. Renter confirmation is requested within **2 hours**. If none arrives, the system records `renter_confirmed=false, auto_accepted_at` and the staff evidence stands. The tracker tells the renter so: "We used our photos because you didn't add yours."
- **A problem noted by the renter** (scratch, missing battery):
  - it is attached to the handover;
  - Ops is alerted at once;
  - the item is either accepted as pre-existing damage (noted on the unit) or swapped.
- **Media handling:**
  - Photos are resized to 1600px long edge, JPEG ~0.7 (~250–400 KB).
  - Video is capped at 15s, 720p, ≤ 8 MB.
  - A SHA-256 hash is computed on the device; `captured_at` (device) and `uploaded_at` (server) are both stored; GPS is attached if permission is granted.
  - Files go to the private bucket `handover-media/<booking_id>/<handover_id>/…`, readable by the booking's renter and by staff.
- **Offline queue (renter app and rider web):**
  - Captures are written to app storage and a persistent queue (AsyncStorage or SQLite) *before* upload.
  - Uploads run in the background with retries and backoff (resumable TUS for video).
  - The UI shows a chip: "3 photos waiting to upload".
  - The confirmation slide is allowed offline; it is queued with its device timestamp and syncs later.
  - The server accepts late uploads but flags `uploaded_at − captured_at > 24h` in A-40.
- **Low-data mode:** video upload waits for Wi-Fi when the renter turns on "Save data" (P1).

### 5.9 In use
- Booking `delivered`. The tracker shows "In use" from the start day, and "Return due" from end_day 18:00 (D-0 evening reminder).
- These are display stages computed from time, not stored states, so there's no cron to drift.
- **[R]** Report a problem (R-45 / WhatsApp). For gear failure mid-shoot: Ops swaps it if a spare exists (a new delivery job, `kind=swap`) and the faulty unit goes to quarantine. A rental credit or refund for lost days is at Ops' discretion (logged).

### 5.10 Extension request (P1; P0 = by WhatsApp, staff edit in A-11)
1. **[R] R-43:** pick a new end day → `quote_extension` checks that the same units are free for the extra days.
   - If yes: show the price (extra days × rate + protection on that).
   - If a unit is not free but another unit of the item is: offer it only if a swap is practical (P2). Otherwise: "Can extend to X at most".
2. **[R] Pay** (a new payment row, Paystack). **[S] On success:**
   - update each reservation period (`upper = new end + buffer`), with the constraint checked;
   - `bookings.ends_at`; an `booking_items` extension line;
   - collection slot rescheduled; notification sent.
3. Extensions requested less than 3h before collection need Ops approval.

### 5.11 Late return
- **Grace:** 2h after the scheduled collection slot ends.
  - The renter not at home when the rider comes is also "late" (the rider records a failed collection).
  - Late is a display flag computed from time; Ops sees it in red on A-20/A-10.
- **Charges:**
  - each started extra day = day rate × 1.5 (setting), plus protection on that;
  - collected from a Paystack payment link (preferred), or deducted from the deposit at settlement;
  - a second failed collection = re-delivery fee.
- **Next booking at risk** (the unit is reserved within 24h after): urgent alert to Ops → reassign that booking to another unit (§5.6) or call the renter.
- **> 48h late with no contact:** escalate:
  - renter flagged and blocked for new bookings;
  - claim opened as "not returned";
  - after 7 days: replacement value claimed and the police report process (Owner decision).
- Notifications at due −24h, due −2h, due +2h (late), and +24h.

### 5.12 Return pickup and inspection evidence
1. **[S] D-1:** collection job created at the booking's return slot; rider assigned in A-20.
2. **[A/rider] at door:** "Collection handover" (`kind=collection`):
   - per unit: overview + serial + accessories;
   - the renter can capture too (R-42 in collect mode) and slides "I returned these";
   - → booking `collected`; reservations stay live until inspection (the turnaround buffer covers it).
3. **[A] At base: A-42 Return inspection** (`kind=inspection`), within 24h:
   - guided shots;
   - function tests;
   - accessories checked against "what's in the box";
   - a condition grade.
4. **Outcome:**
   - **All OK** → booking `inspected`; units back to `active`; **deposit release queued** (A-61) with due time `inspected_at + 24h` (promise: back within 48h of return).
   - **Issue on a unit** → unit `quarantine`; claim draft (A-51) with before (dispatch/delivery) and after (collection/inspection) media auto-linked; booking `disputed`; deposit held. Other units are unaffected.

### 5.13 Damage claim (P1 flow; P0 = handled manually with evidence in A-41)
1. **[A] Assess:** repair quote or replacement value; attach the quote; note the cause.
2. **[S] Settlement calculator:**
   - deposit is applied first;
   - above the deposit, Protection covers up to the cap (e.g. 80% of the repair up to ₦X, a setting) **unless excluded** (loss through negligence, unreported theft, missing accessories, water damage, PRD §4.7);
   - the renter owes the remainder.
3. **[A] Send to renter:** R-44 + WhatsApp, with a response window of 72h.
4. **[R] Accept** → settle. **Dispute** → comment + photos → Admin/Owner reviews (and can call); the final decision is logged with a reason.
5. **Settle:**
   - deduct from the deposit (partial refund of the rest);
   - if more is owed: a Paystack payment link (A-61), followed up for 7 days, after which the renter is blocked and the debt recorded;
   - a write-off is possible (Owner/Finance).
   - → claim `settled`; booking `closed`; the unit goes to repair (A-34) or `active`/`retired`.

### 5.14 Deposit refund
- **Trigger:** booking `inspected` with no open claim, or a claim settled with a deposit balance > 0.
- **Method** (Open Q 3):
  - **(a)** Paystack **Refund API**, a partial refund of the original transaction for the deposit amount. Card refunds land in 5–10 working days at the issuer, which hurts our promise.
  - **(b)** Paystack **Transfer** to the renter's verified bank account (R-07): fast (minutes); needs a transfer recipient and our Paystack balance.
  - **MVP:** (b) when the renter has a refund account, otherwise (a). P0 = Finance does it in the Paystack dashboard and records it in A-61 (amount, method, reference).
- **States:** refund `queued → processing → success | failed` (from the `refund.processed` / `refund.failed` / `transfer.success` / `transfer.failed` webhooks). Booking `closed` when the deposit is fully settled.
- **[R]** Tracker step "Deposit refunded ₦50,000 to GTB ••••1234 at 14:02". Push/WhatsApp.

### 5.15 Cancellation and refund policy (proposal; Open Q 4)

| When | Who | Refund |
|---|---|---|
| Within 1h of paying (cooling-off), and > 24h before start | Renter | 100% of everything |
| > 72h before start day | Renter | 100% of rental + protection + delivery + deposit |
| 24–72h before | Renter | 50% of rental; 100% of protection, delivery, deposit |
| < 24h before, or after dispatch | Renter | 0% of rental; delivery refunded if not yet dispatched; 100% deposit |
| No-show / failed delivery twice | Renter | As "< 24h" |
| Any time | Deloo (stock fault, repair, double-booking) | 100% of everything + ₦5k credit (P2), plus an offer of an alternative first |

- **Flow:**
  1. R-46 shows the calculated amount (server `quote_cancellation`).
  2. Confirm → booking `cancelled`; reservations freed (trigger).
  3. A refund row is queued → A-61 (Finance releases; auto under ₦50k in P1).
- **Paystack fees on a refunded payment** are absorbed by us (simplest; Open Q 6).

### 5.16 "We don't have it" and "Booked on your dates"
- **Not stocked** (search with no results, a planner line that can't be filled, R-33):
  - copy: "We don't have [X] yet. We've noted it, and we'll message you if we get it";
  - `unmet_demand` row with `profile_id` (new column) for follow-up;
  - A-80 groups these, and "Mark sourced" sends a WhatsApp/push to the requesters.
- **Stocked but booked:**
  - Item detail and calendar: booked days disabled; the banner gives the nearest free window of the same length.
  - Plan: a line chip "Booked on your dates" + swap options (same category, free) + "Move your dates: everything free 17–19 Oct".
  - **Notify me if it frees up** (P1): a `waitlist`-style row (`availability_alerts`); fired when a cancellation or expired hold frees that item for those dates.
  - These cases are also logged as `unmet_demand` with `reason='booked'`, so we learn what to buy a second unit of.

---

## 6. State machines

### 6.1 Booking status

Extend `booking_status`: keep `hold, confirmed, returned (unused), closed, cancelled, disputed`; **add** `expired, preparing, out_for_delivery, delivered, collected, inspected`. Deprecate `out` (no live data uses it). Update `private.sync_reservations` so that reservations stay **live** for `hold, confirmed, preparing, out_for_delivery, delivered, collected, disputed` and go non-live for `expired, cancelled, inspected, closed`. A disputed unit is held via `units.status = quarantine`, not via the reservation.

```
           create_hold            charge.success (verified)
 (none) ───────────────▶ hold ─────────────────────────▶ confirmed
                          │  hold_expires_at passed            │ staff: Mark prepared
                          ▼                                    ▼
                       expired ◀─ (late payment can't       preparing
                          │        re-reserve → refund)        │ rider/staff: Start trip (or pickup at base)
                          │ late payment, units free           ▼
                          └──────────▶ confirmed         out_for_delivery ──(failed delivery: stays, new delivery row)
                                                               │ handover completed
                                                               ▼
                                                          delivered   (display: In use / Return due / Late by time)
                                                               │ collection handover completed
                                                               ▼
                                                          collected
                                                               │ inspection: all OK          │ inspection: issue
                                                               ▼                             ▼
                                                          inspected ──deposit settled──▶ closed ◀──claim settled── disputed
 cancel: hold/confirmed/preparing ──▶ cancelled (refund per policy)
```

| From → To | Triggered by | Side effects |
|---|---|---|
| — → hold | Renter (Pay) via `create_hold`; staff via A-12 | reservations live; hold timer |
| hold → confirmed | System (verified webhook / verify) | notifications; `confirmed_at` |
| hold → expired | System (cron) | reservations off; payments abandoned |
| expired → confirmed | System (late payment, re-reserve succeeds) | new reservations |
| confirmed → preparing | Ops / Admin / Owner | dispatch handover expected |
| preparing → out_for_delivery | Rider (own job) / Ops | renter notified with rider details |
| out_for_delivery → delivered | Rider completes handover / Ops | renter confirm window starts |
| delivered → delivered (extend) | System on extension payment | `ends_at`, reservation periods updated |
| delivered → collected | Rider completes collection handover / Ops | — |
| collected → inspected | Ops (A-42 all OK) | deposit refund queued |
| collected → disputed | Ops (A-42 issue) | claim draft; unit quarantine |
| inspected → closed | System when the deposit refund succeeds (or deposit 0) | — |
| disputed → closed | Admin/Finance settles the claim | refunds/charges recorded |
| hold/confirmed/preparing → cancelled | Renter (R-46, before dispatch) / Admin / Owner | refund queued; reservations off |
| out_for_delivery/delivered → cancelled | Admin/Owner only (exceptional) | manual refund decision |

Display stages for the renter tracker map as follows:
- confirmed → "Confirmed"
- preparing → "Being prepared"
- out_for_delivery → "Out for delivery"
- delivered → "Delivered", then "In use" (time ≥ start) and "Return due" (time ≥ end 18:00)
- collected → "Collected"
- inspected → "Checked"
- closed → "Deposit refunded"

### 6.2 Unit status

`unit_status`: `active, repair, retired` + **add** `quarantine, lost`. Custody ("at base / out / in transit") is derived from the current booking stage and is not stored.

| From → To | By | When |
|---|---|---|
| (new) → active | Admin | Unit added with serial + photos |
| active → quarantine | Ops (A-42 issue) / System (renter-reported fault) | Pending claim or check |
| quarantine → active | Ops | Cleared |
| quarantine/active → repair | Ops | Sent for repair (log in A-34) |
| repair → active | Ops | Back and tested |
| any → retired | Admin/Owner (reason) | Written off / sold |
| active → lost | Admin/Owner | Not returned, after escalation |

Units in `repair, quarantine, retired, lost` are excluded from `free_units` / `item_calendar`, because those functions already filter `status='active'`. Their **future** reservations raise the reassignment alert (§5.6).

### 6.3 Payment status
`initialized → success | failed | abandoned | mismatch`, then `success → partially_refunded | refunded`; plus a `duplicate` flag. Refunds: `queued → processing → success | failed`.

### 6.4 Claim status
`draft → sent → accepted | disputed → settled | written_off`; also `draft → cancelled` (false alarm).

### 6.5 Delivery job status
`scheduled → assigned → en_route → arrived → completed | failed` (with kind `delivery | collection | swap`).

---

## 7. Data model additions (Supabase)

Concise; all tables have `id uuid pk`, `created_at`, RLS on; money in kobo.

**Changes to existing tables**

| Table | Change |
|---|---|
| `categories` | Relax the `grp` check to add `lens, gimbal, audio, grip, drone`. New keys: `lens`, `gimbal`, `light` (add kinds `panel, cob, tube, mat`), `mic` (add `dynamic_usb`), `audio_interface`, `headphones`, `mic_stand`, `stand`, `backdrop`, `drone`. `camera.kind` add `mirrorless`. Reconsider `spec_schema` for mount, sensor, focal length, output. |
| `items` | `in_the_box jsonb` (checklist items), `planner_tags text[]`, `addons uuid[]`, `slug`, `sort`. |
| `units` | `tag text` (FX3-01), `condition_grade char(1)`, `acquired_at`, `cost_kobo`, `notes`. Enum add `quarantine, lost`. |
| `profiles` | `email`, `kyc_status (none/pending/verified/rejected)`, `kyc_ref` (provider ref only, NDPA), `blocked_reason`, `notes_count`; keep `trust_level`. Remove reliance on `is_ops` → `staff_members`. |
| `events` | `kind text default 'shoot'`, `shoot_type text`. |
| `bookings` | `ref text unique` (e.g. `DLO-4K7Q`), `event_id` **nullable** (item-led bookings have no event), `rental_kobo, protection_kobo, delivery_kobo, deposit_kobo, total_kobo`, `protection_rate numeric`, `settings_version int`, `address_id`, `delivery_zone_id`, `delivery_slot`, `collection_slot`, `confirmed_at, cancelled_at, cancel_reason, cancelled_by`, `renter_confirmed_delivery_at`. Enum additions (§6.1). |
| `reservations` | `booking_item_id uuid` (which line), `kind ('booking','block')`, `reason`. |
| `unmet_demand` | `profile_id`, `reason ('not_stocked','booked')`, `raw_text`, `item_id` (if booked), `sourced_at`. |
| `waitlist` | Enum add `gear_owner`. |

**New tables**

| Table | Key columns | Notes |
|---|---|---|
| `staff_members` | `user_id pk`, `role (owner, admin, ops, rider, finance, readonly)`, `active`, `phone`, `display_name` | `private.staff_role()` helper for RLS; read-only = select only. |
| `booking_items` | `booking_id`, `item_id`, `unit_id`, `qty (1 per unit row)`, `day_rate_kobo`, `days`, `rental_kobo`, `deposit_kobo`, `kind ('rental','extension')`, `item_name_snapshot` | The price snapshot; one row per unit. |
| `addresses` | `profile_id`, `label`, `zone_id`, `street`, `landmark`, `contact_phone`, `lat/lng` | — |
| `delivery_zones` | `name`, `areas text[]`, `price_kobo` (one way), `active`, `sort` | Settings. |
| `payments` | `booking_id`, `purpose ('booking','extension','late_fee','claim','offline')`, `reference unique`, `amount_kobo`, `fees_kobo`, `channel`, `status`, `paystack_id`, `authorization_url`, `paid_at`, `flags text[]` | No card data stored. |
| `payment_events` | `payment_id null`, `provider_event_id unique`, `event_type`, `payload jsonb`, `received_at`, `processed_at`, `error` | Raw webhook log; idempotency. |
| `refunds` | `booking_id`, `payment_id`, `purpose ('deposit','cancellation','duplicate','claim_balance','goodwill')`, `amount_kobo`, `method ('paystack_refund','transfer','manual')`, `status`, `provider_ref`, `requested_by`, `approved_by`, `reason`, `processed_at` | Two-person rule by threshold (P1). |
| `refund_accounts` | `profile_id`, `bank_code`, `account_last4`, `account_name`, `paystack_recipient_code`, `verified_at` | Full number only in Paystack. |
| `deliveries` | `booking_id`, `kind ('delivery','collection','swap')`, `scheduled_date`, `slot`, `rider_id`, `status`, `departed_at`, `arrived_at`, `completed_at`, `failed_reason`, `address_snapshot jsonb` | — |
| `handovers` | `booking_id`, `kind ('dispatch','delivery','collection','inspection')`, `delivery_id null`, `performed_by`, `party ('staff','renter')`, `checklist jsonb`, `problem_note`, `renter_confirmed_at`, `auto_accepted_at`, `completed_at`, `device_completed_at`, `reviewed_by`, `reviewed_at` | One per side per kind; staff + renter rows for delivery. |
| `handover_media` | `handover_id`, `unit_id`, `shot ('overview','serial','accessories','damage','video_test','other')`, `media_type ('photo','video')`, `storage_path`, `sha256`, `bytes`, `width/height/duration_s`, `captured_at`, `uploaded_at`, `lat/lng`, `uploaded_by` | Private bucket `handover-media`. Never deleted while a claim is open; retention 12 months after close (Open Q). |
| `inspections` (or fields on `handovers` kind=inspection) | `unit_id`, `result ('ok','issue')`, `tests jsonb`, `grade` | Can live in `handovers.checklist`; keep it simple. |
| `claims` | `booking_id`, `unit_id`, `status`, `kind ('damage','missing_accessory','not_returned','late')`, `description`, `assessed_kobo`, `deposit_applied_kobo`, `protection_covered_kobo`, `renter_owes_kobo`, `excluded_reason`, `response_due_at`, `renter_response`, `decision`, `decided_by`, `settled_at` | Links to media via `claim_media(claim_id, handover_media_id)`. |
| `settings` | `version int pk`, `values jsonb` (protection_rate, protection_cap, hold_minutes, lead_time_cutoff, buffers, late_multiplier, grace_hours, cancellation tiers, slots, refund_threshold), `created_by` | Append-only; latest = current. |
| `audit_log` | `actor_id`, `actor_role`, `action`, `entity`, `entity_id`, `before jsonb`, `after jsonb`, `reason`, `at` | Insert-only (no update/delete grants). Written by server actions and by triggers on bookings, payments, refunds, units, claims, profiles.blocked. |
| `notifications` | `profile_id`, `event`, `channel ('push','whatsapp','sms','email')`, `booking_id`, `payload`, `status`, `provider_ref`, `sent_at`, `error` | Outbox; a worker sends. |
| `push_tokens` | `profile_id`, `expo_token`, `platform`, `last_seen_at` | — |
| `availability_alerts` (P1) | `profile_id`, `item_id`, `period tstzrange`, `notified_at` | "Notify me". |
| `booking_notes` | `booking_id`, `author_id`, `body`, `internal bool` | Also customer notes via `profile_id`. |

**New functions (security definer, granted to `authenticated`)**
- `item_calendar(item_id, from, to)` returns `(day date, free int, total int)`.
- `quote_booking(lines jsonb, from, to, delivery, zone_id)` returns the fee breakdown.
- `create_hold(...)` returns the booking.
- `quote_cancellation(booking_id)` and `request_cancellation(booking_id, reason)`.
- `quote_extension(booking_id, new_end)`.
- `next_free_window(item_ids[], days, around)`.
- Renter-safe RPCs only; staff mutations go through server actions with the service role plus a role check.

**Edge Functions:**
- `paystack-init`
- `paystack-webhook`
- `paystack-verify`
- `notify-worker` (outbox)
- **cron** (pg_cron): hold expiry every minute; reminders hourly; late flags every 15 min.

---

## 8. Notifications

Channels:
- **Push:** Expo push; needs `expo-notifications` + `push_tokens`.
- **WhatsApp:**
  - P0: staff click-to-chat `wa.me` with a prefilled template from A-11;
  - P1: WhatsApp Cloud API template messages via a BSP, or Termii.
- **SMS:** Termii, for when push isn't available and for critical money/delivery events (P1).
- **Email:** receipts and refunds; Paystack sends its own payment receipt (P0 relies on that).

| Event | Renter: push | Renter: WhatsApp/SMS | Renter: email | Staff (admin alert / WhatsApp group) |
|---|---|---|---|---|
| Hold created, payment not finished (10 min) | ✓ "Finish paying to keep your gear" | — | — | — |
| Hold expired | ✓ | — | — | — |
| Booking confirmed | ✓ | ✓ (ref, dates, slot) | ✓ receipt (Paystack) | ✓ new booking |
| Late payment, gear gone | ✓ | ✓ | — | ✓ **urgent** |
| Payment mismatch / duplicate | — | — | — | ✓ Finance |
| D-1 delivery reminder | ✓ | ✓ | — | ✓ unassigned jobs list (18:00) |
| Being prepared | ✓ (silent) | — | — | — |
| Out for delivery (rider, ETA) | ✓ | ✓ | — | — |
| Rider arrived → record handover | ✓ (high priority) | — | — | — |
| Delivered / renter didn't confirm in 2h | ✓ | — | — | ✓ evidence queue |
| Renter reported a problem | — | — | — | ✓ **urgent** |
| Return due −24h, −2h | ✓ | ✓ (−24h) | — | — |
| Late return +2h, +24h | ✓ | ✓ | — | ✓ |
| Collected | ✓ | — | — | — |
| Inspected OK (deposit coming) | ✓ | — | — | — |
| Claim sent / response due −24h | ✓ | ✓ | ✓ (with evidence link) | ✓ when renter responds |
| Deposit / refund paid | ✓ | ✓ | ✓ | — |
| Refund failed | — | — | — | ✓ Finance |
| Extension paid | ✓ | ✓ | — | ✓ rider schedule change |
| Cancellation (by renter / by us) | ✓ | ✓ | ✓ | ✓ |
| Unmet demand sourced / item freed (alert) | ✓ | ✓ | — | — |
| Next booking at risk (late unit / repair) | — | — | — | ✓ **urgent** |

Quiet hours: none for delivery-day events; marketing never (no marketing pushes in the MVP).

---

## 9. MVP cut: 22 Oct vs later

Assumptions:
- one engineer + AI, ~10 working days (Mon 12 Oct – Thu 22 Oct);
- the demo is a **real** booking on real stock with Paystack (test mode, or live with a ₦ small item), driven end-to-end on stage.

### P0: must work for the demo
1. **Stock loaded:**
   - category changes;
   - 26 items + units from `mastermind_inventory.csv`, with photos, day rates, deposits (placeholder rule), replacement values and "what's in the box";
   - Deloo vendor row approved.
2. **Item-led booking:** R-11 Explore (new categories), R-12 item detail with price/day + availability strip, **R-13 date range calendar** (`item_calendar`), R-14 bag (single date range), R-30 review with the full fee breakdown (`quote_booking`, settings row, zones seeded, delivery/pickup, slots).
3. **Holds:** `create_hold` with auto unit assignment, 30-min expiry by pg_cron, the race-condition error state.
4. **Paystack:**
   - `paystack-init`, in-app browser checkout (card/transfer/USSD);
   - **webhook with signature + verify + idempotency**;
   - `paystack-verify` on return;
   - R-31 countdown, R-32 pending, R-34 success only after confirm;
   - the late-payment branch at least flags for refund.
5. **Plan-led:** rewritten question set (R-20) and shoot-type rules for all 7 types against our stock; R-23 with Good/Better/Best, **"We don't have this yet"** (writes `unmet_demand`), **"Booked on your dates"** with a swap + nearest free window; Book this setup → same checkout.
6. **Bookings in the app:** R-40 list + R-41 tracker on real data (stages from §6.1), payment summary, WhatsApp help, cancel before dispatch (R-46) with the policy quote (refund executed manually).
7. **Handover evidence (simple):**
   - R-42 renter capture (overview, serial, accessories; video optional), compressed;
   - persistent upload queue with retry;
   - slide to confirm;
   - staff capture via A-23 mobile web;
   - `handovers` + `handover_media` + private bucket.
8. **Admin:**
   - A-00 auth + `staff_members` (roles seeded; enforce owner/admin/ops/rider/finance coarse checks);
   - A-10 bookings list;
   - **A-11 booking detail** with status buttons, unit swap, delivery slot + rider fields, evidence gallery, notes, `wa.me` templates;
   - A-13/A-33 read-only unit×day grid + block dates;
   - A-30/A-31 items edit; A-32 unit fields + status;
   - A-23 rider jobs (simple);
   - A-42 return inspection (OK/issue + photos);
   - A-60 transactions + verify;
   - A-61 manual refund/deposit record;
   - A-70/A-71 customers (bookings, evidence, notes, block).
9. **Notifications:** Expo push for confirmed, out for delivery, rider arrived, return due, deposit refunded; staff alerts as an email or WhatsApp group message from the webhook (simplest: a Slack/WhatsApp webhook, or an email to ops@).
10. **Audit log** table + triggers on bookings/payments/refunds/units (no UI).
11. **Renter-only** sign-up: hide vendor mode; R-50 waitlist for gear owners.

### P1: first two weeks after the demo (pilot readiness)
- KYC (R-05, A-72) and the trust tier gate at checkout for high-value kits (FX3 + GM lens).
- Paystack Refund/Transfer API from A-61, R-07 refund account, refund webhooks, two-person rule.
- Claims module (A-50/A-51, R-44, settlement calculator); side-by-side evidence (A-41); evidence queue (A-40).
- Extensions in-app (R-43); late-return automation + fees via payment link; next-booking-at-risk alerts.
- Dispatch Today board (A-20), riders (A-22), delivery jobs as their own table with failed-delivery handling.
- WhatsApp Business API / SMS templates; outbox worker; reminders cron.
- Settings UIs (A-91, A-92, A-93), audit log UI (A-95), unmet demand view (A-80), waitlists (A-82), CSV exports.
- Manual booking + Paystack payment link (A-12); "Notify me when free" alerts; phone OTP sign-in.
- Required power-on video for cameras/lights; save-data mode.

### P2: later
- Reports (A-90), reconciliation with Paystack settlements (A-62), maintenance log (A-34), dispatch schedule capacity (A-21).
- Drag-to-reassign in the calendar, multi-day discounts, ratings, credits, renter receipts PDF.
- Blur/darkness check on shots, OCR of serial plates, rider live location.
- Peer vendors (re-enable vendor mode, payouts/subaccounts), insurer-backed cover, crew/studio verticals.

### Suggested sequence (10 days)

| Day | Work |
|---|---|
| 1 | Migrations (§7 P0 subset); seed stock and settings |
| 2 | `item_calendar`, `quote_booking`, `create_hold` + cron, with tests |
| 3–4 | Paystack init/webhook/verify; R-12/R-13/R-14/R-30/R-31/R-32/R-34 |
| 5 | Planner rules for shoot types + R-20/R-23 states |
| 6 | Admin shell, auth, A-10/A-11, items/units |
| 7 | R-40/R-41 real tracker; push; status buttons end-to-end |
| 8 | Handover capture (R-42 + A-23), storage, queue; A-42 |
| 9 | A-60/A-61, A-70/A-71, cancellations; polish empty/error/offline states |
| 10 | Full rehearsal on a low-end Android over a throttled network; fix; demo script |

**Cut first if late:**
1. the bag (single-item bookings only);
2. A-23 (staff upload from A-11 on a laptop);
3. plan-led for 7 types → 4 types (podcast, interview, YouTube, photo).

---

## 10. Open questions for the founder

1. **Deposits:** what is the deposit per item? The CSV has none. Proposal: 20% of replacement value, min ₦10k, max ₦300k, lowered for verified repeat renters. Is ₦300k+ upfront for an FX3 kit acceptable to our renters?
2. **Rental day and buffers:**
   - Is a "day" a calendar day (delivered morning, collected the next morning) or 24h from delivery?
   - Do we need a turnaround buffer between bookings (proposal: 12h)?
   - What is the latest booking cutoff for next-day delivery (proposal: 18:00)?
3. **Deposit refunds:** should they go to the original card (Paystack refund, 5–10 days) or by bank transfer (minutes, but it needs the renter's account and our Paystack balance)? Is "deposit back within 48h" a promise we want to make?
4. **Cancellation policy:** do you approve the tiers in §5.15? Who absorbs Paystack fees on refunds?
5. **Protection:** what rate (proposal: 10% of rental) and what cap/excess per claim? Has a lawyer checked the waiver wording (not "insurance")? Is anything excluded beyond negligence and theft?
6. **Delivery:**
   - which zones and prices;
   - can renters also pick up from a base (where, and what hours);
   - who are the riders (staff or a dispatch partner like Gokada or Kwik), and does the rider need to be ours for evidence?
7. **Verification for the demo and pilot:** do we require ID before the first rental (and above what kit value), and which KYC provider (Smile ID, Dojah, Prembly)? Or do we use manual ID photo review until then?
8. **Inventory edge cases:**
   - The CSV has 27 rows, including a **DJI FPV Drone (₦70k/day)**. Is it in or out? Drones in Lagos need flight permissions.
   - Unit counts are blank for some items: are they all 1?
   - Are bundles (e.g. "Podcast kit for 2") products we should sell as one item?
