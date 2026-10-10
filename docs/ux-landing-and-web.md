# Landing page, web app and first end-to-end test

**Status:** draft, 10 Oct 2026. **Scope:** what we can ship this week. This doc does not cover design refinement.
**Domains (founder decision, 10 Oct):** `deloo.space` = landing (Next.js, repo root) · `app.deloo.space` = renter app on the web (Expo web export of `mobile/`) · `admin.deloo.space` = staff portal · Android APK = the same renter app, installed.
**Reads with:** `docs/prd-mvp-rental-ops.md`, `docs/booking-contract.md`, `docs/native-app-plan.md` §2, `supabase/inventory_deloo.sql`, `supabase/migrations/0011_booking_ops.sql`.

Facts the copy relies on. All of them come from the DB, so the page must read them and never hard-code them:
- **Stock:** 26 items in 9 categories (camera, lens, gimbal, light, mic, mixer, headphones, grip, backdrop). Day rates run from ₦2k to ₦50k.
- **Delivery zones** (`delivery_zones`, one-way price; drop-off plus collection costs 2×):
  - Mainland ₦5,000: Ikeja, Yaba, Surulere, Gbagada, Maryland, Ogba, Magodo, Oshodi, Agege, Isolo, Festac, Apapa
  - Island ₦7,500: VI, Ikoyi, Lekki
  - Outer Lagos ₦12,000: Ajah, Ikorodu, Epe, Badagry
  - Pickup is free.
- **Deloo Protection:** `app_settings.protection_rate`, currently **7%** in the DB (the PRD says 10%; the founder should confirm which is right). It is a damage waiver, not insurance, so never call it "insurance" in copy.
- **Deposit:** refundable, shown separately, back **within 48 hours** after we check the gear.
- **Holds and lead time:** a hold lasts 30 minutes. The earliest start is tomorrow.
- **Cancellation** (`private.cancellation_refund`):
  - More than 72h before the start: full refund. The same applies 24–72h before if you booked less than an hour ago.
  - 24–72h before: we keep half the rental.
  - Under 24h: we keep the rental and refund the rest.
  - After dispatch: chat with us.
- **Not built yet:** ID or KYC is P1, so the FAQ answer below is marked for the founder to confirm.

---

## 1. Landing page spec (deloo.space)

### 1.0 Ground rules
- **Route change.** `/` becomes the landing page (`app/page.tsx`). The old `(app)` web shell was being removed in the working tree on 10 Oct, so make sure no old link to `/plan`, `/gear` or `/account` 404s; redirect them to `app.deloo.space`.
- **Server-rendered only.** Use React Server Components with zero client components on the page. FAQ and menus use `<details>`. The waitlist form posts to a server action.
- **Live data with caching.** Read the public catalogue and zones with the anon Supabase key, using `revalidate = 3600`. A price edit in admin then shows within an hour, and we never query per visitor.
- **Mobile-first.** Single column at 360px. Two to four columns from 768px. Content max width 1080px. Tap targets of 48px or more.
- **CTAs everywhere.** Every CTA pair is **Rent on the web** (primary → `https://app.deloo.space`) plus **Get the Android app** (secondary → `APK_URL`, placeholder `https://deloo.space/download/deloo.apk`). Keep `APK_URL` in one constant. Under the APK button add a small line: "Android 8+ · about XX MB · your phone will ask to allow installs from this browser".

### 1.1 Sections, in order

