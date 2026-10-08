# Deloo native app: UX and build plan

**Status:** agreed 8 Oct 2026 (decisions in §8). Replaces the "PWA first, Android APK later" route in `IMPLEMENTATION_PLAN.md`.
**Decision asked for:** native iOS and Android apps, **Android first**, with a much better UX than the current web shell.

---

## 1. What I looked at

| Source | What was usable | Patterns taken |
|---|---|---|
| Craftwork → Interface → Mobile, Onboarding | Public, real app screens and motion | One big question per screen with a voice button ("Who is in your household?"); a "Listening…" voice state; slide-to-confirm for big actions; deposit/instalment cards with a progress bar; a step tracker with checkpoints (loaded → checkpoint → arrived); a floating pill tab bar; receipt capture with the camera; a large-number hero ("Spendable ₦0"); rotating-word welcome ("Earn / Spend / Invest") |
| Spotted in Prod | Category and pattern lists only; clips are blurred unless you're a member | Airbnb clip tags confirm the patterns I expected: map ↔ list, shared-element card → detail, expand/collapse detail, host/guest mode switcher |
| Mobbin | Needs a login, so nothing loaded | Not used. **If you sign in to Mobbin in Chrome, I can study specific flows** (Airbnb, Turo, Fat Llama, Bolt, Chowdeck, Moniepoint) screen by screen. |

The patterns below also come from apps I know well that solve our exact problems:
- **Airbnb:** search, listing detail, date picking, switching between guest and host modes.
- **Turo and Getaround:** photo check-in and check-out of a valuable item, damage claims.
- **Fat Llama:** renting gear from other people.
- **Chowdeck, Glovo and Bolt:** live order tracking that Lagos users already know.
- **Moniepoint and Kuda:** trust, money and verification screens for Nigerian users.

---

## 2. UX principles for our users

1. **Built for the phones people actually have.** Most of our users are on mid- and low-end Android phones (Tecno, Infinix, itel, Samsung A-series), with costly data and patchy signal. That means:
   - small downloads, compressed images, everything cached
   - screens that work offline and sync later
   - no heavy effects
   - tested on a ₦100k phone, not a flagship
2. **One decision per screen.** Planning an event is new to most renters, so ask like a person would: one question, big tap tiles, always a way back.
3. **Talk or type.** Every planning step accepts voice ("outdoor crusade, about two thousand people, we want to stream on YouTube"), in English or Pidgin later.
4. **Show trust everywhere money or gear changes hands:**
   - verified badges and real photos
   - "deposit refunded in X hours" stated up front
   - a timeline showing what happens next
5. **WhatsApp is the user's home.** Share a setup, a quote or a booking to WhatsApp in one tap. Support is a WhatsApp chat, not a form.
6. **The phone is the login.** Sign in with a phone number and a one-time code (OTP), not email and password.
7. **Platform-native feel:**
   - Android: Material 3 behaviour (system back gesture, bottom sheets, ripple, edge-to-edge)
   - iOS: native sheets and haptics
   - Deloo's own colours and type on both

---

## 3. Information architecture

**Two modes in one app, like Airbnb's "Switch to hosting":**

| Renter mode | Vendor mode |
|---|---|
| **Plan**: start or resume an event plan | **Today**: pickups, returns, requests to accept |
| **Explore**: browse gear by category | **Calendar**: availability per item; long-press and drag to block dates |
| **Bookings**: live trackers | **Gear**: listings and units |
| **Me**: verification, payments, settings, switch mode | **Earnings**: payouts, deposits held |

The tab bar is a floating pill with 4 items. The mode switch lives in **Me** and as a long-press on the avatar.

---

## 4. Key flows

### 4.1 First run (under 60 seconds)
1. **Welcome:** one screen with rotating words ("Sound / Screens / Cameras / Light"), "for your event, delivered", and a **Get started** button.
2. **Phone number → 6-digit code,** read automatically from the SMS on Android.
3. **Your name**, then **"What brings you here?"** as two large cards (Plan an event / Rent out my gear), with "both" as a small link.
4. Drop straight into **Plan**. Verification is asked for later, only when the booked gear needs it.

