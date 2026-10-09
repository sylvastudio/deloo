# Deloo native app: screen specs

**Status:** draft for design and build, 9 Oct 2026. Owner: UI design.
**Reads with:** `docs/native-app-plan.md` (flows, IA), `PRD.md` (tiers, protection, lifecycle), `mobile/src/theme/tokens.ts`, `mobile/src/ui/*`.
**Screen IDs** match the UX research flow maps. New screens are proposed in §5 and never renumber existing ones.

Notation used throughout:
- Spacing uses the token names from `tokens.ts`: `xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `xxl` 32 · `xxxl` 48 dp.
- Radius tokens: `sm` 8 · `md` 14 · `lg` 20 · `xl` 28 · `pill`.
- Type tokens: `hero` 40 · `title` 28 · `heading` 20 · `body`/`bodyStrong` 16 · `label` 14 · `caption` 13 · `number` 34.
- Colour tokens: `paper`, `surface`, `raised`, `ink`, `slate`, `faint`, `line`, `lagoon`, `lagoonStrong`, `lagoonTint`, `marigold`, `marigoldTint`, `red`, `green` and their tints.
- "Footer" means the sticky action bar pinned above the keyboard and the gesture inset (the `Screen` `footer` prop).

---

## 1. Visual direction

1. **Lagoon does the work; marigold is the spark.** Lagoon is for the one primary action per screen, selection, progress, links and the active tab. Marigold is used in only four places: the welcome screen's rotating word and CTA (on lagoon), the mic button, the "1 left" / limited state, and the R6 total highlight. Never put marigold text on `paper` or `surface`: it is about 1.9:1. Marigold is always a fill, with `ink` on top.
2. **Surfaces are flat and layered, not shadowed.** `paper` is the page, `surface` is cards and sheets, and `raised` is inputs and pressed states, with hairline `line` borders. Elevation (Android `elevation: 3`, an equivalent soft iOS shadow) is used only on things that float: bottom sheets, the sticky footer when content scrolls under it, the snackbar and the camera shutter. No blur, glass or gradients, because they are expensive on Helio/Unisoc GPUs.
3. **Big numbers carry money and quantity.** Every price total, crowd size, unit count and payout uses `number` (34) or `hero` (40) in Bricolage. Body copy is always Atkinson Hyperlegible Next. Naira is written in full in totals and summaries (`₦485,000`); `₦25k` is allowed only in compact chips and ranges.
4. **Icons:** Material Symbols Rounded (weight 400, optical size 24, filled when selected) on Android; SF Symbols (regular, `.fill` when selected) on iOS, through one `Icon` component with an `md`/`sf` name pair. Icons are 24 dp in a 48 dp target, and 20 dp inside chips. An icon is never the only label on a primary action.
5. **No emoji in the UI.** Emoji render differently across Android skins (old Noto on itel and Tecno), carry no screen-reader meaning and look cheap next to Bricolage. The current `Tile emoji` prop becomes `icon` or `illustration`. Emoji are fine inside text the user writes, and the WhatsApp share text uses none.
6. **Photography for gear, illustration for ideas.** Gear is shown only in real photos on a neutral background: 4:3 in cards, 1:1 in thumbnails. They load through `expo-image` with a blurhash placeholder at two sizes (a 480 px WebP thumbnail of 40 KB or less, and a 1080 px detail image of 150 KB or less). Event types, the crowd slider, empty states and the welcome screen use flat two-tone line illustrations (ink strokes, lagoon and marigold fills, static SVG under 6 KB each). No Lottie. Illustrations never show gear we don't stock.
7. **Status colour is semantic and never alone.** Available = `green`, limited = `marigold`, not available or error = `red`, neutral = `slate`. Each status has a text label and a 6 dp dot or icon, so it reads in greyscale and for colour-blind users. **Token fix needed:** green on `greenTint` at 13 px is 3.8:1. Add `greenInk` `#17704A` (light) / `#6FD3A3` (dark) for badge text. `faint` (3.4:1 on paper) is only for placeholders and disabled states, never for captions; captions use `slate`.
8. **Density.** The page gutter is `lg` (16 dp) on phones narrower than 400 dp (most of our devices are 360 dp) and `xl` (24 dp) at 400 dp and wider. Use `xl` between sections, `md` between cards in a list, and `lg` inside cards. One idea per card. Lists use 72 dp rows (thumbnail 48) or 88 dp rows (thumbnail 64) for gear. Body text is never below 13 sp.
9. **Motion has three speeds.** 150 ms for press feedback, 220 ms (standard easing) for state and layout changes, and 300 ms for screens and sheets (springs: damping 22, stiffness 240, no overshoot on sheets). Only R5 Thinking, the crowd illustration and the R18 success may run longer, and nothing loops except the R2 waveform and the A1 words. Under Reduce Motion / Remove animations, everything becomes a 150 ms crossfade, the A1 words stop on "Sound" and the crowd fills without animating.
10. **Haptics confirm, never decorate.** `selection` on tile, chip and segment changes. `impactMedium` when the slide-to-confirm thumb reaches the end. `notificationSuccess` on booking success and handover complete. `notificationWarning` on a blocking error. Never on scroll or on passive state changes.
11. **Android first, Material 3 behaviour.** Edge-to-edge with transparent system bars and content padded by the safe-area insets. Predictive back works everywhere: a sheet dismisses before a screen pops, and question flows step back one question. Every pressable has a ripple (`android_ripple`, bounded and clipped to the radius). Bottom sheets have a 32×4 dp drag handle, a scrim at `ink` 40%, and open to 50%, 90% or content height. The snackbar is for undoable actions. Dates and times use the Material date and time pickers. Targets are 48 dp minimum (`touch`); primary buttons are 54 dp tall (the current `Button`). There is no hamburger menu and there are no top tabs that scroll sideways.
12. **iOS adaptations from the same code.** Sheets become native `formSheet` with detents. Swipe-back replaces predictive back. Large titles collapse on scroll in tab roots. Toggles are UISwitch. Date pickers are inline or compact UIDatePicker. SF Symbols replace Material Symbols. Haptics are slightly richer (Taptic), but the patterns are the same. No ripple; pressed opacity is 0.88. Respect the home-indicator inset in footers.
13. **Navigation chrome.** Keep the native tab bar that is already in code (Material 3 navigation bar on Android, UITabBar on iOS) rather than the floating pill in the plan. It is cheaper, works with TalkBack and the system back stack, and follows the system font size. Renter mode has 4 tabs; vendor mode has 5 (Today, Calendar, Gear, Earnings, Me). The active indicator is `lagoonTint` with a `lagoon` icon.
14. **Dark mode is real, not inverted.** It follows the system setting by default. R20 Booking tracker and the R21/V12 cameras are always dark: on event day, with screens glowing in a dim hall, a bright page is a liability. Dark tokens are already defined. Photos get no dimming overlay.
15. **Lean on data.** Show cached content first and refresh quietly. Skeletons appear only after 300 ms (never a flash). There is no autoplay video, and carousels load only the visible image plus the next one. Show an `OfflineBanner` instead of blocking. Every write the user makes (answers, checklist photos, gear drafts) is saved on the device first.

---

## 2. Component inventory

### 2.1 Existing components (`mobile/src/ui`) and the changes they need

| Component | Purpose | Variants | States | Change needed | Used on |
|---|---|---|---|---|---|
| `Text` | All text, bound to type and tone tokens | `variant`: hero, title, heading, body, bodyStrong, label, caption, number. `tone`: ink, slate, faint, lagoon, red, green, onLagoon | none | Add the `greenInk` and `marigoldInk` (= ink) tones. Set `maxFontSizeMultiplier` to 1.6 on `hero` and `number` so they don't overflow | Everywhere |
| `Button` | Actions | `primary` (lagoon), `accent` (marigold, only on A1 and on lagoon surfaces), `secondary` (surface + line), `quiet` (text) | default, pressed, disabled, loading | Add `danger` (red fill for "Raise claim" and "Decline"), `size="md"` (44 dp, for inline actions in cards), a `fullWidth` default in footers, and an `iconOnly` with a required `accessibilityLabel` | Everywhere |
| `Tile` | Big answer card | single (radio), multi (checkbox) | default, pressed, selected, disabled | Replace `emoji` with `icon` (24 dp in a 40 dp `lagoonTint` rounded square) or `illustration` (64 dp). Add `layout="grid"`: square 2-column tiles with the illustration on top | A5, A6, R3a–R3i, V10 |
| `Chip` | Filter and multi-select option | default, selected (ink fill) | default, pressed, selected, disabled | Add a leading `icon` and a removable (×) variant. Selected = `ink` fill with `paper` text, as now | R3d, R3h, R11, R12, V3, V5 |
| `Badge` | Status pill | available, limited, unavailable, neutral | none | Add a leading 6 dp dot, use `greenInk` for text, and add `info` (lagoonTint/lagoon) and `verified` (green + check icon) | R6, R13, R19, V5 |
| `Screen` | Safe area, title, scroll, sticky footer | `scroll`, `edges` | none | Responsive gutter (rule 8). Add a `topBar` slot, footer elevation that appears only when content is under it, `refreshControl`, and a `tone="dark"` override | All full screens |
| `Card` | Grouped content | default | none | Add `pressable` (ripple, chevron), `tone` (lagoon / marigoldTint / redTint) and `padding` (lg default, md compact) | Everywhere |
| `Field` | Labelled input | text, multiline | default, focused (lagoon 1.5 border), error, disabled | Add a `prefix` (`+234`, `₦`), a trailing action (clear, mic), and a character count | A2, A4, A6, R3h, V8, V15 |
| `Gap` | Vertical spacer | none | none | none | Everywhere |

### 2.2 New components