| # | Section | Purpose | Copy (exact) | Data |
|---|---|---|---|---|
| 1 | **Top bar** | Brand and a way out | Wordmark `deloo.` · links: "Gear", "How it works", "FAQ" · button "Rent now" | — |
| 2 | **Hero** | Say what we do in 5 seconds | **H1:** "Camera, light and sound gear for your shoot, delivered across Lagos." **Sub:** "Tell us what you're shooting and we'll suggest a kit, or pick gear yourself. Pay online, get it delivered or pick it up, and get your deposit back after." **CTAs:** "Rent on the web" · "Get the Android app" · **Trust line under the CTAs:** "From ₦2,000 a day · Deposit refunded within 48 hours · Pay with Paystack" | Lowest day rate (`min(day_rate_kobo)`), shown as "From ₦X a day" |
| 3 | **Featured gear** | Show real kit and real prices | **H2:** "Popular this week" · card: photo, name, "₦35,000 / day", small "Deposit ₦X, refundable" · link "See all 26 items →" (app Explore) | 6 active items, chosen by `sort` or a `featured` flag (if there is none, use the top 6 by day rate across categories). Photo from the public `items` bucket, resized to 400px. Each card links to `app.deloo.space/item/<id>` |
| 4 | **Categories** | Let browsers jump in | **H2:** "What you can rent" · chips with counts: "Cameras (4)", "Lenses (5)", "Gimbals (2)", "Lights (5)", "Mics (4)", "Podcast mixer (1)", "Stands and grip (3)", "Backdrops (1)" | Live counts per `category_key`. Each chip → `app.deloo.space/explore?category=<key>` |
| 5 | **Shoot types** | Sell the planner | **H2:** "Not sure what you need? Describe your shoot." **Sub:** "Type it like you'd tell a friend. We'll suggest the camera, lenses, light and sound, with a reason for each." Example bubble: *"3-person podcast in Lekki on Saturday, two cameras"* · tiles: Podcast · Music video · Short film or skit · Interview · Photo shoot · Event coverage (weddings, church services, conferences) · YouTube, TikTok and reels · CTA "Plan my shoot" → `app.deloo.space` | Static list matching `ShootType` in `mobile/src/lib/intake.ts` |
| 6 | **How it works** | Remove fear of the unknown | **H2:** "How renting works" · **1. Plan or pick:** "Describe your shoot or browse the gear." · **2. Choose your days:** "See what's free on a calendar. Rent from tomorrow." · **3. Pay securely:** "Card, bank transfer or USSD on Paystack. You see rental, protection, delivery and deposit before you pay." · **4. Receive and return:** "We deliver or you pick up. We both take photos of the gear at handover and return, and your deposit comes back within 48 hours." | — |
| 7 | **Trust** | Money and gear clarity | **H2:** "Your money and our gear, both protected" · **Deposit refunded:** "Your deposit is held, not spent. It comes back within 48 hours after we check the gear." · **Deloo Protection:** "For 7% of the rental, accidental damage is covered up to a limit, so one mistake won't cost you the full price of a camera." *(confirm the rate and cap)* · **Handover photos:** "At delivery and return, you and our rider photograph each item. No arguments later about who did what." · **Delivery across Lagos:** table of zone, areas and price for drop-off and collection | Zones table: name, areas, `price_kobo × 2` ("₦10,000 drop-off and collection"). "Pickup is free" plus the pickup area (`app_settings.pickup_address`, area only) |
| 8 | **FAQ** | Answer the objections | 8 questions, see §1.2 | Rate, zones and policy values read from the DB |
| 9 | **Rent out your gear (coming soon)** | Capture supply demand | **H2:** "Own gear that sits idle?" **Sub:** "Soon you'll be able to rent it out through Deloo. Leave your WhatsApp number and we'll tell you first." Fields: name, WhatsApp number, "What gear do you have?" (one line). Button "Join the waitlist". Success: "You're on the list. We'll message you on WhatsApp." | Insert into a `waitlist` table (or the existing one, if there is one). Rate-limit, plus a honeypot field |
| 10 | **WhatsApp band** | Our users' real support channel | "Questions? Chat with us on WhatsApp. We reply between 8am and 8pm." Button "Chat on WhatsApp" → `https://wa.me/<support_whatsapp>?text=Hi%20Deloo%2C%20I%27d%20like%20to%20rent%20gear` | `app_settings.support_whatsapp` |
| 11 | **Footer** | Legal and contact | Wordmark · "Gear rental for creators in Lagos" · links: Terms of rental, Privacy, Cancellation and refunds, Deloo Protection, Contact (WhatsApp, email, phone) · "Rent on the web" · "Android app" · `© 2026 Deloo` · business address or area | Legal pages can be simple static pages this week |

