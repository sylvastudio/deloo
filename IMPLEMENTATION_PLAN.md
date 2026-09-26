# Deloo — Implementation Plan

**Source:** `PRD.md` §5–7. This plan breaks each PRD phase into ordered steps. Every step names the
files, tables, routes or records it must produce.
**Stack:** the PRD's tech stack, confirmed 27 Sep 2026 (Next.js + TypeScript + Tailwind, Supabase local stack,
Claude with structured output, Satori + resvg, Remotion). If the stack changes, the outputs in
Phases 2–5 change with it.
**Deployment:** none. Every phase runs on the developer's machine.

**Rules for every phase**
- A phase starts only after the previous phase's **Exit check** passes.
- Each step is one or more commits. Every phase ends with a git tag (`phase-1` … `phase-5`).
- Each phase adds an entry to `PRD.md` §9 Agent Steering Notes for any instruction that changed the
  plan, and to §10 Design Refinement Notes for any visual/template change.
- Test data is fictional and labelled `TEST DATA`. No real organisation's logo or name is used without
  permission.

---

## Phase 1 — Single-page local prototype

**Goal:** Prove the core loop (brand kit + brief → on-brand graphics in 4 sizes) in one HTML file, with
no server, no database and no API keys.

| # | Step | Concrete output |
|---|---|---|
| 1.1 | Create the prototype file with inline CSS/JS | `prototype/index.html` |
| 1.2 | Define the test brand kit as a JS object: placeholder logo SVG, 5 colours, 2 Google Fonts, tone line | `const BRAND_KIT = {…}` in `index.html`; colours and fonts exposed as CSS custom properties (`--brand-primary`, `--font-heading`, …) |
| 1.3 | Define the slot schema per category. The same shape is reused as the LLM JSON schema in Phase 3. | `const SLOT_SCHEMAS = { event_flyer, announcement, quote_card }`, also copied to `prototype/slot-schemas.json` |
| 1.4 | Write mocked AI output: one canned JSON response per category that matches its schema | `const MOCK_RESPONSES = {…}`; a `mockGenerateCopy(brief, category)` function with a 600 ms fake delay |
| 1.5 | Build 3 templates that use only brand tokens and slot data (no hard-coded colours or fonts) | `renderEventFlyer()`, `renderAnnouncement()`, `renderQuoteCard()` |
| 1.6 | Build the UI: brief textarea, category picker, 4-size preview grid, inline copy editing, template swap, "Download PNG" per size | Preview at IG post 1080×1080, IG story 1080×1920, X banner 1500×500, A5 handbill (148×210 mm ratio); PNG export via one CDN library (`html-to-image`) |

**Exit check (done when):**
- [ ] Opening `prototype/index.html` from disk (`file://`) works with no server and no keys.
- [ ] Each of the 3 categories produces 4 correctly sized previews from a typed brief.
- [ ] Changing a single value in `BRAND_KIT` restyles every template. A search of the templates finds no
      hard-coded hex colours.
- [ ] Copy edits and template swaps re-render instantly, and every size downloads as a PNG.
- [ ] 12 sample PNGs are saved (3 categories × 4 sizes) in `prototype/samples/`.

**Tag:** `phase-1`

---

## Phase 2 — Local app foundation (accounts + brand kit)

**Goal:** Turn the prototype into a real local app with accounts, roles and a saved brand kit.