| Component | Purpose | Variants | States | Used on |
|---|---|---|---|---|
| `Icon` | One API for Material Symbols and SF Symbols | size 20 / 24 / 32, filled | none | All |
| `TopBar` | Back, title, up to 2 actions; 56 dp | `plain`, `progress` (thin bar + "3 of 9"), `transparent` (over a photo) | scrolled (hairline appears) | R3*, R6, R13, R15–R23, V2, V6–V13 |
| `ProgressSteps` | 4 dp lagoon bar with optional step text | continuous, segmented | none | A2–A6, R3*, R21, V6–V10 |
| `QuestionCard` | Shell for one question: title, helper, answer slot, "Say it instead" voice chip | `tiles`, `grid`, `slider`, `chips`, `form` | default, answered, skipped | R3a–R3i, A5 |
| `VoiceButton` | Mic entry point | `hero` (56 dp marigold circle), `chip` ("Say it instead", 40 dp) | idle, listening, processing, unavailable (hidden), permission denied | R1, R3*, R4 |
| `Waveform` | Live mic level as 5 to 7 bars | none | listening, paused | R2 |
| `CrowdSlider` | Attendance input with a big number and an illustration | none | dragging, settled, typed (exact number) | R3c |
| `ChipGroup` | Wraps chips with single or multi logic and an optional "Show all" | `wrap`, `rail` (horizontal scroll) | none | R3d, R3h, R11, R12, V3, V4 |
| `Stepper` | − value + | `inline`, `large` (number type) | min, max, disabled | V9, R15 (quantity), R12 |
| `YesNo` | Two big side-by-side answers for checks | none | unanswered, yes, no | R21, V12 |
| `ListRow` | Settings and info rows | `nav` (chevron), `switch`, `value`, `danger` | pressed, disabled | R24–R28, V11, V14–V18 |
| `Sheet` | Bottom sheet wrapper (@gorhom on Android, formSheet on iOS) with a handle, title, scroll body and footer | `content`, `half`, `full` | opening, open, dragging, closing | R2, R8, R10, R12, R15, R16, R22, V4, V2 decline |
| `ActionBar` | Sticky footer layouts | `single`, `pair` (secondary + primary), `price` (price on the left, CTA on the right) | elevated when scrolled under | R6, R13, R15, R17, V2, V8 |
| `MoneyHero` | A large total with breakdown lines under it | `total`, `earnings`, `compact` | loading (skeleton), stale ("prices from 2h ago") | R6, R15, R17, V14 |
| `TierSegmentedControl` | Good · Better · Best switch with each total | none | selected, recommended dot, unavailable (strikethrough plus a reason) | R6 |
| `SetupLineItem` | One recommended item: photo, name, qty, price, `AvailabilityChip`, **Why?** and **Swap** | `default`, `added-by-you`, `required` (lock icon, e.g. surge protector) | collapsed, expanded (R7), swapping, unavailable | R6, R7, R15 |
| `AvailabilityChip` | A `Badge` for stock status on a date | `available`, `limited` ("1 left"), `unavailable`, `unchecked` ("Not checked: offline") | none | R6, R8, R11, R13 |
| `AlternativeRow` | A swap option with a trade-off line and a price change | `same-item`, `equivalent`, `different-approach`, `other-date` | selected, unavailable | R8, R9 |
| `UnmetCard` | Honest "we don't have it" card with a plan B | inline, full | none | R6, R9 |
| `GearCard` | Item in a grid or list | `grid` (4:3 photo), `row` (64 dp thumbnail) | loading, unavailable on the chosen date (dimmed 60%) | R11, R14, V5 |
| `PhotoCarousel` | Swipeable photos with page dots and a count | `detail`, `evidence` (compare 2) | loading, error (retry tile) | R13, R23, V13 |
| `SpecFigure` | A key spec as a big figure ("1,300 W") with a caption | none | none | R13, V7 |
| `VendorCard` | Avatar, name, verified badge, rating, bookings done, typical reply time | `compact`, `full` | none | R13, R14, R15, R20 |
| `TrustLadder` | Tiers 1 to 3 with checks and locks | `compact` (one line), `full` | locked, in progress, unlocked | R16, R24, R25 |
| `PriceSummary` | Itemised rows: rental, Protection, delivery, technician, deposit (separate), total | `review`, `receipt` | loading, changed (row highlight) | R15, R17, R18, V2 |
| `DepositCard` | Money card with a progress bar (deposit held → refunded, payout pending → paid) | `deposit`, `payout`, `hold-timer` | pending, in progress, done | R17, R20, V14 |
| `HoldTimer` | Chip with a 30-minute countdown for held units | none | normal, under 5 min (marigold), expired (red) | R15, R17 |
| `SlideToConfirm` | Track with a draggable thumb for irreversible actions | `pay`, `handover` | idle, dragging, released short (springs back), confirming (spinner), done | R18, R21, V12 |
| `CheckpointTracker` | Vertical timeline of booking steps with times | `full`, `mini` (horizontal dots in cards) | done, current (pulse once), upcoming, problem (red) | R19, R20, V1, V2 |
| `GuidedCameraFrame` | Camera overlay with a shot outline, instruction, quality check | `front`, `back`, `serial`, `accessories`, `free` | aligning, too dark, blurry, captured, accepted | R21, V6, V12, V13 |
| `ShotStrip` | Row of the required shots with ticks | none | todo, done, retake | R21, V12 |
| `UploadQueueChip` | "3 photos waiting to upload" | none | queued, uploading (n of m), done (auto-hides after 2 s), failed (tap to retry) | R21, V12, V6, V13, global |
| `OfflineBanner` | Thin `raised` bar under the top bar: "You're offline. Showing saved info." | none | offline, back online (green, 2 s) | Global |
| `CalendarMonth` | Month grid with availability and range selection | `picker` (renter dates), `vendor` (booked, blocked, partial), `mini` (2-week strip) | default, selecting range, disabled day | R3g, R12, R13, V3, V4, V10 |
| `RatingInput` / `RatingStars` | 5 stars, 48 dp each | input, display (16 dp) | none | R22, R13, R14 |
| `BookingCard` | Booking summary with status and next step | `upcoming`, `today` (dark, larger), `past` | none | R19, V1 |
| `RequestCard` | Vendor request with a countdown and inline accept | none | new, expiring (<30 min), expired | V1, V2 |
| `TaskRow` | Today's pickup or return with time and an action | `pickup`, `return`, `delivery` | upcoming, now, done, late | V1 |
| `ThinkingLines` | Honest step-by-step progress lines | none | running, done, slow (>8 s message) | R5, V7 |
| `EmptyState` | Illustration, title, one line, one action | `first-time`, `filtered`, `error` | none | R11, R19, V1, V5, V14, V18 |
| `Skeleton` | Placeholder blocks matching the final layout (`raised` with a 1.2 s shimmer, static under Reduce Motion) | `line`, `card`, `gear-grid`, `row` | none | All lists |
| `ErrorState` | Inline or full: what happened and what to do | inline, full | none | All data screens |
| `Snackbar` | Brief confirmation with an optional Undo | none | 4 s auto-dismiss | R6 swap, V3 block, V5 pause |
| `Banner` | Persistent notice in a page | `info`, `warning`, `success` | dismissible or not | V1 (approval), R6 (prices changed), R20 |
| `Avatar` | Initials or photo | 32 / 48 / 72 | verified ring | R14, R24, V2, V18 |
| `CodeInput` | 6 boxes with paste and autofill | none | typing, error (shake 220 ms), verifying | A3 |
| `ModeSwitch` | "Switch to renting out gear" card | renter→vendor, vendor→renter | none | R24, vendor Me |
| `ShareSheetPreview` | Preview of the WhatsApp message plus the link | none | none | R10 |
| `MarketRange` | "Similar gear in Lagos: ₦20k–₦28k", with your price as a marker | none | below, in range, above | V8 |

---

## 3. Screen specs

Shared rules (not repeated per screen):
- **Offline:** cached data shows with `OfflineBanner`. Actions that need the network are disabled with a reason ("Needs a connection") instead of failing after a tap.
- **Loading:** skeleton after 300 ms. A button's `loading` state replaces the label with a spinner and keeps the button's width.
- **Errors:** what happened plus what to do, never a code. Network errors always offer **Try again**.
- **Accessibility:** every screen has one `header`-role title. Icon buttons have labels. Focus moves to the title on screen change and to the sheet title when a sheet opens. Everything works at 200% font scale: footers stack their buttons vertically when the text overflows.
- **Single-choice questions** advance automatically 250 ms after a tap. **When TalkBack or VoiceOver is on, auto-advance is off** and a Continue button appears.

### 3.1 First run

#### A1 · Welcome
- **Type:** Full screen, no tabs. Lagoon background, light status bar.
- **Purpose:** Say what Deloo does in five seconds and start sign-up.
- **Layout:**
  1. Top: `deloo.` wordmark (heading, `onLagoon`, the full stop in marigold), `lg` top padding.
  2. Middle (vertically centred): the rotating word in `hero` marigold (Sound / Screens / Cameras / Lights / Power, 1.8 s each), then "for your event, sorted." in `hero` `onLagoon`, then `body` at 85% opacity.
  3. A small row of 3 trust facts in `caption`: "Checked owners · Deposit back after return · Help on WhatsApp".
  4. Footer: **Get started** (`accent`, full width) and the caption "Have gear to rent out? Start here too."
- **Actions:** Primary **Get started** → A2. No secondary.
- **Copy:** Headline "[Word] for your event, sorted." Body "Tell us about your event. We'll recommend the right setup and find it free on your date, from trusted owners across Lagos."
- **States:** Static, with no data needed. Offline: Get started still works and A2 shows the offline message.
- **Motion:** Words enter from below (FadeInDown 380 ms) and exit upwards. They stop under Reduce Motion.
- **A11y:** The rotating word is one label: "Sound, screens, cameras, lights and power for your event, sorted." Marigold on lagoon at 40 sp passes the large-text minimum (3:1).

```
+--------------------------------------+
| deloo.                               |
|                                      |
|                                      |
| Screens            <- marigold,      |
| for your event,       rotates        |
| sorted.                              |
|                                      |
| Tell us about your event. We'll      |
| recommend the right setup and find   |
| it free on your date.                |
|                                      |
| Checked owners . Deposit back .      |
| Help on WhatsApp                     |
|                                      |
| +----------------------------------+ |
| |           Get started            | |
| +----------------------------------+ |
|  Have gear to rent out? Start here   |
+--------------------------------------+
```

#### A2 · Email
- **Type:** Full screen (stack). For the demo only: it becomes **Phone** (`+234` prefix) before the pilot, with the same layout.
- **Purpose:** Get the address we send the code to.
- **Layout:** TopBar (back) → `ProgressSteps` (1 of 4) → kicker "Sign in or sign up" → title "What's your email?" → subtitle → `Field` (email keyboard, autofocus) → footer **Send code**.
- **Actions:** Primary **Send code**. Secondary: back.
- **Copy:** Subtitle "We'll send you a 6-digit code. No password to remember." Error "Enter an email like you@example.com".
- **States:** Sending (button loading). Rate-limited: "Wait 40 seconds, then try again." Offline: "You're offline. Connect to get your code."
- **Motion:** Keyboard-aware footer. No other motion.
- **A11y:** `autoComplete="email"`. The error is announced as an alert.

