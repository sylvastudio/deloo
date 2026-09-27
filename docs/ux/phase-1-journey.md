# Deloo Phase 1: guided journey spec

**Status:** Proposal, 27 Sep 2026. Written for the main agent to build into `prototype/index.html`.
**Update, 27 Sep 2026:** The owner chose a different journey (onboarding questions, then a chat and
canvas dashboard; see PRD §9). This spec's step-by-step form flow was not built. Still applied from it:
the mock never invents missing details, required details are checked, edits aren't lost silently,
the "locked by HQ" tone, and the Mock AI badge. Its assumptions (§7) still need validating.
**Scope:** Phase 1 only (IMPLEMENTATION_PLAN.md). One local HTML file, mocked AI, no server, no sign-in,
fictional TEST DATA (Grace Harbour Chapel, Northgate Alumni Association).
**Owner feedback being answered:** "It seems so static and users aren't carried along on a journey."
**Research status:** No user research has been done yet. Everything this spec says about how
volunteers behave is an **assumption to validate** (listed in §7 and tagged `[A#]` where it is used).

---

## 1. Diagnosis: why the current screen feels static

The prototype proves the engine (brief → slots → 4 sizes → PNG). It does not yet tell a story. The
specific causes:

1. **It opens finished.** On load, the sample brief is already filled in and generated
   (`mockGenerateCopy(briefEl.value, …)` runs on `document.fonts.ready`). The user never sees a
   "before", so they never cause the "after". The main magic (a text message becoming four
   posters) happens before they arrive.
2. **Everything is shown at once, with equal weight.** Brand kit card, Brief card, Copy editor (Layout
   + every slot field) and four previews are all visible from the first second. Nothing says "start
   here", "now check this", "you're done". The only ordering signal is left-to-right reading.
3. **The understanding step is invisible.** `parseBrief()` pulls out the date, speaker → "Ministering:",
   theme and time/venue, which is Deloo's most impressive moment ("occasion intelligence", README edge
   #2). The user never sees it happen. The parsed details simply appear as filled copy fields with no
   "this is what I picked up from your message".
4. **The mock invents facts and doesn't say so.** When the brief has no date, the flyer prints
   "Saturday 3 October". When there's no venue it prints "4:00 pm · Main Auditorium". When there's no
   speaker it prints "Ministering: Guest Speaker". The CTA always says "Free entry". A volunteer could
   download a flyer with a wrong date and never notice. For a tool that sells "brand guardian", this is
   the biggest trust risk in the current flow.
5. **Generate barely registers.** 600 ms of blur plus the status text "Writing copy (mocked)…", then a
   small green line "4 sizes ready · Grace Harbour Chapel" in the stage header. There's no reveal and
   no moment of arrival.
6. **Changing category silently regenerates and throws away edits.** The category radios call
   `generate()` on change, which replaces `state.slots` and rebuilds the editor. Any copy the user
   typed is lost with no warning or undo.
7. **Choosing a look is buried.** "Layout: Bold / Framed" is a text-only segmented control inside the
   Copy card, below a developer note. The user can't see what "Framed" means until they click it and
   look at the other column.
8. **The brand-guardian story is a tiny label plus a demo control.** "Set by HQ" is 11 px mono text.
   Right under it is "Switch test kit (prototype only)", a control a real volunteer would never have.
   Its hint mixes two audiences ("Volunteers can't edit the kit. Switching here shows every design
   restyling…"). The reassuring message ("HQ's kit is applied for you, so you can't get it wrong")
   is never said.
9. **Developer language in the user's path.** "Mocked AI output. A canned response in the Phase 3 slot
   schema…" sits in the middle of the editor. The copy editor labels ("Eyebrow", "Call to action")
   are template terms, not volunteer terms.
10. **Downloading is a dead end.** Four separate "Download PNG" buttons flip to "Downloaded" for 1.4 s
    and then reset. There's no "all done", no hint where the file went, no "what now" (post, print,
    make the announcement for the same event).
11. **The phone layout breaks the edit loop.** Below 900 px the left column stacks above the previews,
    so editing a word means scrolling past three cards to see the effect, and the 1080×1920 story
    preview is a very tall block. `[A1]`
12. **One generic hint for three different jobs.** The brief hint always asks for "event, date,
    speaker, theme, time, place", even for a Quote card, which needs a quote and a reference.

**In one line:** the prototype is a control panel for the engine. The journey needs a sequence of
states, each with one clear job, one clear next action, and visible feedback that Deloo did something
with what the volunteer said.

---

## 2. Journey map: branch/department volunteer making assets for an event