| # | Step | Concrete output |
|---|---|---|
| 2.1 | Scaffold the app | `app/` (Next.js App Router, TypeScript, Tailwind), `package.json`, `.env.example`, `.gitignore` (ignores `.env.local`) |
| 2.2 | Start the local Supabase stack | `supabase/config.toml`; `npx supabase start` runs Postgres, Auth and Storage in Docker |
| 2.3 | Write the schema migrations for PRD §6 | `supabase/migrations/0001_core.sql` creating `organisations`, `units`, `memberships`, `brand_kits`, `categories`, `templates`, `briefs`, `assets`, `print_specs` |
| 2.4 | Write row-level security policies: org isolation, and admin-only writes to `brand_kits` | `supabase/migrations/0002_rls.sql` |
| 2.5 | Seed test data | `supabase/seed.sql`: 1 test org, 2 units, 1 admin, 1 volunteer, 3 categories, 3 templates |
| 2.6 | Build auth and org onboarding | `/login`, `/signup` (sign-up creates the org and makes the user its admin), `/settings/members` (admin invites a volunteer to a unit) |
| 2.7 | Build brand kit CRUD with uploads | `/brand-kit` page (editable for admins, read-only for volunteers); uploads go to Storage `brand/{org_id}/…` |
| 2.8 | Port the templates to React | `components/templates/EventFlyer.tsx`, `Announcement.tsx`, `QuoteCard.tsx`, all taking `{ brandKit, slots, size }` props; `lib/sizes.ts` |

**Exit check (done when):**
- [ ] `npx supabase db reset` followed by `npm run dev` gives a working app with the seed data.
- [ ] An admin can sign up, build a kit and upload a logo. A volunteer can log in, see the kit and see
      live template previews.
- [ ] A volunteer trying to update `brand_kits` directly (script in `scripts/rls-check.ts`) is refused
      by RLS.
- [ ] Two orgs in the seed data cannot see each other's rows or files.

**Tag:** `phase-2`

---

## Phase 3 — Real AI copy + server-side rendering

**Goal:** Turn a free-text brief into validated copy and stored PNGs, using the real LLM.

| # | Step | Concrete output |
|---|---|---|
| 3.1 | Build the LLM provider interface | `lib/ai/provider.ts` (interface), `lib/ai/claude.ts` (implementation), `lib/ai/mock.ts` (reuses the Phase 1 mocks); switched by `AI_PROVIDER=claude|mock` |
| 3.2 | Validate responses against the slot schemas | `lib/ai/schemas.ts` (Zod, generated from `slot-schemas.json`); on invalid output, retry once and then return a typed error |
| 3.3 | Parse briefs and save them | `POST /api/briefs`: free text → structured fields (event, date, speaker, theme) → `briefs` row |
| 3.4 | Render PNGs server-side | `lib/render/renderPng.ts` (Satori → resvg); `POST /api/briefs/{id}/render` writes every size to `exports/{org_id}/{brief_id}/…` and inserts `assets` rows |
| 3.5 | Build edit & regenerate | `/briefs/{id}` page: editing copy re-renders with no LLM call; "Regenerate" calls the LLM and saves the next `assets.version` |
| 3.6 | Log LLM cost | `llm_calls` table (org, model, input/output tokens, estimated cost, latency) in `supabase/migrations/0003_llm_calls.sql` |

**Exit check (done when):**
- [ ] The PRD example brief ("Youth conference, 3 Oct, guest speaker X, theme Y") produces schema-valid
      copy and 4 stored PNGs.
- [ ] Running the same flow with `AI_PROVIDER=mock` still works with no API key.
- [ ] A test (`tests/logo-integrity.test.ts`) confirms the logo inside a rendered SVG is byte-identical
      to the uploaded file.
- [ ] A forced invalid LLM response is retried once and then shown as an error, and nothing broken is
      saved.
- [ ] `llm_calls` has a row for every real call.

**Tag:** `phase-3`

---

## Phase 4 — Occasion intelligence, print & export

**Goal:** Deliver the local-conventions and print hand-off parts of the PRD edge, then run the first
outside test.