The CTA pair repeats after sections 3, 6 and 8. On phones, a sticky bottom bar with "Rent now" appears after the hero scrolls away. It is CSS-only (`position: sticky`), with no JS.

### 1.2 FAQ (plain answers; numbers come from the DB)
1. **How much is the deposit, and when do I get it back?** "Each item has its own refundable deposit, shown before you pay. We return it within 48 hours after we check the gear, to your card or bank account."
2. **What does Deloo Protection cover?** "Accidental damage during your rental, up to a limit, for 7% of the rental. It doesn't cover loss through carelessness or theft without a police report." *(founder to confirm the cap and exclusions)*
3. **Do you deliver? How much?** "Yes, across Lagos. Mainland ₦10,000, Island ₦15,000, Outer Lagos ₦24,000 for drop-off and collection together. Or pick up for free."
4. **Can I cancel?** "Yes, before we send the gear out. More than 3 days before your start date, you get everything back. Between 1 and 3 days, you get everything back except half the rental. Less than a day before, the rental is kept and the rest is refunded."
5. **Do I need ID?** "Bring a valid ID (NIN slip, driver's licence, international passport or voter's card) when you receive the gear. For high-value kits we may ask you to verify before delivery." *(founder to confirm; KYC is P1)*
6. **How do I pay?** "Card, bank transfer or USSD through Paystack. We never see your card details."
7. **What if the gear doesn't work?** "Tell us on WhatsApp straight away. We'll swap it or refund that item. Your handover photos and video show it arrived like that."
8. **How early do I need to book?** "Any time up to the day before. Popular cameras go fast at weekends, so book early."

### 1.3 Performance budget (3G, mid-range Android)
| Metric | Budget |
|---|---|
| Client JS | ≤ 30 KB gz (Next runtime only, no client components on this page). No analytics script except a server-side or ~1 KB beacon |
| HTML + CSS | ≤ 50 KB gz, critical CSS inline |
| Fonts | `next/font`, self-hosted, 2 files max (Bricolage 700 for headings, Atkinson 400 for body), `display: swap`, subset to Latin |
| Images | AVIF/WebP via `next/image`. Hero ≤ 80 KB (or no photo: type plus a gear cut-out). Gear cards 400w ≤ 25 KB each, `loading="lazy"` below the fold |
| Total first view | ≤ 300 KB. Full page ≤ 700 KB |
| Timing | LCP < 2.5s on Slow 4G and < 4s on Fast 3G (Lighthouse mobile). CLS < 0.05. Lighthouse Performance ≥ 90 |
No carousel, no video autoplay, no animation libraries. Respect `prefers-reduced-motion` and data saver (`Save-Data` header: skip images below the fold).

### 1.4 SEO basics
- **`<title>`:** "Deloo: Camera, light and sound gear rental in Lagos"
- **Meta description:** "Rent Sony FX3, lenses, gimbals, lights and podcast mics by the day in Lagos. Delivery across the Mainland and Island, refundable deposit, pay with Paystack."
- **OG/Twitter:** the same title and description, plus `og:image` at 1200×630 (gear flat-lay plus wordmark, ≤ 150 KB), `og:locale` `en_NG`, and a canonical URL. WhatsApp previews depend on the OG tags, so test the link in WhatsApp.
- **Structured data (JSON-LD):** `LocalBusiness`, subtype `Store`, with name, url, telephone, `areaServed: Lagos`, address (area), `openingHours`, `sameAs` (Instagram). Add an `ItemList` of the featured gear, each a `Product` with `offers` (`priceCurrency: NGN`, `price` = day rate, a `unitText: DAY` description). Add `FAQPage` for §1.2.
- **Also:** `sitemap.xml` (landing plus legal pages), `robots.txt` that allows the landing page and disallows `/admin` and `/api`. `lang="en-NG"`. One H1. Alt text on gear photos ("Sony FX3 cinema camera").
- **Accessibility:** contrast 4.5:1 or better, visible focus states, labels on the waitlist form, and FAQ `<details>` that are keyboard-operable.