**Proto-persona (built only from README/PRD, not from research):** a volunteer in a branch or
department of a multi-unit organisation (README §"Who it's for"; PRD §6 "Branch / Department
Volunteer"). They create briefs, generate, edit, regenerate and download assets using HQ's kit, and
**cannot** edit logos, colours or fonts. Everything else about them (device, confidence, deadlines,
channels) is an assumption and is tagged.

Scenario used throughout: the fictional test brief *"Youth conference, 3 Oct, guest speaker Pastor
Tolu Adeyemi, theme Rise and Shine, 4pm at the Main Auditorium"* for Grace Harbour Chapel (TEST DATA).

### Stage 1: Arrive

| | |
|---|---|
| **User goal** | Understand what this is and start quickly. |
| **What they see (proposed)** | A short welcome: whose kit they're working with (logo, name, "Brand kit set by HQ"), one sentence of what happens next, two ways in: "Describe your event" or "Try an example". |
| **What they do** | Pick a way in. |
| **System feedback** | The kit card shows the lock as a positive ("Logo, colours and fonts are applied for you"). |
| **Emotional risk** | "Is this another design tool I have to learn?" Blank-page anxiety `[A2]`. Feeling policed by HQ `[A6]`. |
| **Design response** | Lead with the outcome ("Type what's happening. Deloo makes 4 on-brand designs."). Offer the example as a one-tap path, not a pre-filled result. Frame the lock as a benefit. |

### Stage 2: Describe the event

| | |
|---|---|
| **User goal** | Say what's happening in their own words, fast. |
| **What they see** | "What are you making?" with 3 cards (Event flyer, Announcement, Quote or scripture card), each with a one-line description. Below, one text box whose placeholder and hint change with the card. |
| **What they do** | Pick a card (Event flyer preselected), type or paste the brief, press "Continue". |
| **System feedback** | Character count. Live "Deloo spots:" chips under the box as details are recognised (Date, Speaker, Theme, Time & venue) `[should]`. |
| **Emotional risk** | Not knowing what to write or how much. Worry that it must be formal. |
| **Design response** | "Write it the way you'd text it" `[A2]`. Category-specific example. Chips give instant proof they're being understood. |

### Stage 3: Review what Deloo understood

| | |
|---|---|
| **User goal** | Make sure the facts are right before anything is designed. |
| **What they see** | "Here's what Deloo picked up" with each detail as an editable field and a status: *Found* (from your brief) or *Not found*. Speaker shows as "Ministering: Pastor Tolu Adeyemi" with a note on the label. Beside it, "Pick a look": two small live thumbnails (Bold, Framed) in the HQ kit. |
| **What they do** | Fix or fill anything wrong or missing, pick a look, press **Generate assets** (the one Marigold button). |
| **System feedback** | Thumbnails update as fields change. Missing required detail shows an inline error, not a dialog. |
| **Emotional risk** | Wrong date or name printed on 300 handbills. Feeling the AI "decided" things for them. |
| **Design response** | Nothing is printed that the volunteer hasn't seen. No invented facts: empty stays empty. Required fields per category are few and clearly marked. |

### Stage 4: Generating (waiting)

| | |
|---|---|
| **User goal** | Know it's working and roughly how long. |
| **What they see** | A short 3-line progress list that ticks: "Reading your details", "Writing the words", "Fitting 4 sizes to Grace Harbour Chapel's kit". |
| **What they do** | Wait (about 1.2 s total). |
| **System feedback** | Each line ticks in turn. Screen readers hear one polite status update. |
| **Emotional risk** | "Did it freeze?" or a flash too fast to register as work. |
| **Design response** | Name the steps (it also teaches the product: words, then sizes, then brand). Stay honest: the "Mock AI" badge stays visible. |

### Stage 5: See the assets (reveal)

| | |
|---|---|
| **User goal** | See the result and judge "is this good enough to post?" |
| **What they see** | Heading "Your Youth Conference designs are ready", 4 sizes appearing one after another, an on-brand confirmation line, and clear next actions: "Edit the words", "Change look", "Download all 4". |
| **What they do** | Scan the sizes, maybe open one bigger. |
| **System feedback** | Staggered reveal. "On-brand: HQ logo, colours and fonts" in Approve green. |
| **Emotional risk** | Disappointment if a size looks broken. Overwhelm from 4 things at once. |
| **Design response** | Lead with the most common size (IG post) larger, the others as a row `[A9]`. Friendly size names first, pixel dims second. |

### Stage 6: Refine

| | |
|---|---|
| **User goal** | Fix a word, change the look, try another category, without breaking anything. |
| **What they see** | "Edit the words" panel with plain-language labels, next to the previews. Look switcher with thumbnails. Brand items shown as locked rows at the bottom of the panel. |
| **What they do** | Type, and watch every size update. Switch look. |
| **System feedback** | The previews update on each keystroke. A small "Updated all 4 sizes" note after a pause. "Reset to Deloo's words" per field. |
| **Emotional risk** | Fear of breaking the design. Losing edits. Wanting to change colours and being blocked. |
| **Design response** | Edits are never discarded silently. The lock explains itself and gives a way forward ("Ask your org admin"). |

### Stage 7: Download / share

| | |
|---|---|
| **User goal** | Get the files onto the device, then into the channels they post to `[A5]`. |
| **What they see** | "Download all 4" (Lagoon primary) plus a download per size. After downloading, a success panel with file names and where to find them. |
| **What they do** | Download, then leave the page to post or send. |
| **System feedback** | Button: "Saving…" → "Saved". Success panel: "4 images saved. Check your Downloads folder." |
| **Emotional risk** | "Where did it go?" (especially on a phone). Not knowing which size goes where. |
| **Design response** | Name the files clearly. A short "Which size where?" note (post and story for Instagram, banner for X/LinkedIn, handbill for print). |

### Stage 8: What next

| | |
|---|---|
| **User goal** | Finish, or make the next piece for the same event `[A8]`. |
| **What they see** | "Need more for this event?" with "Make an announcement" and "Make a quote card" (details carried over), plus "Start a new brief". |
| **What they do** | Carry on, or close the tab. |
| **System feedback** | Carried details are shown on the check step as "From your last brief". |
| **Emotional risk** | Re-typing the same details. Ending on a flat "Downloaded". |
| **Design response** | Carry the confirmed details forward. End on a clear finish line. |

---

## 3. The proposed flow

**Shape:** one page, five states, one visible at a time (plus the persistent top bar). No routing, so
it stays a single `file://` HTML file. A stepper in the top bar shows **1 Describe · 2 Check details ·
3 Your designs**. State 0 (Start) and the Generating state sit outside the numbered steps.

```
 [0 Start] --"Describe your event"--> [1 Describe] --"Continue"--> [2 Check details]
     |                                    ^    ^                         |
     +--"Try an example" (fills brief)----+    |                   "Generate assets"
                                               |                         v
                                  "Edit brief" |                  [Generating ~1.2s]
                                               |                         |
                                               |                         v
       "Make an announcement / quote card" ---(2)<--------------- [3 Your designs]
       "Start a new brief" ------------------(1, empty)  <---------  (refine + download)
```

Back navigation: the stepper's completed steps are buttons. Going back never discards data. Going
forward from step 2 again (Generate) replaces the generated words **only after confirming** if the user
has edited words on step 3: "Replace your edited words with a fresh version?" [Replace] [Keep my edits].

### Step 0: Start (first run)

**Shows:** kit card (large), one-line promise, two actions.
**Hidden:** brief box, previews, editor, test-kit switcher (moved to "Prototype controls").

Desktop:
```
+------------------------------------------------------------------------------------+
| deloo.                       1 Describe · 2 Check details · 3 Your designs          |
|                                   [TEST DATA] [Mock AI] [Prototype controls v]     |
+------------------------------------------------------------------------------------+
|                                                                                    |
|   Make it known.                                                                   |
|   Type what's happening. Deloo writes the words and makes 4 designs                |
|   in your organisation's brand.                                                    |
|                                                                                    |
|   +-------------------------------------------------------------+                  |
|   | (GH)  Grace Harbour Chapel                      [lock] Set by HQ               |
|   |       ■ ■ ■ ■ ■   Oswald / Lato                              |                  |
|   |       Logo, colours and fonts are applied for you.           |                  |
|   +-------------------------------------------------------------+                  |
|                                                                                    |
|   [ Describe your event ]   Try an example                                         |
|    (Lagoon primary)          (quiet button)                                        |
|                                                                                    |
|   Makes: Instagram post · Instagram story · X/LinkedIn banner · A5 handbill        |
+------------------------------------------------------------------------------------+
```
Phone: same content in one column. Buttons full width, stacked, primary first. Stepper collapses to
"Step 1 of 3".

### Step 1: Describe

**Shows:** category cards, brief box with category-specific placeholder and hint, live "Deloo spots"
chips, "Continue".
**Hidden:** everything about looks, previews and editing.

Desktop:
```
+------------------------------------------------------------------------------------+
| deloo.        (1 Describe) · 2 Check details · 3 Your designs     [GH] Grace Harbour|
+------------------------------------------------------------------------------------+
|  What are you making?                                                              |
|  +------------------------+ +------------------------+ +------------------------+  |
|  | (•) Event flyer        | | ( ) Announcement       | | ( ) Quote or scripture |  |
|  | Date, speaker, venue.  | | News for your members. | |     card               |  |
|  |                        | |                        | | A verse or a quote.    |  |
|  +------------------------+ +------------------------+ +------------------------+  |
|                                                                                    |
|  What's happening?                                                    96 / 280     |
|  +------------------------------------------------------------------------------+  |
|  | Youth conference, 3 Oct, guest speaker Pastor Tolu Adeyemi, theme Rise and   |  |
|  | Shine, 4pm at the Main Auditorium                                            |  |
|  +------------------------------------------------------------------------------+  |
|  Write it the way you'd text it: what, when, who, where.                           |
|                                                                                    |
|  Deloo spots:  [✓ Date] [✓ Speaker] [✓ Theme] [✓ Time & venue]                     |
|                                                                                    |
|                                                          [ Continue -> ]           |
+------------------------------------------------------------------------------------+
```
Phone: cards become a vertical radio list (full-width rows, 44 px tall). The text box gets 16 px text.
"Continue" lives in a sticky bottom bar.

### Step 2: Check details (the "Deloo understood your brief" moment)

**Shows:** the parsed details as editable fields with Found/Not found markers, the look picker with two
live thumbnails, **Generate assets** (Marigold, the only one on the page).
**Hidden:** the full 4-size grid, download.

Fields per category (from `slot-schemas.json` and `parseBrief()`):

| Event flyer | Announcement | Quote or scripture card |
|---|---|---|
| Event name* (`title`) | Headline* (`title`) | Quote or scripture* (`quote`) |
| Date* (`date_line`) | Date (`date_line`, recommended) | Reference (`reference`) |
| Time and venue (`time_venue`) | Time and venue (added to message) | Footer line (`footer`, theme or event) |
| Theme (`theme`) | Other details (`extras`) | |
| People: role + name rows (`roles`) | | |

`*` = required to generate.

Desktop:
```
+------------------------------------------------------------------------------------+
| deloo.        1 Describe ✓ · (2 Check details) · 3 Your designs                    |
+------------------------------------------------------------------------------------+
|  Here's what Deloo picked up                          Pick a look                  |
|  Check these before Deloo makes your designs.         +-----------+ +-----------+  |
|                                                       | [Bold     | | [Framed   |  |
|  Event name        Found                              |  thumb,   | |  thumb,   |  |
|  [ Youth Conference                          ]        |  IG post] | |  IG post] |  |
|                                                       |  (•) Bold | |  ( ) Framed| |
|  Date              Found                              +-----------+ +-----------+  |
|  [ Saturday 3 October                        ]        Solid colour   Light, with   |
|                                                       background.    a border.     |
|  Time and venue    Found                                                           |
|  [ 4pm · Main Auditorium                     ]        [lock] Grace Harbour Chapel's|
|                                                       logo, colours and fonts are  |
|  Theme             Found                              set by HQ.                   |
|  [ Rise and Shine                            ]                                     |
|                                                                                    |
|  People                                                                            |
|  [Ministering v] [ Pastor Tolu Adeyemi       ]                                     |
|  You wrote "guest speaker". Deloo uses "Ministering:" for speakers.                |
|  Change it to Host, Anchor or Guest if that fits better.                           |
|  + Add a person                                                                    |
|                                                                                    |
|  <- Edit brief                                        [ Generate assets ]          |
|                                                         (Marigold)                 |
+------------------------------------------------------------------------------------+
```
Phone: one column. Details first, then "Pick a look" as two side-by-side thumbnails (each ~45% width).
Sticky bottom bar: "Generate assets" (Marigold, full width).

Missing-date variant (event flyer):
```
|  Date              Not found                                                        |
|  [                                            ]   <- red border, proof-red tint     |
|  Add the event date so it prints on every size.                                     |
```

### Generating (between step 2 and 3)

**Shows:** the step 2 panel dims. A centred card with the 3-line progress list.
**Hidden:** nothing new. Buttons are disabled.

```
            +----------------------------------------------+
            |  Making your designs                [Mock AI]|
            |                                              |
            |  ✓ Reading your details                      |
            |  ✓ Writing the words                         |
            |  ◌ Fitting 4 sizes to Grace Harbour          |
            |    Chapel's kit                              |
            +----------------------------------------------+
```
Timing: 3 lines × ~400 ms (the mock's 600 ms delay runs inside the first two). Total ≤ 1.4 s.

### Step 3: Your designs (reveal, refine, download, what next)

**Shows:** results header, the look switcher (thumbnails, small), the 4 sizes, "Edit the words"
panel, download actions, and after a download the success panel and "what next".

Desktop:
```
+------------------------------------------------------------------------------------+
| deloo.        1 Describe ✓ · 2 Check details ✓ · (3 Your designs)                  |
+------------------------------------------------------------------------------------+
|  Your Youth Conference designs are ready          [ Download all 4 ]  (Lagoon)     |
|  4 sizes · Bold look · ✓ On-brand: HQ logo, colours and fonts                      |
|                                                                                    |
| +--------------------------+  +---------------------------------------------------+|
| | Edit the words           |  | Look:  [Bold ▣] [Framed ▢]                        ||
| | Changes update all 4.    |  |                                                   ||
| |                          |  | +-------------------+  +---------+  +------------+||
| | Small heading            |  | |                   |  |         |  | A5         |||
| | [Grace Harbour presents] |  | |  Instagram post   |  |  Story  |  | handbill   |||
| | Event name               |  | |  (large)          |  |         |  |            |||
| | [Youth Conference     ]  |  | |                   |  |         |  |            |||
| | Theme  [Rise and Shine]  |  | +-------------------+  +---------+  +------------+||
| | Date   [Saturday 3 Oct ] |  | Instagram post        Instagram     A5 handbill   ||
| | Time and venue [....  ]  |  | 1080 × 1080 [Download] story [Down] [Download]    ||
| | People [Ministering v][] |  | +-----------------------------------------------+ ||
| | Closing line [.......  ] |  | | X / LinkedIn banner 1500 × 500                | ||
| |   Reset to Deloo's words |  | +-----------------------------------------------+ ||
| |                          |  |                                      [Download]   ||
| | --- Set by HQ ---------- |  +---------------------------------------------------+|
| | [lock] Logo              |                                                       |
| | [lock] Colours  ■■■■■    |  Need more for this event?                            |
| | [lock] Fonts Oswald/Lato |  [Make an announcement] [Make a quote card]           |
| | Ask your org admin to    |  Start a new brief                                    |
| | change these.            |                                                       |
| +--------------------------+                                                       |
+------------------------------------------------------------------------------------+
```

After "Download all 4" (or any single download), a success panel slides in under the header:
```
|  ✓ 4 images saved                                                                  |
|    deloo-grace-harbour-youth-conference-ig-post.png  (+3 more)                     |
|    Check your Downloads folder. On a phone, look in Files or Downloads.            |
|    Which size where?  Post + story: Instagram · Banner: X or LinkedIn ·            |
|    Handbill: print (A5, 148 × 210 mm)                                              |
```

Phone:
- Header, then a **size tab row**: Post · Story · Banner · Handbill. One preview at a time, width 100%.
  Swipe is not required; tabs are buttons.
- Below the preview: "Edit the words" as a collapsible section (closed by default). When open, the
  current preview becomes sticky at the top at max 38vh so edits stay visible. `[A1]`
- Sticky bottom bar: "Download this size" (Lagoon) + "All 4" (secondary).
- Look switcher sits between tabs and preview as two small chips with thumbnails.
- "Need more for this event?" at the end of the page.

---

## 4. Key moments to design for

### 4.1 First run vs. the sample
- **Default: empty start (Step 0).** The user causes the first generation. This is the core fix for
  "static".
- **"Try an example"** fills the Event flyer card and the fictional sample brief, then lands on Step 1
  with the text visible (not on results), so the user still presses Continue and Generate themselves.
  The example text types in over ~500 ms (instant with reduced motion) so the user notices it arrived.
- **Demo/self-test path:** `#selftest` and a new `#demo` hash skip straight to Step 3 with the sample
  generated, so the headless check and quick owner demos still work.

### 4.2 "Deloo understood your brief"
- Every parsed detail is shown as an editable field labelled **Found** (Approve colour text, small) or
  **Not found** (Slate). Nothing is invented: if `parseBrief()` found no date, the Date field is empty.
- Speaker handling: when the brief says "speaker", "guest speaker", "minister" or "preacher", the People
  row shows role "Ministering" with the note "You wrote "guest speaker". Deloo uses "Ministering:" for
  speakers. Change it to Host, Anchor or Guest if that fits better." (convention from README edge #2;
  whether volunteers expect it is `[A7]`).
- Date shows with a weekday worked out from the next occurrence of that date (27 Sep 2026 → "3 Oct" =
  "Saturday 3 October"), so a wrong assumption about the day is easy to spot. `[should]`
- Extras the parser couldn't place are listed under "Also in your brief" with an "Add to message"
  action for announcements, so nothing the user typed silently disappears.
- **Should:** in Step 1, the "Deloo spots" chips give the same understanding live while typing.

### 4.3 Generating
- Three named lines tick in sequence. Keep total ≤ 1.4 s. The "Mock AI" badge stays in view.
- The Generate button shows the busy state from design.html ("Generating…" + spinner) and is disabled.
- One `aria-live="polite"` message: "Making your designs." Then on completion: "Your 4 designs are
  ready."

### 4.4 The reveal
- Heading uses the event name: "Your Youth Conference designs are ready".
- Previews appear in reading order (IG post, story, handbill, banner), staggered.
- The on-brand line appears last: "✓ On-brand: HQ logo, colours and fonts". This is the
  brand-guardian payoff at the moment of highest attention.
- Focus moves to the results heading (not to a button) so keyboard and screen-reader users start at
  the top of the new state.

### 4.5 Brand-guardian moments (reassuring, not blocking)
Three touchpoints, each framed as "done for you":
1. **Start:** kit card, "Logo, colours and fonts are applied for you."
2. **Check details:** under the look picker, "[lock] Grace Harbour Chapel's logo, colours and fonts are
   set by HQ."
3. **Edit panel:** a "Set by HQ" group of locked rows (Logo, Colours with swatches, Fonts). Clicking a
   locked row opens a small inline note, not a modal: "HQ set this logo. Ask your org admin to change
   it." (design.html wording). No disabled inputs that look broken; they're read-only summaries with a
   lock icon.
Plus the reveal line (4.4). The lock icon is Slate, never Proof Red: locked is not an error.

The test-kit switcher moves out of the volunteer's path into **"Prototype controls"** (a disclosure in
the top bar, next to the TEST DATA badge): "Switch test kit: Grace Harbour Chapel (test) / Northgate
Alumni Association (test)". Hint: "Prototype only. Real volunteers can't change the kit. Use this to
show every design restyling from the kit alone." Switching re-renders whatever state is showing.