### 4.2 Plan (the core)
- **Start card:** "Tell us about your event", with a big mic button and a text field. Below it: "Or answer a few questions →".
- **Question cards,** one per screen, with a progress bar along the top:
  - **Event type:** illustrated tiles (Service, Crusade, Wedding, Conference, Concert, Party).
  - **Indoors / covered outdoors / open outdoors:** three tiles.
  - **Crowd size:** a slider with a live crowd illustration that fills up, and the number in big type.
  - **What's happening on stage:** multi-select chips (speakers, band, choir, DJ, panel).
  - **Livestream or recording:** tiles.
  - **Power:** "Grid / We have a generator / Nothing", with a note that we'll add surge protection.
  - **Date and time:** a native date sheet, with setup time asked in plain words ("Setup from 7am").
  - **Area:** chips for Lagos areas, or use current location.
  - **Budget:** "Show me options" by default.
- **Thinking state** (~1s): "Sizing your sound for 2,000 people outdoors…". It's honest about what's happening, never a fake spinner.
- **Your setup:**
  - A large total at the top, with deposit and protection broken out underneath.
  - A segmented control for **Good · Better · Best**.
  - Line items as cards: photo, name, quantity, a coloured availability chip (*Available / 1 left / Not available*), and a **Why?** that expands to the plain-language reason.
  - **Swap** opens a bottom sheet of alternatives ranked as in PRD §4.3, each with a one-line trade-off ("Projector instead: cheaper, not bright enough outdoors in daylight").
  - When nothing fits, an honest card: "We don't have a 16 ft outdoor LED wall free on 10 Oct. We've noted it, and here are your options."
  - Sticky bottom: **Share to WhatsApp** and **Book this setup**.