---

## 2. Web app audit (app.deloo.space)

Legend: **MUST** = blocks the first E2E test. **SHOULD** = before inviting real renters. **LATER** = after launch.

### 2.1 Platform-wide
| Area | Finding in code | Change for the web | Mark |
|---|---|---|---|
| Hosting and routes | `app.json` has `web.output: "static"`. Dynamic routes are `item/[id]`, `booking/[id]`, `plan/ask/[q]` | Netlify site for `app.deloo.space` that builds `npx expo export -p web`. Add rewrites so the dynamic routes resolve on refresh or deep visit (`/item/* → /item/[id].html 200`, and the same for booking and plan), then fall back to `/* /index.html 200`. Check that a hard refresh on every route works | MUST |
| Storage | `supabase.ts` and `handover.ts` use `expo-sqlite/localStorage/install` | Check that the shim maps to `window.localStorage` on web. If it pulls in SQLite WASM, it needs COOP/COEP headers and a large download, so use `window.localStorage` directly on web (a `Platform.OS` branch) | MUST (check) |
| Auth session | `detectSessionInUrl: false`, email OTP code | The code flow works on web as is. Add `https://app.deloo.space` to Supabase Auth Site URL and redirect URLs. Check that the session persists across reload and the Paystack redirect | MUST |
| CORS | The app calls `{API}/api/paystack/init` and `verify` on `deloo.space` with a Bearer header | Add CORS on those routes for origin `https://app.deloo.space` (plus localhost:8081 in dev): allow the `Authorization` and `Content-Type` headers, and answer `OPTIONS` | MUST |
| Icons | `ui/icon.tsx` uses `SymbolView` with `web: n.android` (Material name) | Check that all ~40 icons render on web. If SymbolView has no web renderer, add `icon.web.tsx` with inline SVGs (Material Symbols outline) for the names we use. A blank square is a fail | MUST (check) |
| Tabs | `(renter)/_layout.tsx` uses `NativeTabs` from `unstable-native-tabs` | Check web support. If it is missing or poor, add `_layout.web.tsx` with JS `Tabs` (bottom bar on phones; on screens ≥ 900px, a left rail with the same 4 items) | MUST (check) |
| Haptics | `expo-haptics` in button, chip, tile, segmented, date range and slide-to-confirm | No-op on web. Make sure the calls are guarded or caught, so nothing throws | MUST (check) |
| Slide to confirm | Gesture-handler pan | Check it with a mouse and touch. Add a keyboard and screen-reader fallback: a focusable button "Confirm" that appears on web, or on focus | MUST (mouse/touch) / SHOULD (a11y) |
| Sheets | `formSheet` with detents (swap, share, cancel) | On web these render as full pages or modals. Check that close/back works and the content isn't clipped. Add `presentation: 'modal'` with a max-width card on desktop | SHOULD |
| Safe areas | `SafeAreaView` everywhere | Insets are 0 on web, which is fine. Add `viewport-fit=cover` and the `env(safe-area-inset-bottom)` padding on sticky footers (iOS Safari home bar) | SHOULD |
| Keyboard | `keyboardShouldPersistTaps`, `softwareKeyboardLayoutMode: resize` (Android only) | On mobile Chrome, check that sticky footers (Pay, Book) aren't hidden by the keyboard and inputs scroll into view. Use the `interactive-widget=resizes-content` viewport meta | SHOULD |
| Back and URLs | 14 `router.back()` calls | A deep-linked page has no history, so use `canGoBack() ? back() : replace(fallback)` in `TopBar`. The browser back button must not land on `/pay` and re-open checkout | MUST |
| Desktop width | Phone layouts | Wrap the root in a centred column, `maxWidth: 560` (explore grid: 960 with 3–4 columns). Body background `paper` outside the column | MUST (column) / LATER (real desktop layout) |
| Fonts | `useFonts` blocks render until fonts load (`fontsLoaded ? … : null`) | On web, render with fallback fonts and swap them in, so a slow connection doesn't show a blank page. Preload 2 fonts only | SHOULD |
| Bundle size | Reanimated, gesture handler, supabase | Measure the export. Target ≤ 600 KB gz initial JS. Lazy-load `plan/*`, `book/*` and `booking/handover`. Show a loading state with the wordmark, not white | SHOULD |
| SEO | — | `noindex, nofollow` meta plus `X-Robots-Tag: noindex` header on app.deloo.space. The landing page owns SEO | MUST |
| PWA | — | **Yes, minimal:** a manifest (name, icons, `display: standalone`, theme `#0F6B73`) so "Add to Home screen" works. Android users mostly get the APK. **No service worker** for now | SHOULD (manifest) / LATER (offline SW) |
| Vendor mode | `(vendor)/*`, `add-gear` | Not reachable for renters on web. Check that `mode` can't flip to vendor. Remove or hide the vendor routes from the web build | SHOULD |