### 4.6 Errors
| Case | Where | Behaviour | Copy |
|---|---|---|---|
| Empty brief | Step 1, Continue | Stay on step, red field, focus the box | "Tell Deloo what's happening first, e.g. "Youth conference, 3 Oct, speaker Pastor X"." |
| Brief with no recognisable details | Step 2 | Proceed; most fields "Not found"; a note at top | "Deloo couldn't pick out many details. Fill in what you can below." |
| Missing date (Event flyer) | Step 2, Generate | Block Generate, red field, focus it | "Add the event date so it prints on every size." |
| Missing date (Announcement) | Step 2 | Warn, don't block | "No date yet. Add one if members need to know when." |
| Missing quote (Quote card) | Step 2, Generate | Block, offer sample | "Add the quote or scripture to show on the card." + quiet button "Use a sample verse (Matthew 5:16)" |
| Date looks past | Step 2 | Warn, don't block `[should]` | "This date has already passed this year. Check it's right." |
| Empty required field on Step 3 edit | Step 3 | Allow (preview shows a gap), warn inline | "The date is empty, so it won't show on your designs." |
| PNG library didn't load (offline) | Step 3, Download | Status message, keep button active | "Downloading needs an internet connection the first time. Connect and reload the page." |
| Render failed | Step 3, Download | Button shows "Try again" | "That image didn't save. Wait a moment for the fonts to load, then try again." |
| Browser blocks multiple downloads | Step 3, Download all | The page can't detect this, so warn up front and keep per-size buttons as the fallback | Helper under "Download all 4": "Your browser may ask to allow several downloads." |