#### A3 · Code
- **Type:** Full screen (stack).
- **Purpose:** Verify the code with as little typing as possible.
- **Layout:** TopBar (back) → kicker "Check your email" → title "Enter your code" → "Sent to ada@… . It can take a minute." → `CodeInput` (6 boxes of 48×56 dp, `number`-style digits) → row: **Send a new code** (enabled after 45 s, showing the countdown) · **Change email**.
- **Actions:** Auto-submits at 6 digits. Footer **Continue** as a fallback.
- **Copy:** Error "That code didn't work. Check it, or send a new one."
- **States:** Verifying (boxes dim and a spinner shows in the footer). Error (shake 220 ms and the boxes clear). Phone OTP on Android: SMS Retriever fills the code with no permission needed.
- **A11y:** One text input underneath the 6 visual boxes (`oneTimeCode`), so screen readers hear one field.

#### A4 · Name & phone
- **Type:** Full screen (onboarding step).
- **Purpose:** What to call the user, and a number for event-day calls.
- **Layout:** Progress (2 of 4) → title "What should we call you?" → `Field` Your name → `Field` Phone (`+234` prefix, hint "For booking updates and on the day of your event.") → footer **Continue**.
- **Copy:** Errors: "Add your name." / "Add a phone number we can call or WhatsApp."
- **States:** Saving (on the device, then synced). Offline: the answers are kept and synced at A5/A6 finish.
- **Note:** When phone OTP replaces email, the phone field moves to A2 and A4 becomes name only.

#### A5 · What brings you here
- **Type:** Full screen (onboarding step).
- **Purpose:** Choose renter mode, vendor mode, or both.
- **Layout:** Progress (3 of 4) → title "What brings you here?" → two large `Tile`s with 64 dp illustrations, each about 132 dp tall → quiet link "I do both" → footer **Continue** (shown only for "both", or when a screen reader is on).
- **Actions:** Tap a tile: auto-advance (rent → R1; gear → A6). "I do both" → A6, then R1.
- **Copy:** "Plan an event: Tell us about it and we'll recommend the sound, screens and power you need." / "Rent out my gear: List your equipment and get bookings for the days it's free."
- **States:** Selected tile in `lagoonTint` with a lagoon border and a check.
- **Motion:** The selected tile scales to 0.98 and back (150 ms), then the screen pushes.
- **A11y:** The tiles are a radiogroup, and "I do both" is the third radio, not a loose link.

```
+--------------------------------------+
| < Back                  ====---  3/4 |
|                                      |
| What brings you here?                |
|                                      |
| +----------------------------------+ |
| |  [illus: stage+mic]              | |
| |  Plan an event              ( )  | |
| |  Tell us about it and we'll      | |
| |  recommend sound, screens, power | |
| +----------------------------------+ |
| +----------------------------------+ |
| |  [illus: speaker+tag]            | |
| |  Rent out my gear           ( )  | |
| |  List your equipment and get     | |
| |  bookings for free days          | |
| +----------------------------------+ |
|                                      |
|  I do both                           |
+--------------------------------------+
```

#### A6 · Vendor details
- **Type:** Full screen (onboarding step, scrolls).
- **Purpose:** The minimum vendor profile needed to start listing.
- **Layout:** Progress (4 of 4) → title "Who's renting it out?" → `Field` "Name renters will see" → 3 `Tile`s with icons (Rental company / Church or ministry / Individual owner) → label "Areas you serve (optional)" → `ChipGroup` wrap (Lagos areas; the first 8, then "Show all 19") → `Tile multi` "We send a technician" → caption "Deloo checks every owner before their gear goes live. We'll call you about it." → footer **Finish**.
- **States:** Finishing (loading). Error: "Setup didn't finish. Check your connection and try again." Offline: Finish is disabled with "Needs a connection".
- **Next:** gear → V1 (with V17 banner); both → R1, with vendor mode available in Me.

### 3.2 Renter: Plan

#### R1 · Plan home
- **Type:** Tab root (Plan).
- **Purpose:** Start or resume an event plan in one tap, by voice or text.
- **Layout:**
  1. Header: kicker "Hi Ada" (label, lagoon) and title "What's the event?"
  2. **Start card** (lagoon, radius `xl`, padding `xl`): heading "Tell us about it the way you'd tell a friend." → white input (multiline, 72–160 dp) with a `VoiceButton hero` (56 dp marigold) on its right → 3 example pills (tap fills the input).
  3. When text is entered: a primary **Size my setup** appears under the input inside the card (`onLagoon` button style: surface fill, lagoon text).
  4. **Or answer a few questions** as a `secondary` full-width button with a chevron → R3a.
  5. **Your plans** (only if any): up to 3 `Card` rows such as "Wedding · Sat 14 Dec · 6 of 9 answered", plus **See all**.
  6. **Browse by category:** an icon `ChipGroup rail` (Sound, Screens, Cameras, Lights, Power) → R11 filtered.
  7. **Coming soon** row card → R29.
- **Actions:** Primary: mic, or **Size my setup**. Secondary: question flow, resume a plan, a category.
- **Copy:** Examples: "Outdoor crusade, 2,000 people, livestream" · "Wedding reception for 300 in a hall" · "Youth conference, 500, band and projector".
- **States:** First time: no plans section. Loading plans: 2 skeleton rows. Offline: input and questions work; sizing runs on the device (rules live in `packages/core`) and availability is checked later. No speech recognition on the device: the mic is hidden and the input placeholder says "Type it here".
- **Motion:** Mic press → R2 sheet rises (300 ms spring). The examples fill the input with a 150 ms fade.
- **A11y:** Mic label "Describe your event by voice". The input label is "Describe your event".

```
+--------------------------------------+
| Hi Ada                               |
| What's the event?                    |
| +----------------------------------+ |
| | Tell us about it the way you'd   | |
| | tell a friend.          (lagoon) | |
| | +----------------------+ +----+  | |
| | | Outdoor crusade,     | |MIC |  | |
| | | about 2,000 people.. | +----+  | |
| | +----------------------+marigold | |
| | ( Wedding for 300 in a hall )    | |
| | ( Youth conference, 500, band )  | |
| +----------------------------------+ |
| +----------------------------------+ |
| | Or answer a few questions      > | |
| +----------------------------------+ |
| Your plans                   See all |
| | Wedding . Sat 14 Dec . 6 of 9  > | |
| Browse  [Sound][Screens][Cameras]..  |
|--------------------------------------|
|  Plan    Explore   Bookings    Me    |
+--------------------------------------+
```

#### R2 · Voice listening sheet
- **Type:** Bottom sheet (half height, cannot be dragged closed while listening).
- **Purpose:** Capture a spoken description and show what was heard.
- **Layout:** Handle → "Listening…" (title) → live transcript (body, ink; unconfirmed words in slate) → `Waveform` (centred, 64 dp tall, lagoon) → footer pair: **Cancel** (quiet) · **Done** (primary).
- **After Done:** the sheet becomes "Here's what I heard": parsed answer chips (Crusade · Outdoors · 2,000 people · Livestream) → **Looks right** (→ R4 if anything is missing, else R5) · **Try again**.
- **States:** Permission not asked: an inline primer first ("Deloo uses your mic only while this sheet is open"). Permission denied: "Mic is off for Deloo. Type instead, or turn it on in Settings", with **Open settings**. Silence for 6 s: "Didn't catch that. Tap the mic and try again." Offline: on-device recognition still works; parsing waits ("We'll read this when you're back online") or falls back to the questions.
- **Motion:** Waveform bars follow the mic level (30 fps, no physics). Under Reduce Motion they become a static "recording" dot that pulses its opacity once a second.
- **A11y:** Announce "Listening" when it starts and "Stopped" when it ends. Done is reachable while listening.

#### R3 · Question flow (shell for R3a–R3i)
- **Type:** Full-screen stack. Each question is its own route so system back steps back one question.
- **Shared layout:** `TopBar progress` (back, a segmented bar with 9 segments, "Skip" quiet on the right for optional questions) → `QuestionCard`: title (`title` 28), helper (`body` slate) → answer area → "Say it instead" `VoiceButton chip` (bottom left) → footer **Continue** only for multi-select or input questions.
- **Shared states:** Answers save on every change, so a plan can be resumed from R1. Questions already answered (from voice) are skipped with a summary toast "Got the crowd size from what you said". Offline is fine.
- **Motion:** Next question slides in horizontally (300 ms, 24 dp offset plus fade, not a full-width slide, which is cheaper). Back reverses it.

##### R3a · Event type
- **Answer area:** 2-column grid of illustrated `Tile`s (square, `lg` gap): Church service · Crusade or outdoor service · Wedding · Conference · Concert · Party or launch, then full-width "Something else" (opens a one-line field).
- **Copy:** Title "What kind of event is it?" Helper "This tells us the basics, like how many mics a wedding needs."
- **A11y:** The grid reads in row order, as a radiogroup labelled with the title.

```
+--------------------------------------+
| <   [==|  |  |  |  |  |  |  |  ]     |
|                                      |
| What kind of event is it?            |
| This tells us the basics, like how   |
| many mics a wedding needs.           |
|                                      |
| +---------------+ +---------------+  |
| | [illus]       | | [illus]       |  |
| | Church        | | Crusade or    |  |
| | service       | | outdoor svc   |  |
| +---------------+ +---------------+  |
| +---------------+ +---------------+  |
| | Wedding       | | Conference    |  |
| +---------------+ +---------------+  |
| +---------------+ +---------------+  |
| | Concert       | | Party/launch  |  |
| +---------------+ +---------------+  |
| +----------------------------------+ |
| | Something else                   | |
| +----------------------------------+ |
| (mic) Say it instead                 |
+--------------------------------------+
```

##### R3b · Venue
- **Answer area:** 3 stacked `Tile`s with illustrations: "Indoors" · "Outdoors, covered (tent or canopy)" · "Outdoors, open air". If Indoors: an inline follow-up slides in under it, "How big is the room?", as chips: Small room · Hall · Auditorium · "I know the length" (opens a metres stepper).
- **Copy:** Title "Where's it happening?" Helper "Outdoors needs more power and a screen you can see in daylight."
- **Note:** Choosing indoors disables auto-advance until the room size is picked.