### 2.2 Screen by screen (renter)
| Screen | Web check / change | Mark |
|---|---|---|
| `welcome`, `sign-in` (email, then 6-digit code) | Email keyboard and `autocomplete="one-time-code"` on the code field. Check the "wait N seconds" and 429 messages. Check the code email arrives on Gmail web. Enter submits | MUST |
| `onboarding` | Name and WhatsApp number. Check inputs, validation and the Enter key. Remove "rent out my gear" (PRD R-03) | MUST |
| `(renter)/index` Plan (type your shoot) | Multiline input. Check that the voice/mic button is hidden on web (or uses Web Speech only where supported) | MUST |
| `plan/details`, `plan/ask/[q]`, `plan/sizing`, `plan/setup` | Tiles and chips with mouse and touch. Date range on web. The question URL is shareable but needs plan state, so a refresh must restore it from storage or send the user back to the start without crashing | MUST |
| `plan/swap` (sheet) | Renders as a modal page. Closing returns to the setup with the swap applied | MUST |
| `plan/share` | `whatsapp://send` fails on desktop. On web use `https://wa.me/?text=…` (works on phones and WhatsApp Web), and `navigator.share` where available, or copy to clipboard with a "Copied" toast | MUST |
| `(renter)/explore` | Grid columns by width. Category from the URL (`?category=` from the landing chips). Images through `expo-image` at the right sizes | MUST (category param) |
| `item/[id]` | **Shareable URL** `app.deloo.space/item/<id>`. A signed-out visitor is sent to `welcome` by `Stack.Protected`. **Change:** let `item/[id]` and `explore` be viewed signed out, and ask for sign-in at "Choose dates/Book", returning to the item afterwards. Bad or retired id → "This item isn't available" → Explore | MUST (resolve or return after sign-in) / SHOULD (public view) |
| `book/review` | Address and phone inputs, zone chips, terms checkbox, the totals. Pay creates the hold | MUST |
| `book/pay` (Paystack) | **Change: full-page redirect, not a popup.** `openAuthSessionAsync` on web opens a popup, which mobile browsers block or lose. On web: call `init` with `{ booking_id, return_to: 'web' }`. The server, already in progress in the working tree with migration `0013`, sets the callback to `<allow-listed origin>/pay` and Paystack appends `?reference=`. Then `window.location.assign(authorization_url)`. Keep the active hold in localStorage (it already is). The `AppState` re-check becomes `visibilitychange`. The inline popup (`@paystack/inline-js`) is LATER | MUST |
| `pay` (return route) | Today it forwards `deloo://pay?reference=`. On web, `/pay?reference=` (or `trxref`) must load directly, run `verify`, and `replace` to success or pending, so Back doesn't return to Paystack. Keep `deloo.space/pay/return` for the APK only | MUST |
| `book/success` | Shown only when `status = confirmed`. "Share to WhatsApp" uses the `wa.me` fallback | MUST |
| `(renter)/bookings`, `booking/[id]` | Shareable URL for the renter's own booking. Signed out → sign in → back to it. Tracker refreshes on focus or `visibilitychange` (no push on web). "Chat on WhatsApp" goes through `wa.me` with the ref prefilled | MUST |
| `booking/handover` | **Capture:** `expo-image-picker` on web becomes `<input type=file>`. The camera opens on Android Chrome only with `capture="environment"`. Check that `launchCameraAsync` sets it, otherwise use a web-specific `<input accept="image/*" capture="environment">`. Video: `accept="video/*" capture`. The browser can't enforce 15s, so read the duration after capture, reject videos over 20s or 25 MB with "Keep it under 15 seconds", and compress photos with `expo-image-manipulator` (canvas on web) to about 1600px. **Queue:** `handover.ts` moves files with `expo-file-system` (`Directory`/`File` on `Paths.document`), which **won't work on web**. On web, keep the blobs in **IndexedDB** with the job list in localStorage. Upload straight away when online and show the "N waiting to upload" chip. A reload must not lose captures. Check that `startHandoverSync` runs on web | MUST |
| `booking/cancel` (sheet) | Calls `quote_cancellation` and shows the refund before you confirm. Slide to cancel works with a mouse. After cancelling, the tracker shows the banner and refund status | MUST |
| `(renter)/me` | Sign out clears localStorage and IndexedDB captures. WhatsApp help link. Terms and privacy link to deloo.space. App version shows "web" | SHOULD |
| `coming-soon`, `vendor/[id]` | Hide on web, or point to the landing waitlist | LATER |