Errors are shown next to the field, in Proof Red, with `aria-invalid` and `aria-describedby`. No
alert dialogs.

### 4.7 Success after download
- Button: "Saving…" → "Saved ✓" (Approve colour text) for 2 s, then back to "Download again".
- First download reveals the success panel (see Step 3 wireframe) and it stays until a new brief.
- Download all: files download one after another about 300 ms apart (to reduce browser blocking).
  Panel counts up: "Saving 2 of 4…" → "4 images saved".
- File names become readable: `deloo-{kit}-{event-name-slug}-{size}.png`, e.g.
  `deloo-grace-harbour-youth-conference-ig-story.png`.

### 4.8 What next
- "Need more for this event?" offers the **other two** categories. Choosing one goes to Step 2 with
  the confirmed details carried over (title, date, time/venue, theme, people), marked "From your last
  brief". The current designs and edits are kept in memory per category, so going back shows them.
- "Start a new brief" (quiet) clears everything and returns to Step 1 empty. If there are
  un-downloaded edits: "Start again? Your current designs haven't been downloaded." [Start new]
  [Stay here].

---

## 5. Microcopy

Voice: active, plain, short sentences, second person, no jargon, no "AI magic" claims. "Generate
assets" stays the one Marigold action.

### Top bar
| Element | Copy |
|---|---|
| Stepper | "1 Describe", "2 Check details", "3 Your designs". Phone: "Step 2 of 3 · Check details" |
| Badges | "TEST DATA", "Mock AI", "Prototype controls" (disclosure) |
| Prototype controls | Label "Switch test kit". Hint: "Prototype only. Real volunteers can't change the kit. Use this to show every design restyling from the kit alone." |