##### R3c · Crowd size
- **Answer area:** `CrowdSlider`: the number in `hero` ("2,000 people", tap to type an exact figure) → a crowd illustration (a grid of up to 60 dot-figures that fill from the front rows) → slider (48 dp thumb, track with band ticks: 100 · 300 · 1,000 · 3,000 · 5,000+, log scale, snaps to 50 under 1,000 and to 250 above) → band label ("Large crowd: 1,000–3,000").
- **Copy:** Title "How many people are you expecting?" Helper "Not sure? Pick the closest. We add a little room for extra people."
- **Footer:** **Continue** (a slider has no tap-to-advance).
- **Motion:** Figures fade in as the value rises (each 120 ms, staggered). Haptic `selection` at each band boundary. Under Reduce Motion the fill is immediate.
- **A11y:** The slider uses `accessibilityRole="adjustable"`. Volume-key style swipes move it by one band, and its value reads "2,000 people, large crowd".

```
+--------------------------------------+
| <   [==|==|==|  |  |  |  |  |  ]     |
|                                      |
| How many people are you expecting?   |
| Not sure? Pick the closest. We add   |
| a little room for extra people.      |
|                                      |
|           2,000 people               |
|         (tap to type exact)          |
|                                      |
|   o o o o o o o o o o o o            |
|   o o o o o o o o o o o o   crowd    |
|   o o o o o o o . . . . .   fills    |
|                                      |
|  |----|-----|------(O)----|-----|    |
|  100  300  1,000       3,000  5,000+ |
|      Large crowd: 1,000-3,000        |
|                                      |
| (mic) Say it instead                 |
| +----------------------------------+ |
| |            Continue              | |
| +----------------------------------+ |
+--------------------------------------+
```

##### R3d · On stage
- **Answer area:** Multi-select `Tile`s with icons: Speakers or MC · Band · Choir · DJ · Panel discussion · Drama or dance. Each selected tile shows a mini `Stepper` for count where it matters (speakers 1–10, panel seats 2–8).
- **Copy:** Title "Who's on stage?" Helper "Pick all that apply. We'll count the mics for you."
- **Footer:** **Continue** (disabled until 1 is picked) and Skip in the top bar.

##### R3e · Livestream
- **Answer area:** `Tile`s: "No, just the people in the room" · "Record it" · "Livestream it". Livestream reveals platform chips (YouTube · Facebook · Instagram · Other) and "Is there internet at the venue?" (Yes · No · Not sure → we add a streaming kit with data).
- **Copy:** Title "Will you stream or record it?"

##### R3f · Power
- **Answer area:** `Tile`s: "Grid power" · "We have a generator" · "No power at the venue". Generator reveals "How big is it?" chips (Not sure · Under 10 kVA · 10–30 kVA · Over 30 kVA). An info `Card` (lagoonTint) is always shown: "We'll add a surge protector either way. Power cuts and surges are the top cause of damaged gear."
- **Copy:** Title "How will you power it?"