---

## 3. Test plan: first end-to-end run (before design refinement)

**Setup:**
- Paystack **test** keys on deloo.space (Netlify) and in the app's API base.
- Supabase Auth URLs include app.deloo.space.
- `support_whatsapp` and `pickup_address` set.
- A staff user with role `admin` or `ops` on admin.deloo.space.
- Two test emails (renter A for web, renter B for the APK).

**Devices:**
- A mid-range Android phone (Chrome, plus the APK)
- A laptop (Chrome)
- Throttle one web pass to "Fast 3G" in DevTools

**Record for every failure:** the step number, device and browser, URL, a screenshot or screen recording, the console errors (web), the booking `ref` and `id`, the Paystack reference, and the time in Lagos. Log each failure in a sheet with these columns: step, expected, actual, severity (blocker/major/minor), owner.

### 3.1 Web (renter A on phone Chrome, staff on laptop)
| # | Step | Expected | If it fails, record |
|---|---|---|---|
| 1 | Open `deloo.space` on the phone (Fast 3G) | Hero, featured gear with real photos and ₦/day, zones table with ₦ prices. Usable within 4s. No layout jump | Lighthouse mobile report; which section is missing data |
| 2 | Share the landing link in WhatsApp | Preview shows the title, description and OG image | Screenshot of the preview |
| 3 | Tap a featured gear card | Opens `app.deloo.space/item/<id>`. Signed out: shows the item, or sign-in then returns to it | Final URL; whether it returned to the item |
| 4 | Tap "Rent on the web" → Get started → enter email | "Check your email". The code arrives within 1 minute | Supabase auth log; spam folder? |
| 5 | Enter the 6-digit code, then complete onboarding (name, WhatsApp number) | Lands on the Plan tab. A reload keeps you signed in | Console; localStorage keys present? |
| 6 | Check the chrome: icons, tab bar, desktop width (open on the laptop too) | No blank icons. Tabs work. Content is a centred column on the laptop | Screenshot of each broken icon or tab |
| 7 | Plan: type "3-person podcast in Lekki on Saturday, two cameras" and continue | Questions only for what's missing. Sizing state, then the setup with Good/Better/Best, line cards and Why? | Answers sent; screenshot of the setup |
| 8 | Swap one line, then Share → WhatsApp | Swap sheet opens and applies. Share opens WhatsApp (or `wa.me`) with the setup text and a link | Which share path ran |
| 9 | Book this setup → Review: pick dates (from tomorrow), delivery, zone Island, address, phone, accept terms | Totals itemised: rental, protection (7%), delivery ₦15,000, deposit, total. They match `quote_booking` | Screenshot plus the RPC response from the Network tab |
| 10 | Pay → Paystack (test card **4084 0840 8408 4081**, expiry any future date, CVV **408**, PIN **0000**, OTP **123456**) | Full-page redirect to Paystack. After the OTP, back on `app.deloo.space/pay?reference=…`. "Confirming…", then Success with the ref. Browser Back does **not** reopen Paystack | Paystack reference; `/api/paystack/verify` response; CORS errors |
| 11 | Repeat 9–10 but close the Paystack tab before paying, then reopen the app | The Pay screen shows "unfinished" with the hold countdown. Paying again works | Hold expiry time; payment rows |
| 12 | Bookings tab → open the booking; reload the URL | Tracker at "Confirmed". Payment summary and deposit line shown. The URL survives a reload | Booking id; console |
| 13 | **Admin:** open admin.deloo.space → Bookings | The booking appears with ref, renter, items, units, paid total, status `confirmed`. The payment is `success` in Transactions | Missing fields; webhook event in `payment_events` |
| 14 | **Admin:** stage it: Mark prepared → Out for delivery (assign a rider) | Each change is in the timeline and audit log. The renter tracker updates on refresh or focus | Which transition was refused (role? status?) |
| 15 | **Renter (web, phone):** Handover → delivery: overview and serial for each unit, accessories, a 10s power-on video | Camera opens directly (rear). Thumbnails appear. The "N waiting to upload" chip drains to 0. Files show in the `handover-media` bucket | Phone model; file sizes; any upload error; whether captures survived a reload mid-upload |
| 16 | Turn on airplane mode, take 2 photos, reload, turn off airplane mode | Captures are kept and upload when back online | Count before and after the reload |
| 17 | **Staff (admin, Jobs or the booking):** capture the delivery handover → mark Delivered | Staff and renter evidence both visible, side by side, in the admin booking. Status `delivered`; the renter sees Delivered or In use | Missing media; wrong party label |
| 18 | **Staff:** collection handover → Collected → Inspection OK → Checked → Close | Deposit release queued in Refunds. The renter sees "Checked", then "Deposit refunded" once Finance records it | Refund row; status history |
| 19 | **Cancel flow:** make a new booking more than 72h out and pay. Then booking → Cancel | The sheet shows the refund amount before you confirm (full). Slide to cancel → "Cancelled" banner. A refund row appears in admin. The unit is free again on the calendar | `quote_cancellation` vs the amount shown; refund row |
| 20 | Cancel a booking 24–72h out (or set `starts_at` in staging) | Refund = paid − half the rental, and it matches the sheet | Both numbers |
| 21 | Try to cancel after Out for delivery | The cancel option is hidden, and "Chat with us" is shown | Screenshot |
| 22 | Me → Sign out | Back to Welcome. Pending captures and session cleared | Storage after sign-out |