### Step 0: Start
| Element | Copy |
|---|---|
| Heading | "Make it known." |
| Lead | "Type what's happening. Deloo writes the words and makes 4 designs in your organisation's brand." |
| Kit card | "{Kit name}" · lock chip "Set by HQ" · "Logo, colours and fonts are applied for you." |
| Primary | "Describe your event" |
| Quiet | "Try an example" |
| Footnote | "Makes: Instagram post · Instagram story · X/LinkedIn banner · A5 handbill" |

### Step 1: Describe
| Element | Copy |
|---|---|
| Heading | "What are you making?" |
| Card: Event flyer | "Event flyer" / "Date, speaker, venue." |
| Card: Announcement | "Announcement" / "News for your members." |
| Card: Quote card | "Quote or scripture card" / "A verse or a quote to share." |
| Field label | "What's happening?" + counter "0 / 280" |
| Placeholder (event) | "e.g. Youth conference, 3 Oct, speaker Pastor X, theme Y, 4pm, Main Auditorium" |
| Placeholder (announcement) | "e.g. Choir rehearsal moves to Thursday 6pm from 9 Oct, main hall" |
| Placeholder (quote) | "e.g. "Let your light so shine before men" Matthew 5:16, for Sunday service" |
| Hint (event) | "Write it the way you'd text it: what, when, who, where." |
| Hint (announcement) | "Say what's changing, and when." |
| Hint (quote) | "Put the quote in quote marks and add where it's from." |
| Spots label | "Deloo spots:" chips "Date", "Speaker", "Theme", "Time & venue", "Quote" |
| Primary | "Continue" |