##### R3g · Date & time
- **Answer area:** Rows (`ListRow value`, 56 dp): Date (→ Material date picker, past dates disabled) · Starts · Ends · "Setup from" (suggested chips: 2 hours before · Night before · I'll choose) → `Tile multi` "It runs for more than one day" (reveals an end date).
- **Copy:** Title "When is it?" Helper "We check what's free on your date." Warning if within 24 h (marigold Banner): "Short notice. Fewer owners can deliver by then."
- **Footer:** **Continue** (needs a date and a start time).

##### R3h · Area
- **Answer area:** `Field` search "Search an area" → **Use my location** (`secondary`, with a location icon; asks for permission only on tap) → `ChipGroup wrap` of Lagos areas (single) → optional `Field` "Venue name (optional)".
- **Copy:** Title "Where in Lagos?" Helper "Closer owners mean cheaper delivery."
- **States:** Location denied: the chip list stays, with no nagging. Location outside Lagos: "We're only in Lagos for now. Pick the closest area, or join the waitlist" (→ R29).

##### R3i · Budget
- **Answer area:** `Tile`s: "Show me options" (preselected, "We'll show Good, Better and Best") · "Keep it lean" · "Middle of the road" · "Best it can be". No naira bands here (we can't promise prices before sizing).
- **Copy:** Title "How do you want to spend?" Helper "You can switch between options on the next screen."
- **Next:** → R5.

#### R4 · Missing details
- **Type:** Full screen (after voice or text intake).
- **Purpose:** Confirm what we understood and fill only the gaps.
- **Layout:** Title "Here's what we got" → `Card` listing each answer as a `ListRow value` (tap to edit → that R3 question as a sheet) → missing rows marked with a marigold dot and **Add** ("Date · Add") → footer **Size my setup** (disabled until the date and crowd size are set; caption "Need the date and crowd size").
- **Copy:** Subtitle "Just 2 more things and we'll size your setup."
- **States:** Parse failed: "We couldn't read that one. Answer a few quick questions instead." → R3a with the text kept.

#### R5 · Sizing (thinking)
- **Type:** Full screen, no back (it cancels if back is pressed).
- **Purpose:** An honest progress state while rules run and availability is fetched.
- **Layout:** A centred small illustration (stage outline) → `ThinkingLines`, each line ticking in turn: "Sizing sound for 2,000 people outdoors" → "Working out power: 18 kVA with headroom" → "Checking what's free on Sat 14 Dec" → "Pricing from 6 owners near Ikeja".
- **Timing:** Minimum 900 ms on screen. Lines tick as the real steps finish. Slow (>8 s): "Taking longer than usual. Weak signal?" with **Show setup without availability**. Offline: the first two lines complete and the third shows "Offline: we'll check availability when you're back" → R6 with `unchecked` chips.
- **A11y:** Each completed line is announced politely, not as an alert.

#### R6 · Your setup (Good / Better / Best)
- **Type:** Full screen (stack). The top bar has back, **Edit answers** and a share icon.
- **Purpose:** The recommendation: what to rent, why, what it costs, and whether it's free.
- **Layout:**
  1. Event summary as a single line of chips ("Crusade · Outdoors · 2,000 · Sat 14 Dec · Ikeja"); tap → R4.
  2. `TierSegmentedControl` (48 dp, full width): Good / Better / Best, each with its total in caption. The recommended tier has a small marigold dot and "Our pick".
  3. `MoneyHero`: total `number` ("₦485,000") with the caption "1 day · includes ₦38,000 Deloo Protection" and a second line "+ ₦150,000 deposit, back within 48 hours of return".
  4. Price-change `Banner` (only if prices moved since a saved plan).
  5. Grouped sections with `heading`: Sound · Screens · Cameras & stream · Power. Each holds `SetupLineItem`s separated by `md`.
  6. `UnmetCard` inline where a line can't be filled (R9).
  7. Add-ons card: "Add a technician" switch (locked on with "Needed for LED walls" when tier 3) and "Delivery and setup" switch, each with its price.
  8. Footer `ActionBar pair`: **Share** (secondary, WhatsApp icon) and **Book this setup** (primary).
- **Copy:** Header title "Your setup". Why example: "For 2,000 people outdoors you need 4 speakers on stands, or the back rows won't hear."
- **States:** Loading tier switch: line prices show skeletons and the hero shows the last value at 50% opacity. All unavailable for the date → R9 full. Offline: `unchecked` chips, and Book is disabled with "Needs a connection to check availability".
- **Motion:** Tier switch: the hero number counts to the new value (220 ms) and lines crossfade. Line expand (R7) is a 220 ms height animation. Swap → R8 sheet.
- **A11y:** The segmented control is a tablist. Each line item reads as "4 × JBL VRX932 speaker, ₦120,000, available. Buttons: Why, Swap".

```
+--------------------------------------+
| <  Your setup         Edit  [share]  |
| (Crusade)(Outdoors)(2,000)(Sat 14..) |
| +----------------------------------+ |
| |  Good  | *Better* |    Best      | |
| | 312k   |  485k    |    690k      | |
| +----------------------------------+ |
| ₦485,000                             |
| 1 day . incl. ₦38,000 Protection     |
| + ₦150,000 deposit, back in 48h      |
|                                      |
| Sound                                |
| +----------------------------------+ |
| |[img] 4 x JBL VRX932      ₦120,000| |
| |      * Available                 | |
| |      Why?              Swap      | |
| +----------------------------------+ |
| |[img] 1 x Mixer 16-ch      ₦35,000| |
| |      * 1 left                    | |
| +----------------------------------+ |
| Screens                              |
| | ! No 16ft outdoor LED free 14 Dec| |
| |   See options >                  | |
|--------------------------------------|
| [ Share ]  [    Book this setup    ] |
+--------------------------------------+
```

#### R7 · Why? expanded
- **Type:** Inline expansion inside `SetupLineItem` (not a route). The research flows refer to it as a state of R6.
- **Purpose:** The plain-language reason, so the renter trusts the quantity and can defend it to their pastor or client.
- **Content:** The reason sentence (body) → "How we worked it out" in caption slate ("About 1 speaker per 500 people outdoors, doubled for open air") → 2 `SpecFigure`s (1,300 W · 15") → vendor line ("From Sound City · Ikeja · 4.8") → **See item** (→ R13).
- **A11y:** The Why button has `accessibilityState.expanded`.

#### R8 · Swap sheet
- **Type:** Bottom sheet (90% height).
- **Purpose:** Choose an alternative for one line, in the PRD §4.3 order.
- **Layout:** Title "Swap speakers" → current item pinned (`GearCard row`, "Current") → sections in this order, each with a caption header: "Same item, another owner" · "Similar gear" · "A different way" · "Another date" → `AlternativeRow`s (radio, thumbnail, name, price change "+₦12,000" / "−₦8,000" in ink, a trade-off line in slate, `AvailabilityChip`) → footer **Use this** (disabled until a change is chosen).
- **Copy:** Trade-off example: "Projector instead: cheaper, but not bright enough outdoors in daylight."
- **States:** Loading: 3 skeleton rows. No alternatives: an `EmptyState` with "We've noted it. Our team will look for one", plus **Remove from setup**.
- **Motion:** On Use this, the sheet closes, the line updates with a lagoonTint flash (220 ms), and a `Snackbar` shows "Swapped. Undo".

```
+--------------------------------------+
|                ----                  |
| Swap speakers                        |
| Current                              |
| |[img] 4 x JBL VRX932   ₦120,000   | |
|                                      |
| SAME ITEM, ANOTHER OWNER             |
| ( ) [img] JBL VRX932 . Lekki         |
|     +₦6,000 . further away           |
|     * Available                      |
| SIMILAR GEAR                         |
| (o) [img] 6 x EV ETX-12P             |
|     -₦8,000 . same coverage, more    |
|     boxes to set up    * Available   |
| A DIFFERENT WAY                      |
| ( ) [img] Line array (hire + tech)   |
|     +₦90,000 . clearer at the back   |
|                                      |
| +----------------------------------+ |
| |            Use this              | |
| +----------------------------------+ |
+--------------------------------------+
```

#### R9 · Nothing available
- **Type:** An inline `UnmetCard` in R6 (one line), or a full screen when the whole setup can't be filled.
- **Purpose:** Say plainly what we don't have, record it, and offer plan B.
- **Layout (full):** Illustration (empty stage) → title "We can't fill this one yet" → body "We don't have a 16 ft outdoor LED wall free on 10 Oct. We've noted it, and here are your options." → option cards: "Try a nearby date" (shows the 3 nearest free dates as chips) · "Use a projector and screen indoors" · "Get a call from our team" (→ WhatsApp support with the plan attached) → quiet "Start over".
- **Copy rule:** Never "Oops" or "Sorry for the inconvenience". Say what, when, and what next.
- **A11y:** The title is announced. Options are buttons, not links.

#### R10 · Share to WhatsApp
- **Type:** Bottom sheet (content height), then the system share sheet.
- **Purpose:** Send the setup to whoever approves the spend (pastor, client, committee).
- **Layout:** Title "Share your setup" → `ShareSheetPreview`: a WhatsApp-style bubble showing the message text ("Setup for Crusade, Sat 14 Dec: 4 speakers, mixer, 12ft LED wall, 20kVA generator. ₦485,000 + ₦150,000 refundable deposit. See it: deloo.space/s/7Hk2") → footer stack: **Send on WhatsApp** (primary, opens WhatsApp directly if installed) · **Other apps** (secondary) · **Copy link** (quiet; Snackbar "Link copied").
- **States:** WhatsApp not installed: the primary becomes **Share**. Offline: the link is generated when back online, with "We'll share as soon as you're online".
- **Note:** Text plus link only; no image card, to save the recipient's data. The link opens on deloo.space and works without the app.

### 3.3 Renter: Explore

#### R11 · Explore
- **Type:** Tab root (Explore).
- **Purpose:** Browse gear by category when the renter already knows what they want.
- **Layout:** Large title "Explore" → search `Field` (search icon, 48 dp) → category `ChipGroup rail` with icons (All · Speakers · Mics · Mixers · LED walls · Projectors · Cameras · Streaming · Lights · Generators · Surge protection) → filter row: date pill ("Any date ▾" → date sheet) and **Filters** with a count badge (→ R12) → 2-column `GearCard grid` (`md` gap): photo 4:3, name (2 lines max), "₦25,000/day" bodyStrong, vendor area caption, `AvailabilityChip` when a date is set → at the end, a "Coming soon: studios, crew, ad space" card → R29.
- **States:** Loading: 6 skeleton cards. No results: `EmptyState filtered`: "Nothing matches those filters" with **Clear filters**. Offline: cached grid plus banner; search filters locally. Error: `ErrorState` with **Try again**.
- **Motion:** Card → R13 shared-element photo transition (300 ms). Chips scroll into view when selected.
- **A11y:** Each card reads as "JBL EON715 speaker, ₦25,000 a day, Ikeja, available".

#### R12 · Filters sheet
- **Type:** Bottom sheet (90%).
- **Layout:** Title "Filters" with **Clear** (quiet, right) → Dates (`CalendarMonth picker`, compact) → Area (`ChipGroup`) → `ListRow switch` "Delivery available" · "Technician included" · "Verified owners only" → Price per day (two `Field`s, ₦ prefix, min and max) → Sort (radio: Best match · Lowest price · Closest) → footer **Show 48 items** (the count updates live, debounced 300 ms).
- **States:** Count loading: the button shows "Show items" plus a spinner. Zero: "No items. Try fewer filters" (disabled).

#### R13 · Item detail
- **Type:** Full screen (stack). The top bar is transparent over the photo and turns solid on scroll.
- **Purpose:** Decide whether this exact item fits, and add it to a plan.
- **Layout:**
  1. `PhotoCarousel` 4:3, full bleed, with a "1/5" count. Top bar: back, share, and a save (heart) icon.
  2. Name (`title`), category · vendor area (caption slate).
  3. Price row: "₦25,000" (`number`) "/day" and the deposit caption "₦40,000 deposit, refundable".
  4. `SpecFigure` row (2–3): "1,300 W · 15" · 126 dB".
  5. **Availability:** `CalendarMonth mini` (2 weeks: green dot free, red dot booked, marigold "1 left") → "See full calendar".
  6. "What's included" (bulleted: stand, power cable, cover).
  7. `VendorCard compact` → R14.
  8. Protection line: shield icon + "Covered by Deloo Protection up to ₦500,000. Learn how".
  9. Verification line for tier 2 and 3: "Needs ID check before booking" with a lock icon.
  10. Reviews: average plus 2 recent, then **See all**.
  11. Footer `ActionBar price`: "₦25,000/day" on the left · **Add to plan** (primary). If no plan is active: **Check dates & book**.
- **States:** Loading: the photo blurhash shows immediately, text as skeleton. Unavailable on the chosen date: a red Banner under the price with the "Next free: Tue 17 Dec" chip. Offline: cached details; availability shows "Last checked 2h ago". Removed item: an `EmptyState` with "This item isn't listed any more" and **See similar**.
- **Motion:** Shared-element photo from R11/R6. Carousel swipe with snap.
- **A11y:** The carousel is adjustable ("Photo 1 of 5"). The calendar dots have text equivalents ("Saturday 14, free").

```
+--------------------------------------+
| <                       [share] [<3] |
| +----------------------------------+ |
| |                                  | |
| |          [ gear photo ]          | |
| |                            1/5   | |
| +----------------------------------+ |
| JBL EON715 speaker                   |
| Speaker . Ikeja                      |
| ₦25,000 /day                         |
| ₦40,000 deposit, refundable          |
|  1,300 W  |   15"    |  126 dB       |
|  power    |  driver  |  max SPL      |
| Availability                         |
| M T W T F S S  M T W T F S S         |
| . . . . x . .  . o . . . . .         |
| (Sound City . Verified . 4.8 . 63) > |
| [shield] Covered up to ₦500,000      |
|--------------------------------------|
| ₦25,000/day     [   Add to plan   ]  |
+--------------------------------------+
```

#### R14 · Vendor profile
- **Type:** Full screen (stack).
- **Layout:** `Avatar 72` + name (`title`) + `Badge verified` "Checked by Deloo" + type ("Church or ministry") → stats row (`SpecFigure` small): rating 4.8 · 63 bookings · "Usually replies in 1 hour" → areas served (chips, display only) → "Delivers and sets up" / "Sends a technician" info rows → their gear (`GearCard grid`) → reviews.
- **States:** Not approved vendors are never shown. Loading skeleton. Offline cached.
- **Note:** No direct chat with the vendor in v1; questions go to Deloo on WhatsApp (R28), which keeps payments on the platform.

### 3.4 Renter: Book and pay

#### R15 · Review booking sheet
- **Type:** Full-height sheet (from R6 or R13).
- **Purpose:** One last check of what, when, where and how much, before money.
- **Layout:**
  1. Title "Check your booking", with `HoldTimer` appearing once the hold is placed ("Held for you · 29:41").
  2. Per vendor (one booking each), a `Card`: vendor line, then compact `SetupLineItem`s (qty `Stepper` inline).
  3. When: "Sat 14 Dec · setup from 7am · ends 9pm" → edit.
  4. Getting it there: segmented "Delivery and setup" / "I'll pick up". Delivery shows the address `Field` with "Use my location".
  5. Technician `ListRow switch` (locked on for tier 3).
  6. Protection: a one-line card, "Deloo Protection covers accidental damage above your deposit, up to ₦500,000. Theft isn't covered." with "How it works".
  7. `PriceSummary review`: rental, Protection, delivery, technician, **total today**, then the deposit on its own line ("Deposit, refundable: ₦150,000").
  8. Footer: **Continue to pay** (primary). Caption: "We'll hold this gear for 30 minutes while you pay."
- **States:** Holding (button loading, "Holding your gear…"). Hold failed because someone got it first: a red Banner on that line, "Someone just booked the last one. Swap or remove it", with **Swap** → R8. Verification needed → R16 before R17. Offline: Continue is disabled with "Needs a connection".
- **A11y:** The hold timer announces at 5 minutes and 1 minute left, not every second.

```
+--------------------------------------+
|                ----                  |
| Check your booking   Held . 29:41    |
| +----------------------------------+ |
| | Sound City . Ikeja . Verified    | |
| | 4 x JBL VRX932    [-] 4 [+]  120k| |
| | 1 x Mixer 16-ch   [-] 1 [+]   35k| |
| +----------------------------------+ |
| When   Sat 14 Dec, 7am-9pm     Edit  |
| [ Delivery & setup | I'll pick up ]  |
| Address  12 Allen Ave, Ikeja         |
| Technician                     [on]  |
| [shield] Protection covers damage    |
|   above your deposit, to ₦500,000    |
| Rental                     ₦447,000  |
| Deloo Protection            ₦38,000  |
| Delivery and setup          ₦20,000  |
| Total today                ₦505,000  |
| Deposit, refundable        ₦150,000  |
| +----------------------------------+ |
| |        Continue to pay           | |
| +----------------------------------+ |
+--------------------------------------+
```

#### R16 · Verify identity gate
- **Type:** Bottom sheet (content height), shown only when the booked gear's tier is above the user's.
- **Purpose:** Explain why the check is needed and how short it is, then hand off to the provider SDK.
- **Layout:** Shield illustration → title "To rent LED walls, verify your identity" → body "It takes about 2 minutes. You'll need your NIN and a quick selfie." → `TrustLadder compact` ("Small gear ✓ · Sound systems ✓ · LED walls 🔒" drawn as icons, not emoji) → privacy line (caption): "We keep the result, not your NIN." → footer **Verify now** (primary) · **Choose gear that doesn't need it** (quiet → R6 with tier-3 lines marked).
- **States:** Provider pending: "Checking… usually under 5 minutes. We'll notify you." The hold is kept for up to 30 minutes. Failed: "We couldn't confirm it. Try again in good light, or chat with us" with **Try again** and **WhatsApp us**. Offline: Verify is disabled.

#### R17 · Pay
- **Type:** Full screen (stack).
- **Purpose:** Show exactly what is charged and what is held, then pick a method.
- **Layout:** TopBar "Pay" with `HoldTimer` → `DepositCard`s stacked: "Rental and fees: ₦505,000, paid to Deloo, sent to the owner after return", and "Deposit: ₦150,000, back within 48 hours after a clean return" (with its progress bar empty: Held → Returned → Refunded) → "Pay with" radio list: saved card (•••• 4421) · Bank transfer · USSD · Add a card → caption "Payments by Paystack. Deloo never sees your card number." → footer `SlideToConfirm` "Slide to pay ₦655,000" (this is R18's control).
- **States:** Hold expired: a full-screen interruption "Your hold ran out", with **Hold again** (rechecks availability). Payment failed: an inline red Banner with the reason in plain words ("Your bank declined it. Try another card or bank transfer").

#### R18 · Slide to confirm + success
- **Type:** Footer control on R17, then a full-screen success (replaces the stack, so back goes to R19, not to payment).
- **Purpose:** Prevent accidental payment, then reassure and set expectations.
- **Slide:** 64 dp track (radius pill, `lagoonTint`), 56 dp thumb (lagoon, arrow icon) and the label "Slide to pay ₦655,000" (the label fades as the thumb moves). Completion at 85% of the track; release short and it springs back (300 ms). At completion: `impactMedium`, the thumb becomes a spinner, and Paystack runs (bank transfer and USSD open their own sheet).
- **Success layout:** Large check in a green circle (scale-in 300 ms) → title "Booked and paid" → body "Sound City has 2 hours to accept. If they don't, you get all your money back." → mini `CheckpointTracker` (Paid ✓ → Owner accepts → Packed → Delivered) → footer **Track booking** (primary → R20) · **Share with your team** (secondary → R10 for the booking).
- **A11y:** The slider has an accessible alternative. With a screen reader on, it becomes a normal button "Pay ₦655,000" behind a confirm dialog ("Pay ₦655,000 now?").

```
+--------------------------------------+
|              ( check )               |
|                                      |
|           Booked and paid            |
|                                      |
|  Sound City has 2 hours to accept.   |
|  If they don't, you get all your     |
|  money back.                         |
|                                      |
|  (*)----( )----( )----( )            |
|  Paid  Accept Packed Delivered       |
|                                      |
| +----------------------------------+ |
| |         Track booking            | |
| +----------------------------------+ |
| +----------------------------------+ |
| |      Share with your team        | |
| +----------------------------------+ |
+--------------------------------------+

 Before: footer on R17
| +----------------------------------+ |
| |(=>)   Slide to pay ₦655,000      | |
| +----------------------------------+ |
```

### 3.5 Renter: Bookings and handover

#### R19 · Bookings list
- **Type:** Tab root (Bookings).
- **Layout:** Large title "Bookings" → segmented "Upcoming · Past" → a "Today" `BookingCard today` pinned at the top when an event is today (dark, larger, current step plus its action) → `BookingCard`s: event name, date, vendor(s), `CheckpointTracker mini`, next step line ("Pickup checklist at 7am").
- **States:** Empty upcoming: `EmptyState` with an illustration, "No bookings yet", "Plan your event and we'll find the gear" and **Plan an event** (→ R1). Loading skeletons. Offline: cached, with "Last updated 10:42".

#### R20 · Booking tracker
- **Type:** Full screen (stack), **always dark**.
- **Purpose:** One place for the whole booking, from paid to deposit back, like a Chowdeck order.
- **Layout:**
  1. TopBar: back, event name, overflow (Cancel booking, Get help).
  2. Header: "Sat 14 Dec · Ikeja" and the current status in `heading` ("On the way · arriving about 8:10").
  3. **Current step card** (surface, lagoon edge): what's happening plus the one action for now ("Start pickup checklist" → R21 / "Confirm setup is working" / "Rate Sound City" → R22).
  4. `CheckpointTracker full`: Paid → Owner accepted → Packed → On the way → Set up → Event → Collected → Deposit refunded, each with a time or an "expected" time in faint italics.
  5. `VendorCard` with **Call** and **WhatsApp** icon buttons (48 dp).
  6. Items (collapsed list).
  7. `DepositCard deposit` (progress from held to refunded).
  8. Help row → R28 with the booking attached.
- **States:** Vendor cancelled: red Banner "Sound City cancelled. We're finding you a replacement" (rescue guarantee; proposed R32). Claim raised: marigold Banner → R23. Offline: last known state plus banner; the checklist still works offline.
- **Motion:** When a step completes, its dot fills and the line grows (220 ms), with one pulse on the new current step. An ongoing Android notification on event day mirrors the current step.
- **A11y:** The tracker is a list. Each step reads "Packed, done at 7:40" or "On the way, current step".

```
+--------------------------------------+
| <  Youth Crusade               ...   |   dark
| Sat 14 Dec . Ikeja                   |
| On the way . arriving ~8:10          |
| +----------------------------------+ |
| | Next: check the gear when it     | |
| | arrives. Photos protect you.     | |
| | [   Start pickup checklist   ]   | |
| +----------------------------------+ |
|  (*) Paid                    Mon 9:14|
|   |                                  |
|  (*) Owner accepted         Mon 10:02|
|   |                                  |
|  (*) Packed                   Sat 7:40|
|   |                                  |
|  (@) On the way               now    |
|   :                                  |
|  ( ) Set up              ~ 9:00      |
|  ( ) Event              10:00-21:00  |
|  ( ) Collected                       |
|  ( ) Deposit refunded                |
| (Sound City . Verified)  [call][wa]  |
+--------------------------------------+
```

#### R21 · Handover checklist (renter, guided camera)
- **Type:** Full-screen flow (stack of steps), always dark, works fully offline.
- **Purpose:** Evidence of condition at pickup and return, so nobody argues later.
- **Flow:**
  1. **Units list:** title "Check each item" with `ProgressSteps` ("2 of 6 items done") and unit rows (thumbnail, name, serial, a tick when done).
  2. **Camera** (`GuidedCameraFrame`): full-bleed preview; a translucent outline of the shot (front, back, serial plate, accessories); the instruction at the top in `heading` ("Front of the speaker. Fit it in the outline"); `ShotStrip` at the bottom (4 thumbnails); 72 dp shutter centred; torch toggle. After capture, the on-device quality check runs in under 300 ms: "Too dark. Turn on the torch" / "Blurry. Hold still and try again" (marigold pill) or accepted (green tick, auto-advances to the next shot).
  3. **Serial:** read from the serial-plate shot and shown as editable text: "Is this the serial? JBL-EON-77812" with **Yes** / **Edit**.
  4. **Checks:** `YesNo` cards: "Everything works?" · "All accessories here? (2 cables, 1 cover)" · "Surge protector connected?" · "Covered from rain?" (outdoor only). A "No" opens a notes field plus "Add a photo".
  5. **Summary:** grid of shots per unit plus notes → `SlideToConfirm` "Slide to confirm pickup". The other side confirms on their phone; the status shows "Waiting for Sound City to confirm".
- **States:** Offline: `UploadQueueChip` "3 photos waiting to upload" (top right) and confirmation is saved locally with the time and GPS. Camera permission denied: primer → Settings. Storage low: "Your phone is almost full. We'll keep photos small" (they are always compressed to ≤ 250 KB).
- **A11y:** Instructions are announced on each shot. The shutter is labelled "Take photo of the front". The quality result is announced.

```
+--------------------------------------+
| x  Speaker 2 of 6        [3 waiting] |   dark camera
| Front of the speaker.                |
| Fit it in the outline.               |
|  ..................................  |
|  :          +----------+          :  |
|  :          |          |          :  |
|  :          |  speaker |          :  |
|  :          | outline  |          :  |
|  :          |          |          :  |
|  :          +----------+          :  |
|  :..................................:|
|        ( Too dark. Turn on torch )   |
|  [front][back ][serial][acces]       |
|   now                                |
|   [torch]       ( O )       [skip]   |
+--------------------------------------+
```

#### R22 · Rate vendor
- **Type:** Bottom sheet, offered after "Deposit refunded" (and from R20).
- **Layout:** Title "How was Sound City?" → `RatingInput` (5 × 48 dp stars) → after a rating, tag chips (positive set for 4–5: "On time · Gear as described · Helpful technician · Easy return"; problem set for 1–3: "Late · Gear faulty · Missing items · Rude") → optional `Field` "Anything else?" → footer **Send**.
- **States:** Offline: queued, with "We'll send it when you're online".

#### R23 · Damage claim / dispute (renter)
- **Type:** Full screen (stack), from R20 or a notification.
- **Purpose:** See what the owner claims, compare the evidence, and accept or dispute fairly.
- **Layout:** Title "Sound City reported damage" → amount `MoneyHero compact` ("₦45,000 from your deposit") → `PhotoCarousel evidence`: pickup and return photos side by side for the same shot, with time stamps → owner's note → "What happens next" (3 numbered steps: you respond within 48 h → Deloo reviews both sides → we decide within 5 working days) → footer pair **Dispute** (secondary) · **Accept** (primary). Dispute opens a sheet: reason chips + note + "Add photos" → **Send to Deloo**.
- **Also:** The renter can start a report from R20 ("Something wrong with the gear?") using the same layout without the amount.
- **States:** Decided: an outcome banner with the amount taken from the deposit, from Protection, or nothing.

### 3.6 Renter: Me

#### R24 · Me
- **Type:** Tab root (Me). Shared with vendor mode (vendor tab "Me"), with vendor rows added.
- **Layout:** `Avatar 72` + name + phone → `TrustLadder compact` card ("Verified for small gear. Unlock sound systems") → R25 → `ModeSwitch` card ("Rent out your gear: Switch to vendor mode") → `ListRow nav` group: Payment methods (R26) · Verification (R25) · Notifications and settings (R27) · Help on WhatsApp (R28) · Coming soon (R29) → in vendor mode, extra rows: Business profile (V16) · Payout account (V15) · Staff and technicians (V18) · Approval status (V17) → **Sign out** (`ListRow danger`) → app version (caption faint).
- **Motion:** Mode switch: a full-screen lagoon crossfade (300 ms) with "Switching to vendor mode", landing on V1.

#### R25 · Verification tiers
- **Type:** Full screen (stack).
- **Layout:** Title "What you can rent" → `TrustLadder full`: three cards (Tier 1 "Mics, small speakers, lights" · Tier 2 "Full sound systems, projectors, cameras" · Tier 3 "LED walls and full production, with a technician"), each with a check list (✓ Phone · ✓ ID check · ○ Address) and a CTA on the next locked tier: **Unlock sound systems** → provider SDK → caption "Each problem-free rental lowers your deposits."
- **States:** Pending check, failed (with Try again), organisation (CAC + responsible officer, later).

#### R26 · Payment methods
- **Layout:** "Cards" list (brand, last 4, expiry, default chip) → **Add a card** (Paystack) → "Refunds go to" (a bank account for deposit refunds: bank + account name) → note "Deloo never stores your card number."
- **States:** Empty: "No card saved. You can pay by transfer or USSD at checkout." Removing a card: a confirm dialog ("Remove card ending 4421?").

#### R27 · Notifications & settings
- **Layout:** Notifications switches: Booking updates (locked on: "Needed for your bookings") · Event day updates · Offers and news (off by default) → Data: "Save data" switch ("Load small photos on mobile data") · "Upload checklist photos on Wi-Fi only" (off; explained) → Appearance: System · Light · Dark → Language: English (Pidgin "coming soon") → Text size: "Follows your phone's setting" (info row).

#### R28 · Help
- **Layout:** `Card` lagoon: "Chat with us on WhatsApp", "We reply in about 10 minutes, 7am to 10pm" → **Open WhatsApp** (prefills the booking ID if opened from a booking) → **Call us** (secondary) → common questions (`ListRow` expanders: deposits, cancellations, damage, delivery) → "Report a problem with a booking" → picks a booking → R23 report.
- **States:** Outside hours: "We'll reply from 7am. For event-day emergencies, call us."

#### R29 · Coming soon waitlists
- **Layout:** Title "Coming soon" → 3 cards with illustrations: Ad space (billboards, LED screens, mall and campus displays) · Media crew by the hour · Studio space by the hour → each **Join the waitlist** opens a sheet: what (chips), where (area), when (month), then **Join**. Joined cards show "You're on the list" (green badge).

### 3.7 Vendor

#### V1 · Today
- **Type:** Tab root (Today) in vendor mode.
- **Purpose:** What needs doing now: answer requests, hand over, receive.
- **Layout:**
  1. Kicker date ("Saturday 14 December"), title = business name.
  2. `Banner warning` while not approved: "Waiting for Deloo's check. Your gear isn't live yet" → V17.
  3. **Needs your answer** (when any): `RequestCard`s showing the renter's first name and trust badge, items, dates, the payout figure and a countdown ("Answer in 1h 42m"), plus **View** → V2.
  4. **Today:** a time-ordered list of `TaskRow`s: "7:00 Pickup · Youth Crusade · 6 items" with **Start checklist** (→ V12), "18:00 Return · Wedding". Late rows get a red time.
  5. **This week:** 3 small figures (bookings · items out · expected payout ₦).
  6. In the footer area: none (Today has no single primary action).
- **States:** Empty: an illustration plus "Nothing to do today. Requests, pickups and returns show here." with **Add more gear** (→ V6). New vendor, no gear: an `EmptyState first-time` with "Add your first item. Takes about a minute" → V6. Offline: cached tasks; checklists still start.
- **Motion:** A new request slides into the list (220 ms) and the device gets a high-priority push.

```
+--------------------------------------+
| Saturday 14 December                 |
| Sound City Rentals                   |
| +----------------------------------+ |
| | ! Waiting for Deloo's check.   > | |
| +----------------------------------+ |
| NEEDS YOUR ANSWER                    |
| +----------------------------------+ |
| | Tunde . Verified tier 2          | |
| | 4 speakers, mixer . Sat 21 Dec   | |
| | You get ₦139,000   Answer 1h 42m | |
| |                       [ View ]   | |
| +----------------------------------+ |
| TODAY                                |
| 07:00 Pickup . Youth Crusade         |
|       6 items       [Start checklist]|
| 18:00 Return . Ade & Bisi wedding    |
|       3 items                        |
| THIS WEEK                            |
|   4 bookings | 9 out | ₦412,000      |
|--------------------------------------|
| Today Calendar  Gear  Earnings  Me   |
+--------------------------------------+
```

#### V2 · Booking request
- **Type:** Full screen (stack, from V1 or a push).
- **Purpose:** Accept or decline with enough about the renter to feel safe.
- **Layout:** TopBar with the countdown chip ("Answer in 1h 42m") → renter card: `Avatar`, name, `TrustLadder compact` badge, "3 rentals, no problems", rating → **warnings** as marigold `Banner`s when flagged ("New account" · "Booked for tomorrow" · "Delivery far from their address") → event and dates → items with the units that will be reserved ("Unit #2, #3") → delivery or pickup and address area → technician needed → `PriceSummary` from the vendor's view: "Rental ₦160,000 · Deloo fee 13% −₦20,800 · **You get ₦139,200** after return" → footer pair **Decline** (secondary) · **Accept** (primary).
- **Decline sheet:** reason chips (Gear not free · Too far · Not comfortable with this renter · Other) → **Decline request**, with the caption "The renter is refunded in full. Declining often lowers your ranking."
- **States:** Expired: "This request expired. The renter has been refunded." Already handled on another device: a read-only view.

#### V3 · Calendar
- **Type:** Tab root (Calendar).
- **Purpose:** See and control availability per item.
- **Layout:** Title "Calendar" → item filter `ChipGroup rail` ("All gear" + each item) → `CalendarMonth vendor` (7 columns of 48 dp cells; day number, plus under it a bar: lagoon = booked, ink hatch = blocked by you, marigold = partly booked "2 of 4") → swipe between months → legend (caption) → agenda for the selected day: booking rows and block rows (swipe to remove a block, with an Undo snackbar) → footer: **Block dates** (secondary).
- **Interactions:** Tap a day → agenda. **Long-press and drag** across days → selects a range → V4 opens. Haptic on range start.
- **States:** Loading month skeleton. Offline: cached and read-only, "Changes need a connection".
- **A11y:** Each cell reads "Saturday 14 December, 3 of 4 speakers booked". Range selection has a non-drag alternative: tap a start day, then **Select range**.

```
+--------------------------------------+
| Calendar                             |
| [All gear][JBL EON715][Mixer][LED..] |
|  <        December 2026         >    |
|  M    T    W    T    F    S    S     |
|  1    2    3    4    5    6    7     |
|                           ==   ##    |
|  8    9   10   11   12   13   14     |
|                ~~        ==   ==     |
| 15   16   17   18   19   20   21     |
|                           ##   ##    |
| == booked  ## blocked  ~~ partly     |
|--------------------------------------|
| Sat 14 Dec                           |
| | Youth Crusade . 4 speakers  >    | |
| | Blocked: our service 8-12  [x]   | |
| +----------------------------------+ |
| |          Block dates             | |
| +----------------------------------+ |
+--------------------------------------+
```

#### V4 · Block dates sheet
- **Type:** Bottom sheet (half → full).
- **Layout:** Title "Block dates" → range summary ("Sat 21 – Sun 22 Dec", tap to change) → time (`ListRow`: All day, or From / To) → which gear (checkbox list of items with a unit `Stepper`: "Block 2 of 4") → reason chips (Our own event · Repair · Already rented elsewhere · Other) → repeat (None · Every week on this day) → footer **Block dates**.
- **States:** Conflict with an existing booking: red line "You have a booking on Sat 21. Booked units can't be blocked." Saved: sheet closes, Snackbar "Dates blocked. Undo".

#### V5 · Gear list
- **Type:** Tab root (Gear).
- **Layout:** Title "Your gear" plus an **Add** button (primary, `size="md"`, plus icon) in the header → search → status chips (All · Live · Waiting for check · Paused) → `GearCard row` list: photo 64, name, "4 units · 1 out today", "₦25,000/day", status `Badge` → tap → V11.
- **States:** Empty: `EmptyState first-time` with an illustration (camera + speaker), "List your first item", "Snap a photo, set a price, done. About a minute." and **Add gear** → V6. Draft (unfinished add): a marigold row "Finish listing: JBL EON715". Offline: cached; Add works and queues.

#### V6 · Add gear: snap photo
- **Type:** Full-screen camera (dark), flow step 1 of 5.
- **Layout:** TopBar (close ×, "1 of 5") → `GuidedCameraFrame free` with a soft rectangle guide and the tip "One item, filling the frame, in good light" → bottom: gallery button (left), 72 dp shutter (centre), torch (right).
- **After capture:** a preview with **Use photo** / **Retake**, then `ThinkingLines` "Looking at your photo…" (max 4 s, then manual).
- **States:** Camera denied: primer, with "Pick from gallery" as a fallback. Offline: the photo is kept; AI suggestion is skipped with "We'll suggest details when you're online. Fill them in now or later". Upload queue chip.
- **A11y:** The shutter is labelled "Take photo". The quality hint is announced.

```
+--------------------------------------+
| x                         1 of 5     |   dark
|                                      |
|  One item, filling the frame,        |
|  in good light.                      |
|   +------------------------------+   |
|   |                              |   |
|   |                              |   |
|   |        [ live camera ]       |   |
|   |                              |   |
|   |                              |   |
|   +------------------------------+   |
|                                      |
|                                      |
|  [gallery]       ( O )      [torch]  |
+--------------------------------------+
```

#### V7 · Confirm AI suggestion
- **Type:** Full screen, step 2 of 5.
- **Layout:** Photo (16:9, rounded `lg`) → `Card lagoonTint`: "Looks like a **JBL EON715**, 15-inch powered speaker" → editable fields prefilled: Category (picker) · Brand · Model · key specs as `SpecFigure` inputs (W, inches) → "Add more photos (back, label, accessories)": 3 small `GuidedCameraFrame` slots → footer **Yes, that's right** (primary) · **Edit details** (quiet, focuses the first field).
- **States:** Low confidence: "We're not sure what this is. Pick a category" (no guess shown). Never invents a price.

#### V8 · Price & deposit
- **Type:** Full screen, step 3 of 5.
- **Layout:** Title "Set your price" → `Field` Day rate (₦ prefix, `number` style) → `MarketRange` "Similar gear in Lagos rents for ₦20k–₦28k a day", with your marker → `Field` Replacement value ("What would it cost to replace?") → derived tier card: "Tier 2: renters need an ID and address check" (or tier 3: "Technician-run only. You'll send someone with it") → `Field` Deposit (suggested and prefilled, editable) → payout preview: "On a 1-day rental you get ₦21,750 after Deloo's 13%" → footer **Continue**.

#### V9 · Units
- **Type:** Full screen, step 4 of 5.
- **Layout:** Title "How many do you have?" → `Stepper large` (number type, 1–50) → per-unit rows (Unit 1…n) with an optional serial `Field` and a condition chip (Like new · Good · Worn) → caption "Each unit is booked separately, so you never double-book." → **Continue**.

#### V10 · Availability presets
- **Type:** Full screen, step 5 of 5.
- **Layout:** Title "When is it usually busy?" → `Tile`s: "It's always free to rent" · "Busy every Sunday morning" (church preset) · "Busy at weekends" · "I'll set it on the calendar" → `CalendarMonth mini` preview of the effect → footer **List my gear**.
- **Success:** a full screen "Listed! It goes live after Deloo checks it" (or "It's live" if approved), with **Add another** · **Done**.

#### V11 · Edit item
- **Type:** Full screen (stack).
- **Layout:** Photo carousel with **Edit photos** → `ListRow value` sections: Details (V7) · Price and deposit (V8) · Units (V9) · Busy times (V10) · Included accessories → stats (bookings, earned) → `ListRow switch` "Available to rent" (pause) → **Remove listing** (`danger`, confirm dialog; blocked while there are future bookings).

#### V12 · Handover checklist (vendor)
- **Type:** Same flow and components as R21, from the vendor's side.
- **Differences:** An extra first step, "Check who's collecting": the renter's name and photo from verification, with `YesNo` "Is this the person on the booking?" A "No" stops the handover and opens a call to Deloo. Technician assignment row ("Who's going? Emeka (technician)"). On return, condition differences against pickup are highlighted per shot, with **All good, release deposit** or **Report damage** (→ V13). Slide label: "Slide to confirm handover" / "Slide to confirm return".

#### V13 · Raise damage claim
- **Type:** Full screen (stack, from the V12 return).
- **Layout:** Title "Report damage" → choose unit(s) → `PhotoCarousel evidence` (pickup vs return for the same shot, side by side) → damage type chips (Cracked · Not working · Missing part · Water damage · Other) → new photos (`GuidedCameraFrame free`) → amount `Field` (₦) with a repair-quote photo option → caption "Up to the ₦150,000 deposit comes from the deposit; above that, Deloo Protection reviews it." → footer `Button danger` **Send to Deloo**.
- **States:** Sent: the tracker shows "Claim with Deloo · decision within 5 working days". The payout is held for the claimed amount only.

#### V14 · Earnings
- **Type:** Tab root (Earnings).
- **Layout:** `MoneyHero earnings` "₦1,240,000" with "Earned in December" → `DepositCard payout` "Next payout ₦139,200 · after Sat 21 return" → "Held for claims ₦45,000" (when any) → payouts list (date, booking, amount, status `Badge`) → **Payout account** row (→ V15).
- **Copy:** Caption "You're paid after the return checklist is done, usually the next working day."
- **States:** Empty: "No earnings yet. Your first payout comes after your first return." No payout account: marigold Banner "Add a bank account to get paid" → V15.

#### V15 · Payout account
- **Layout:** Bank (searchable picker) → Account number (10 digits, number pad) → the resolved name appears automatically ("ADEBAYO SOUND CITY VENTURES") in a green-check card → caption "It must match your business or your verified name." → **Save account**.
- **States:** Resolving (inline spinner). Name mismatch: marigold "This name doesn't match Sound City Rentals. Deloo will confirm it with you." Offline: disabled.

#### V16 · Vendor profile edit
- **Layout:** Logo/`Avatar` (tap to change) → Name · Type · About (160 chars) → Areas (chips) → switches: Delivers and sets up · Sends a technician → "See how renters see you" (→ R14 preview) → **Save**.

#### V17 · Approval status
- **Layout:** Title "Getting you live" → a vertical `CheckpointTracker`: Details added ✓ · ID or CAC checked · Gear photos reviewed · Call with Deloo · Live → each pending step has one action (Verify ID → SDK; "We'll call you on 0803…, change number") → caption "Usually 1–2 working days."
- **States:** Rejected step: red with the reason and **Fix it**.

#### V18 · Staff & technicians
- **Layout:** Title "Your team" → member rows (`Avatar`, name, role Owner/Staff, `Badge` "Technician") → **Invite someone** (sheet: phone or email, role, "Can run handovers" switch, "Is a technician" switch) → caption "Technicians are your staff. Deloo checks and rates them."
- **States:** Pending invite row ("Invite sent · Resend"). Empty: only the owner, with an `EmptyState` line "Add staff who handle pickups and returns."

---

## 4. Design page by page: order and on-device checks

Validate every step on a **360 dp, 2–3 GB RAM Android** (Tecno Spark, Infinix Hot or itel class), at system font size 1.3×, in dark mode, and with TalkBack for one pass. Use an iPhone SE-size screen for iOS checks from step 6 on.

| # | Design and build | Screens | What to validate on the device |
|---|---|---|---|
| 0 | Foundations | Token fixes (`greenInk`, gutter rule), `Icon`, `Tile` icon/grid, `TopBar`, `Sheet`, `ActionBar`, `Skeleton`, `OfflineBanner` | Fonts load before first paint (no flash). Contrast in both themes. Ripple clipped to the radius. Predictive back closes a sheet first. 48 dp targets with the layout inspector. |
| 1 | First run | A1 → A2 → A3 → A4 → A5 → A6 | Under 60 s from install to R1. Code autofill works. Keyboard never covers the footer. Rotating words stop with Remove animations on. |
| 2 | Plan start | R1, R2 | Mic primer and denied path. Speech works with Nigerian accents and a church PA in the background. Text examples fit at 1.3× font. |
| 3 | Questions | R3a–R3i, R4 | Back steps one question. Auto-advance feels right (250 ms) and is off with TalkBack. Crowd slider is smooth at 60 fps on the low-end phone, and usable one-handed. Resuming a plan after killing the app. |
| 4 | The answer | R5, R6, R7, R8, R9 | R5 is never shorter than 900 ms or stuck. R6 total readable at arm's length. Tier switch is instant from cache. Swap sheet scrolls without jank with 12 rows. "Not available" reads as honest, not broken (test with 3 church media leads). |
| 5 | Share | R10 | The WhatsApp message reads well on the receiving phone. The link opens on deloo.space on a cheap browser without the app. |
| 6 | Explore | R11, R12, R13, R14 | Grid scroll with 100 items (FlashList), image data per screen under 1 MB, shared-element transition, cached grid in airplane mode. |
| 7 | Vendor listing | V5, V6, V7, V8, V9, V10, V11 | Add an item in under 60 s with a real vendor. Camera opens in under 1.5 s. Photo compression to ≤ 250 KB. The AI guess is shown as a guess. Draft survives the app being killed. |
| 8 | Vendor time | V3, V4, V1 | Long-press and drag across weeks is precise on a 360 dp screen. Block and undo. Today reads at a glance outdoors in sunlight. |
| 9 | Book and pay | R15, R16, R17, R18 | Hold timer survives backgrounding. Slide-to-confirm can't fire by accident in a pocket or while scrolling. Paystack sheet returns cleanly. Screen-reader alternative for the slide. |
| 10 | After booking | R19, R20, V2 | Tracker in dark mode in a dim room. Ongoing notification. Accept/decline from a push. |
| 11 | Handover | R21, V12, V13, R23 | The whole checklist in airplane mode, then sync. Blur and dark checks in a dim hall and in harsh sun. The upload queue survives a reboot. Two phones confirming the same handover. |
| 12 | Money and trust | V14, V15, R25, R26, R16 SDK, V17 | Account-name resolve. Tier unlock flow with the real provider SDK. Figures match `PriceSummary` to the kobo. |
| 13 | The rest | R22, R24, R27, R28, R29, V16, V18 | Mode switch both ways. WhatsApp deep link with the booking ID. Settings persist. |

---

## 5. Proposed inventory additions (not renumbering)

> **Reconciled 9 Oct 2026** with the UX researcher's flows: the final list is `docs/ux/inventory.md`. Hold expired is **R36**; the vendor booking detail is part of **V2**; rate renter is **V19**; decline reason is **V20**.

| ID | Name | Type | Why it's needed |
|---|---|---|---|
| A7 | Permission primer | Sheet | One reusable primer for the mic (R2), camera (R21, V6), location (R3h) and notifications. It is shown just before the system dialog so first-time "Deny" doesn't kill the feature. |
| R3j | Technician (question) | Question | The PRD intake lists "Technician: yes / no / not sure". Proposal: **don't add the screen**; ask it as the add-on switch in R6 and R15 (auto-on for tier 3). Listed here so the research flows record the decision. |
| R36 (was R30) | Hold expired | Full-screen interruption | R15/R17 need a defined state when the 30-minute hold runs out mid-payment ("Your hold ran out. Hold again?"). |
| R31 | Cancel booking sheet | Sheet | Renter cancellation with the refund rules spelled out before confirming. The lifecycle has "cancelled" but no screen. |
| R32 | Rescue: replacement offered | Full screen | PRD §4.4 rescue guarantee: when a vendor cancels, show the proposed replacement setup, or the full refund plus credit. |
| R33 | Your plans (all) | Full screen | R1 shows only 3 saved plans; "See all" needs a destination. |
| ~~V19~~ merged into V2 | Booking detail (vendor) | Full screen | After V2 is accepted, vendors need their own tracker (the R20 equivalent: renter contact, units, checklist entry, payout status). |
| V19 (was V20) | Rate renter | Sheet | The PRD makes ratings two-way; only R22 exists. Same layout as R22 with renter tags ("Returned on time · Took good care · Hard to reach"). |
| V20 (was V21) | Decline reason sheet | Sheet | Spec'd inside V2 above. It gets an ID so flows can reference it. |
| S1 | Mode switch interstitial | System | The 300 ms "Switching to vendor mode" transition, and first-time vendor mode with no gear. |
| S2 | Update required / maintenance | System | Needed for forced updates when the database or pricing rules change (OTA can't fix everything). |
| S3 | Push notification landing | System | Defines where each push opens (request → V2, step change → R20, claim → R23/V13). |

**Inventory notes:**
- **R7** is an inline expansion state of R6, not a route.
- **R18** covers both the slide control (on R17) and the success screen.
- **R24** is shared by both modes; the vendor "Me" tab is R24 plus the vendor rows.
- **A2/A4** change shape when phone OTP lands: A2 becomes the phone number and A4 becomes name only.
- **The tab bar** stays the native M3 navigation bar instead of the plan's floating pill (rule 13). This is a decision for the founder to confirm.