| # | Step | Concrete output |
|---|---|---|
| 4.1 | Put category conventions in config | `config/categories/*.json`: role lines ("Ministering:", "Host:", "Anchor:"), honorific list (Pastor, Evang., Chief, Alhaji, HRM), required/optional slots |
| 4.2 | Enforce conventions in the prompt and in validation | Prompt builder `lib/ai/prompt.ts` reads the category config; the validator rejects missing role lines or unknown honorifics |
| 4.3 | Add print sizes | `lib/sizes.ts` gains `a5_handbill_bleed`, `flex_3x6ft`, `flex_4x8ft`, `rollup`; exports go to `print/{org_id}/…` (resolution set once Open Question 8 is answered) |
| 4.4 | Generate a printer spec sheet | `components/templates/PrintSpecSheet.tsx`, rendered to PNG, plus a `print_specs` row per print asset |
| 4.5 | Add "download all" | `GET /api/briefs/{id}/zip` returns a zip of every size plus the spec sheet |
| 4.6 | Run the cohort test with 2–3 fellows (PRD validation plan) | `docs/validation/cohort-test.md`: a row for each fellow, brief used, what broke, fix / known issue |

**Stretch:** `config/categories/celebration_of_life.json`, `thanksgiving.json` plus their templates.

**Exit check (done when):**
- [ ] A brief with "Pastor"/"Evang." and "Ministering:/Host:" details produces correctly formatted
      role lines and honorifics in all 3 launch categories.
- [ ] A print export and its spec sheet download together as one zip.
- [ ] Every issue in `docs/validation/cohort-test.md` is either fixed (with a commit link) or marked as
      a known issue.

**Tag:** `phase-4`

---

## Phase 5 — Tone, campaigns, video stretch, hardening & validation (still local)

**Goal:** Make copy sound like the org, turn one brief into a whole campaign, enforce plan limits, and
validate with a real media lead.

| # | Step | Concrete output |
|---|---|---|
| 5.1 | Add tone retrieval | `brand_kit_chunks` table with pgvector (`0004_tone.sql`); `lib/ai/tone.ts` fetches the relevant tone text and sample-post captions into the prompt |
| 5.2 | Build the campaign agent | `POST /api/campaigns`: one brief → announcement, flyer, quote card and reminder in all sizes; `campaigns` table linking the briefs |
| 5.3 | **Stretch:** video template | `video/CountdownReel.tsx` *or* `video/QuoteClip.tsx` (Remotion), rendered to `video/{org_id}/…mp4` |
| 5.4 | Enforce plan limits | `lib/limits.ts`: per-org rate limit, Free monthly export cap, Free watermark in the render pipeline (amounts wait on Open Question 9; placeholders for now) |
| 5.5 | Run real-world validation | `docs/validation/real-campaign.md`: the validation user's event, the assets they made, their documented feedback, follow-up actions |
| 5.6 | Write docs for a clean clone | `docs/SETUP.md` (prerequisites, `supabase start`, seed, env, run); architecture diagram in `docs/ARCHITECTURE.md` |

**Exit check (done when):**
- [ ] Two test orgs with different tone text get noticeably different copy for the same brief (side by
      side in `docs/validation/tone-check.md`).
- [ ] One brief produces a full campaign in a single request.
- [ ] A Free-plan org hits its export cap and receives watermarked output.
- [ ] `docs/validation/real-campaign.md` holds real feedback from the validation user (Open Question 3).
- [ ] A fresh clone that follows `docs/SETUP.md` runs end to end on another machine.

**Tag:** `phase-5`

---

## Blocked by Open Questions (PRD §8)

| Open Question | Blocks |
|---|---|
| 1. First 3 categories | Phase 1 step 1.5 (assumes event flyer, announcement, quote card) |
| 2. LLM provider | Phase 3 step 3.1 implementation file (the interface is unaffected) |
| 3. Validation user | Phase 5 step 5.5 |
| 4. Deployment timing | Anything after Phase 5 (hosting is not in this plan) |
| 6. Sub-brand overrides | Phase 2 steps 2.4 and 2.7 (RLS and UI for department kits) |
| 7. Font uploads | Phase 2 step 2.7 (upload vs picker) |
| 8. Print format/resolution | Phase 4 step 4.3 |
| 9. Pricing amounts | Phase 5 step 5.4 (limits use placeholders) |