### Step 2: Check details
| Element | Copy |
|---|---|
| Heading | "Here's what Deloo picked up" |
| Sub | "Check these before Deloo makes your designs. Anything empty stays off the design." |
| Status tags | "Found" / "Not found" / "From your last brief" |
| Field labels | "Event name", "Date", "Time and venue", "Theme", "People", "Headline", "Other details", "Quote or scripture", "Reference", "Footer line" |
| People note | "You wrote "{word}". Deloo uses "Ministering:" for speakers. Change it to Host, Anchor or Guest if that fits better." |
| Add person | "+ Add a person" |
| Honorific hint | "Write names with titles as you want them printed: Pastor, Evang., Chief, Alhaji, HRM." |
| Leftovers | "Also in your brief:" + "Add to message" |
| Look heading | "Pick a look" |
| Look captions | "Bold: solid colour background." / "Framed: light background with a border." |
| Brand note | "Grace Harbour Chapel's logo, colours and fonts are set by HQ." |
| Back | "Edit brief" |
| Marigold | "Generate assets" (busy: "Generating…") |
| Replace confirm | "Replace your edited words with a fresh version?" [Replace] [Keep my edits] |

### Generating
| Element | Copy |
|---|---|
| Title | "Making your designs" |
| Lines | "Reading your details" · "Writing the words" · "Fitting 4 sizes to {kit name}'s kit" |
| Live region | "Making your designs." then "Your 4 designs are ready." |

### Step 3: Your designs
| Element | Copy |
|---|---|
| Heading | "Your {Event name} designs are ready" (quote card: "Your quote card designs are ready") |
| Sub | "4 sizes · {Bold/Framed} look · ✓ On-brand: HQ logo, colours and fonts" |
| Look | "Look:" "Bold" "Framed" |
| Size names | "Instagram post" 1080 × 1080 · "Instagram story" 1080 × 1920 · "X / LinkedIn banner" 1500 × 500 · "A5 handbill" 148 × 210 mm |
| Per size | "Download" → "Saving…" → "Saved ✓" → "Download again" |
| All | "Download all 4" · helper "Your browser may ask to allow several downloads." |
| Edit panel | Heading "Edit the words" · sub "Changes update all 4 sizes." |
| Slot labels (replace template terms) | eyebrow → "Small heading" · title → "Event name" · theme → "Theme" · date_line → "Date" · time_venue → "Time and venue" · cta → "Closing line" · headline → "Headline" · body → "Message" · quote → "Quote or scripture" · reference → "Reference" · footer → "Footer line" |
| Reset | "Reset to Deloo's words" |
| Update note | "Updated all 4 sizes" (fades after 1.5 s) |
| HQ group | Heading "Set by HQ" · rows "Logo", "Colours", "Fonts" · note "HQ set these. Ask your org admin to change them." |
| Prototype note (replaces ai-note) | "Prototype: the words come from a sample script, not a real AI yet." |
| Success | "✓ 4 images saved" · "Check your Downloads folder. On a phone, look in Files or Downloads." |
| Which size where | "Post and story: Instagram · Banner: X or LinkedIn · Handbill: print on A5 (148 × 210 mm)" |
| What next | "Need more for this event?" · "Make an announcement" · "Make a quote card" · "Make an event flyer" · quiet "Start a new brief" |
| New brief confirm | "Start again? Your current designs haven't been downloaded." [Start new] [Stay here] |

---

## 6. Motion and feedback guidance (fits design.html v0.2)

Principles: motion explains a change of state; nothing loops except the spinner; nothing bounces;
small distances. Lagoon for progress, Approve for done, Marigold only on the Generate button and focus
rings.

Suggested tokens:
```css
--ease-out: cubic-bezier(.2, .7, .2, 1);
--dur-fast: 120ms;   /* hovers, chip ticks */
--dur-base: 200ms;   /* step change, panel open */
--dur-reveal: 280ms; /* each preview in the reveal */
```

| Moment | Motion | Reduced motion |
|---|---|---|
| Step change | Outgoing state fades out (120 ms). Incoming fades in and rises 8 px (200 ms). Focus moves to the new heading. | Instant swap, focus still moves. |
| "Deloo spots" chip found | Chip fades from Slate outline to Lagoon tint with a ✓ (120 ms). | Instant colour change. |
| "Try an example" | Text fills the box over ~500 ms. | Filled instantly. |
| Look thumbnails | Selected card gets Lagoon border + tint (existing segmented style). Thumbnail re-renders in place, no motion. | Same. |
| Generating | Existing spinner. Each line's ✓ fades in (120 ms) as it completes. | Spinner at 2.4 s duration (design.html rule); ✓ appear instantly. |
| Reveal | Previews fade in + rise 6 px, 70 ms stagger, 280 ms each (total < 600 ms). On-brand line fades in last. | All appear at once. |
| Edit | Previews update on each keystroke. After 600 ms idle, "Updated all 4 sizes" fades in, then out after 1.5 s. | Text shows and hides, no fade. |
| Download | Button text swaps; "Saved ✓" in Approve. Success panel expands (height + fade, 200 ms). | Panel appears instantly. |
| Carry-over | "From your last brief" tags fade in on Step 2. | Instant. |