### 3.2 Android APK (renter B)
Install the APK from the landing link: tap "Get the Android app", allow installs from Chrome, and install. **Expected:** it installs and opens on Welcome. **Record:** the Android version, and whether the install prompt copy was clear.

Then rerun steps **4–22**, with these differences:
- **Step 10:** Paystack opens in the in-app browser. Its callback goes `deloo.space/pay/return` → `deloo://pay?reference=…`, and the app closes the browser and verifies. Also test **switching to a banking app and back** (the `AppState` re-check). Record whether the browser stayed open or showed "Back to the app" (handover failed).
- **Step 15:** use the native camera and the 15s video cap. Kill the app mid-upload and reopen it: the queue resumes.
- **Step 3 (deep links):** a shared `app.deloo.space/item/<id>` link opens in the browser, which is expected for now. Android App Links are LATER.
- **Also check:** the system back gesture on every screen, with no exit from mid-flow without a confirm on Pay; and dark mode.

### 3.3 Exit criteria for this run
- Steps 1–19 pass on web and APK, with no blocker. Money shown equals `quote_booking` and the Paystack amount to the kobo. Every booking is visible in admin within 1 minute of payment.
- Every handover photo and video lands in storage and shows in admin, for both parties.
- Failures are triaged into the sheet. Blockers are fixed before design refinement starts.