### 4.3 Explore
- Category chips with icons, and a gear grid with real photos.
- A filters bottom sheet: date, area, delivery, technician included.
- **Item detail:** opens from the card with a shared-element transition. Photo carousel, key specs as large figures (1,300 W · 15"), vendor card with verified badge and rating, a mini availability calendar, and a "Add to a plan" button.

### 4.4 Book and pay
1. **Review sheet:** items, dates, delivery or pickup, technician, protection explained in one line.
2. **Pay with Paystack** (card, transfer, USSD). Deposit and rental are shown separately, as cards with a progress bar.
3. **Slide to confirm** for the final step, so big payments are never one accidental tap.
4. **Booking tracker** (like Chowdeck): Confirmed → Packed → On the way → Set up → Event → Collected → Deposit refunded. Each step has a time, and Android shows an ongoing notification on the day of the event.

### 4.5 Handover checklist (pickup and return)
- A **guided camera**, as in Turo: for each unit, an outline frame shows what to shoot (front, back, serial plate, accessories). A shot is checked for blur and darkness before it's accepted.
- **Serial number:** read from the camera image, with typing as a fallback.
- **Checks:** "Surge protector connected?" and "Covered setup?" as large yes/no toggles.
- **Both sides confirm** by sliding on their own phone.
- **Works offline:** photos queue with a visible "3 photos waiting to upload" chip and sync when the signal returns.

### 4.6 Vendor: add gear in under a minute
1. **Snap a photo:** AI suggests the category, brand and model ("Looks like a JBL EON715, 15-inch powered speaker"), and the vendor confirms or edits.
2. **Price:** the day rate, with "Similar gear in Lagos rents for ₦20k–₦28k".
3. **How many do you have?** A stepper; units are created automatically.
4. **When is it busy?** Calendar presets ("Every Sunday morning" for churches).

### 4.7 Verification (only when needed)
- Triggered at checkout when the gear's tier needs it: "To rent LED walls, verify your identity. Takes 2 minutes."
- The identity provider's SDK handles the NIN/BVN check and selfie.
- Trust shown as tiers you unlock: "Verified for: small gear ✓ · sound systems ✓ · LED walls 🔒".

---

## 5. Look and feel

- **Starting point:** the tokens in `design.html` (lagoon, marigold, Bricolage Grotesque for headings, Atkinson Hyperlegible for body), rebuilt as a mobile design system.
- **Feel:**
  - calm and confident, more Moniepoint and Airbnb than a flashy gaming app
  - large numbers for money and quantities
  - photo-led cards
  - one accent colour for primary actions
- **Light and dark modes,** with dark used for the event-day tracker.
- **Motion with purpose:**
  - shared-element card → detail
  - sheet springs
  - the crowd slider illustration
  - haptics on confirm
  - Reduce Motion respected
- **Accessibility:**
  - 48 dp touch targets
  - text that scales with system font size
  - contrast checked in both themes
  - screen-reader labels on every icon button

---

## 6. Technology

**Recommendation: React Native with Expo**, Android first, with iOS from the same code:
- **TypeScript,** like the current code. The planner rules, types and formatting are shared between the mobile app and the web.
- **Supabase works unchanged.** All of Phase 0 carries over: the schema, RLS, the demo catalogue and the double-booking rule.
- **EAS Build:**
  - an Android APK for the incubator demo within days
  - a Play Store bundle later
  - iOS builds without a Mac in the loop
- **Over-the-air updates** for fixes, without waiting for store review.
- Real native UI (not a web view), so it can feel as good as the apps above.

| Concern | Choice |
|---|---|
| Navigation | Expo Router (file-based, like Next.js) |
| Styling | NativeWind (Tailwind classes, like the web) on a small set of our own components |
| Motion and gestures | Reanimated, Gesture Handler |
| Sheets and lists | @gorhom/bottom-sheet, FlashList |
| Images and camera | expo-image (caching), expo-camera, image compression before upload |
| Offline | TanStack Query with persisted cache, MMKV queue for checklist uploads |
| Login | Supabase phone OTP via an SMS provider (Termii or Twilio; Open Question) |
| Payments | Paystack (checkout in a secure sheet) |
| Push | expo-notifications (FCM on Android) |
| Errors | Sentry for React Native (already used on the web) |

**Alternatives considered:**
- **Flutter:** excellent UI, but a new language (Dart), and nothing can be shared with the existing TypeScript and web code.
- **Separate native apps** in Kotlin and Swift: the best possible feel, but two codebases, roughly 2× the effort for a small team.

**What happens to the Next.js web app:**
- It becomes **deloo.space**: a landing page, coming-soon waitlists, shareable booking and setup links (opened from WhatsApp), and the **Ops console**.
- Vendors with many items may also get a web dashboard later.

**Repo shape:**
- `apps/mobile` (Expo)
- `apps/web` (the current Next.js app)
- `packages/core` (planner rules, types, money formatting, Supabase types)

---

## 7. Build plan

| Step | Goal | Done when |
|---|---|---|
| **N0: Setup** (2 days) | Monorepo; Expo app shell with tabs, theme and fonts; Supabase login; dev build on an Android phone | You open the app on your phone, sign in, and switch between renter and vendor mode |
| **N2: Plan** (week 1–2) | Planner rules in `packages/core` with 20+ tests; question flow; voice/text intake; Your setup with Good/Better/Best, availability, swap, unmet-demand logging; Share to WhatsApp | On a mid-range Android phone, "outdoor crusade, 2,000 people, livestream" gives three priced setups from the demo catalogue, with an honest "not available" and alternatives |
| **N3: Explore and vendor basics** (week 2) | Explore and item detail; vendor Gear list and add-gear; calendar blocks; coming-soon waitlists on the web | **Incubator demo:** APK installed on judges' or your phones; both modes work against the demo catalogue |
| N4: Book and pay | Holds, Paystack, vendor accept/decline, booking tracker, notifications | Paid test booking end to end; race for the last unit handled |
| N5: Trust | Phone OTP, verification SDK, tier gating, guided checklist camera with offline queue, claims, reviews | Checklist done in airplane mode syncs later; tier-3 gear blocked until verified |
| N6: Launch | Play Store (internal → production), Lagos pilot with real vendors, Ops console on the web | 30 real bookings |
| N7: iOS | App Store build from the same code, with iOS polish | Approved on the App Store |

**Risk:** the incubator deadline (~22 Oct) is tight for a native app. N0–N3 fit if we build only renter planning, Explore and basic vendor gear for the demo. Booking and payment would be shown as a clickable flow without real money.

---

## 8. Decisions (8 Oct 2026)

1. **Framework:** Expo / React Native.
2. **Build first:** no separate Figma pass; screens are built straight away and refined on the phone. N1 is dropped, and the look is decided in N0/N2 on the device.
3. **Login:** email one-time code for the demo; phone OTP before the Lagos pilot (N5).
4. **Mobbin:** not used; go with the patterns in §1.