Implementation: wrap all of the above in `@media (prefers-reduced-motion: no-preference)` or add a
reduced-motion override block like the existing one (lines ~241–244). Never block input during an
animation. Every state change has a text equivalent in an `aria-live="polite"` region.

---

## 7. Assumptions to validate, and questions for the owner

### Assumptions (none of these come from research)

Validation slots from the README: **Week 2** "2–3 cohort fellows run brief → graphic and report what
breaks"; **Week 4** "a real church/ministry media lead produces an actual campaign". Note that the PRD
places the cohort test in Phase 4; see Q1.

| # | Assumption | Used in | How the Week 2 cohort test checks it | Week 4 check |
|---|---|---|---|---|
| A1 | Many volunteers make assets on a phone. | Phone layout, sticky bars, size tabs | Ask each fellow to do one run on their own phone and one on a laptop; note where they get stuck. | Ask the media lead which device their volunteers actually use. |
| A2 | Volunteers write briefs like a text message and find a blank box hard to start. | Step 1 hint, example, "Deloo spots" | Before showing the example, ask each fellow to describe a real or made-up event in their own words. Count how many details the parser finds. Note whether they reach for the example. | Collect the media lead's real brief wording. |
| A3 | Checking the parsed details before generating is worth the extra step. | Step 2 | Note whether fellows correct any field, and time spent on Step 2. Ask: "Did this step help or slow you down?" | Did they catch a real error on Step 2? |
| A4 | Two fixed looks are enough and feel easier than open design controls. | Look picker | Ask: "Did you want to change anything the app didn't let you?" Record what. | Same question on a real campaign. |
| A5 | Finished assets go mainly to social apps, WhatsApp and printers. | Success panel, "Which size where?" | Ask fellows where they would send each file. | Observe where the real campaign was posted/printed. |
| A6 | The HQ lock reads as reassurance, not restriction. | Brand-guardian touchpoints | Ask: "What does the lock mean to you?" before explaining. Note tone of the answer. | Ask the media lead (who plays HQ) and a volunteer separately. |
| A7 | Church users expect "Ministering:" for the speaker and want honorifics kept as typed. | Step 2 people note | Include a speaker in the test brief; ask if the label is right. Fellows may not be the target users, so treat as weak evidence. | Main check: does the media lead accept or change the label? |
| A8 | Volunteers often need more than one asset type for the same event. | "Need more for this event?" | Count how many fellows use it unprompted. | Does the real campaign use more than one category? |
| A9 | The Instagram post is the size most people look at first. | Reveal order, large first preview | Ask which size they'd download first. | Which sizes did the real campaign use? |
| A10 | An event flyer without a date is a mistake, not a choice. | Blocking date error | Ask if they ever post flyers with "date to be announced". | Ask the media lead. |
| A11 | Plain English microcopy works for the first users. | All copy | Note any words fellows ask about. | Note any words the media lead questions. |

### Questions for the owner

| # | Question | Recommendation | How the cohort test could inform it |
|---|---|---|---|
| Q1 | README puts the cohort test in Week 2, PRD puts it in Phase 4. Can fellows test this Phase 1 prototype? | Yes. It's the cheapest point to learn about the journey. | n/a |
| Q2 | Open empty (Step 0) or keep opening on the finished sample? | Empty, with "Try an example" and a `#demo` link for pitches. | Compare first reactions of fellows who start empty vs. from `#demo`. |
| Q3 | Should the mock stop inventing facts (default date "Saturday 3 October", default venue, "Guest Speaker", "Free entry")? | Yes. Empty stays empty; the CTA becomes neutral ("All are welcome"), still editable. | Check whether any fellow downloads a design with a detail they didn't type. |
| Q4 | Block event flyers without a date, or allow "Date to be announced"? | Block in Phase 1; add a TBA option if A10 fails. | A10. |
| Q5 | Keep the test-kit switcher visible for demos, or tuck it under "Prototype controls"? | Tuck it away; it confuses the volunteer role. | Watch whether fellows touch it and what they think it does. |
| Q6 | The README MVP lists a "WhatsApp flyer" size; the Phase 1 plan and prototype have 4 sizes without it. Add it now? | Keep 4 for Phase 1 (exit check); revisit after A5. | A5. |
| Q7 | Should the kit card show the volunteer's unit (e.g. a fictional "Youth Department")? It makes "HQ vs branch" concrete but touches PRD Open Question 6 (sub-brands). | Yes, as a fictional label only, no sub-brand styling. | Ask whether "Set by HQ" makes sense without it. |
| Q8 | Is a staged ~1.2 s "Making your designs" sequence acceptable given the AI is mocked? | Yes, with the Mock AI badge visible; it previews the real Phase 3 wait. | Ask fellows if the wait felt too short/long/fake. |

---

## 8. Implementation notes for Phase 1 (for the main agent)

All changes stay inside `prototype/index.html`. No new files are needed except optionally saving
samples. Keep: `BRAND_KITS`, `SIZES`, `TEMPLATES`, `kitStyle()`, `mockGenerateCopy()`,
`slot-schemas.json` shapes, the `#selftest` hook, and the exit check (3 categories × 4 sizes, edit,
swap template, download, no hard-coded hex in templates).

### Must
1. **State machine.** Add `state.step` with values `start | describe | check | generating | results`.
   Wrap each state in `<section data-step="…" hidden>`; a single `goTo(step)` shows one, updates the
   stepper, moves focus to its `h1/h2` (`tabindex="-1"`), and announces via one `aria-live` region.
2. **Start empty.** Remove the auto-generate on load. Brief textarea starts empty. "Try an example"
   fills the current sample brief and goes to `describe`. `#selftest` and new `#demo` hashes run the
   sample straight to `results` (keep the selftest attribute logic).
3. **Describe step.** Replace the category segmented control with 3 radio cards (same `name="category"`
   values). Category changes only update placeholder/hint here; they **no longer call `generate()`**.
   "Continue" validates non-empty (existing `#brief-error` pattern) and goes to `check`.
4. **Check step.** Call `parseBrief()` and render editable fields per category (table in §3, Step 2)
   into a `state.details` object. Show Found/Not found tags. Speaker → Ministering note. Required-field
   validation: event flyer needs title + date; announcement needs title; quote card needs quote (with
   "Use a sample verse" button). Back link "Edit brief" keeps the text.
5. **Stop inventing facts.** Change `mockGenerateCopy()` to build slots from `state.details` (the
   confirmed values), not from re-parsing, and to drop the fallbacks `"Saturday 3 October"`,
   `"4:00 pm · Main Auditorium"`, `"Guest Speaker"` and `"Free entry"`. Use neutral canned copy for
   AI-written slots only (eyebrow, cta, announcement body, quote default only when the user picks the
   sample). Make templates skip empty `date_line`, `time_venue` and `cta` the way they already skip
   empty `theme` and `roles`.
6. **Look picker with live thumbnails.** On the check step, render two IG-post-sized posters (Bold,
   Framed) using the existing `TEMPLATES[state.category]` at small scale with current details; re-render
   on field input (debounce ~150 ms). Same `name="variant"` values.
7. **Generate + generating state.** Marigold "Generate assets" on the check step only. Show the
   3-line progress card, run `mockGenerateCopy()`, tick lines at ~400 ms intervals, then `goTo('results')`.
8. **Results reveal.** Heading with event name, sub line with look + on-brand confirmation, staggered
   preview fade-in (reduced-motion safe). Friendly size names first, dims second (mono).
9. **Edit panel on results.** Move the slot editor here with the plain-language labels (§5). Keep live
   re-render. Add the "Set by HQ" locked group (logo, swatches, fonts) with the inline "Ask your org
   admin" note. Replace the developer `ai-note` with the one-line prototype note.
10. **Never discard edits silently.** Store slots per category (`state.slotsByCategory`). Re-generating
    after edits asks to replace or keep. Starting a new brief with un-downloaded work asks first.
11. **Download feedback + success panel + what next.** Button states Saving/Saved ✓/Download again.
    Success panel with file name and where to look. Readable file names
    (`deloo-{kit}-{event-slug}-{size}.png`). "Need more for this event?" buttons go to `check` with
    carried details for the other category.
12. **Move the test-kit switcher** into a "Prototype controls" disclosure in the top bar. Switching kit
    re-renders the current state (thumbnails on check, posters on results).
13. **Phone layout (≤ 760 px, matching design.html's breakpoint; current file uses 900 px).** One
    column; sticky bottom action bar holding the step's main button; results use size tabs showing one
    preview at a time; edit panel collapsible below the preview.
14. **Accessibility.** Focus to step heading on each transition; `aria-invalid` + `aria-describedby` on
    errors; stepper as `<nav aria-label="Progress">` with `aria-current="step"`; all motion behind
    reduced-motion checks; 44 px targets on coarse pointers (already in tokens).

### Should
1. "Deloo spots" live chips under the brief box (run `parseBrief()` on input, debounced).
2. Weekday on dates using the next occurrence from today; past-date warning.
3. "Download all 4" with sequential downloads ~300 ms apart and a "Saving 2 of 4…" counter.
4. "Reset to Deloo's words" per field (keep the first generated slots per category).
5. Clickable completed steps in the stepper for back navigation.
6. "Also in your brief" leftovers from `parseBrief().extras` with "Add to message".
7. Large IG post + smaller row layout on desktop results (instead of the equal 2-column grid).
8. Save the in-progress brief and details in `localStorage` (wrapped in try/catch; page must work
   without it) so a reload doesn't lose work.

### Could
1. "Write it again": rotate between 2–3 canned alternatives for AI-written slots (eyebrow, cta,
   announcement body) so regenerate visibly does something. Keep it labelled as mock.
2. Share button using the Web Share API where `navigator.canShare({ files })` is true (feature-detect;
   hide otherwise, likely unavailable from `file://` on many browsers).
3. Click a preview to open it larger in a simple overlay (Esc to close, focus trapped).
4. Ctrl/Cmd + Enter to continue from the brief box.
5. Fictional unit label on the kit card (depends on Q7).

### Keep the exit check passing
After building, re-run the IMPLEMENTATION_PLAN.md Phase 1 exit check: open from `file://`, each of the
3 categories produces 4 sizes from a typed brief, changing one `BRAND_KITS` value restyles everything,
no hex colours in templates, edits and look swaps re-render instantly, every size downloads. Record the
journey change in `PRD.md` §10 Design Refinement Notes.

---

## 9. Later phases (need accounts, the database or the real AI)

- **Signed-in start (Phase 2):** "Welcome back, {name} · {Unit}" with recent briefs and "Continue where
  you left off"; the kit comes from the org, not a switcher.
- **Real understanding (Phase 3):** LLM-parsed details with per-field confidence; "Not sure" state for
  low-confidence fields; real regenerate with saved versions and "Compare with last version".
- **Brief history and versions (Phase 3):** asset versions per brief; restore an earlier version.
- **Occasion intelligence (Phase 4):** honorific suggestions, role-line rules per category, stretch
  categories (Celebration of Life, thanksgiving) as new cards on Step 1.
- **Print hand-off (Phase 4):** print sizes with bleed, printer spec sheet to send on WhatsApp,
  "Download all" as one zip.
- **Campaign mode (Phase 5):** "Make everything for this event" (flyer, announcement, quote card,
  reminder) from one brief, replacing the per-category "Need more for this event?".
- **Tone (Phase 5):** "Sounds like {org}" note explaining the tone source.
- **Plan limits (Phase 5):** export counter and watermark messaging for the Free plan.
- **Post-program:** approval step ("Send to HQ for approval"), HQ compliance view, upload-and-audit,
  WhatsApp-native brief input, multilingual captions.
