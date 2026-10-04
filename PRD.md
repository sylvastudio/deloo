# Deloo — Product Requirements Document

*Deloo* (from Greek δηλόω, *dēloō*: "to make visible, to make known").
Brand-locked posters **and** video for organisations that run on volunteers.

**Status:** v1. Tech stack confirmed by the owner on 27 Sep 2026.
**Source:** `README.md` (product one-pager, name locked 9 Sep 2026). The problem, users, edge and MVP
sections below are copied from it word for word.
**Positioning:** "Not a design tool. A designer and a brand guardian, for organisations that run on
volunteers."

---

## 1. The problem

Every church, ministry department, small brand, school and event runs its social media and print on
one or two overstretched volunteer designers. Output is late, inconsistent (wrong logo version,
off-palette colours, random fonts), and depends on whoever has Canva open that week. The workflow —
brief → copy → design → resize → captions → video cut → print → post — takes 3–5 people.

Generic AI design tools exist and we share that market knowingly. What none of them do is what
volunteer-run, multi-unit organisations actually need.

## 2. Who it's for

- **Primary (validation + first paying users):** church/ministry media teams and departments — reachable
  through the Qubators/LoveWorld network and personal church connections. Especially organisations with
  many branches/departments/cells that all publish separately.
- **Secondary:** small brands, schools with multiple campuses, NGOs with chapters, alumni/association
  bodies, event organisers.

## 3. Our edge (what the existing tools don't do)

1. **Multi-unit brand control.** HQ sets the brand once → zones, branches, departments, cells each
   generate their own posters and videos, but *cannot* break it → HQ gets a compliance view. Enterprise
   DAM tools do this for corporates at enterprise prices; nobody does it for a church with 300 branches
   or an NGO with 40 chapters at ₦-level pricing.
2. **Occasion intelligence (the categories).** Templates that know the local conventions generic tools
   don't: Celebration of Life / obituary, thanksgiving service, naming ceremony, aso-ebi announcement,
   vigil / crusade / convention programme ("Ministering:", "Host:", "Anchor:"), correct honorifics
   (Pastor, Evang., Chief, Alhaji, HRM), "we've moved", "price update", back-to-school, product launch.
   Ship several categories at launch; niche down by usage.
3. **Posters *and* video, same brand kit.** Sermon/talk recording → short clips with on-brand captions
   and quote cards; event brief → countdown reels + stills in every size. One brand kit drives both.
4. **Make it *and* police it.** Generate here, *or* upload the thing a volunteer made in Canva/Corel →
   score against the kit → auto-fix → approve. Compliance tools exist but as separate enterprise
   products; nobody puts guardian + generator in one flow for small orgs.
5. **Design → print in your street.** Flex banner sizes (3×6, 4×8 ft), handbills with bleed, roll-ups,
   plus a printer spec sheet you can WhatsApp to the printer at the junction.

## 4. MVP (what ships by Week 4)

1. **Brand kit** — logo(s), colours, fonts, tone, sample posts. Optional sub-brands (departments).
2. **Brief → assets** — type "Youth conference, 3 Oct, guest speaker X, theme Y" → on-brand copy + a set
   of graphics in the right sizes (IG post/story, WhatsApp flyer, X/LinkedIn banner, A5 handbill).
3. **Occasion categories** — at least 3 at launch (event flyer, announcement post, quote/scripture card;
   stretch: Celebration of Life, thanksgiving).
4. **On-brand by construction** — HTML/SVG templates rendered to PNG/MP4 from brand tokens; the image
   model never touches the logo.
5. **Video (stretch for Week 3)** — brief → short countdown reel; transcript → captioned quote clip.
6. **Edit & export** — swap template, tweak copy, regenerate, download; print spec sheet.

**Out of MVP scope (post-program, per README):** multi-branch hierarchy + compliance dashboard,
upload-and-audit, team seats/approvals, multilingual captions (Yoruba, Hausa, Igbo, Pidgin, French),
WhatsApp-native input.

---

## 5. Tech Stack

> **CONFIRMED 27 Sep 2026.** The LLM provider stays swappable behind `generateCopy()` in case the
> program standardises on a different one (see Open Questions).

| Layer | Choice | Why it fits Deloo |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript + Tailwind** | Templates are React/JSX components, so the same component draws the live preview in the browser and the server-rendered PNG. That is what "on-brand by construction" needs. |
| Database | **Postgres via Supabase** | The org → unit (branch/department) → brief → asset structure is relational, and Postgres row-level security can later enforce "branches cannot break the brand" in the database itself. |
| Authentication | **Supabase Auth (email magic link + password)** | It lives in the same service as the database, so a user's org/role is checked by RLS policies without a separate auth system. Magic links suit volunteers who log in rarely. |
| File storage | **Supabase Storage** | Logos, fonts, sample posts and exported PNGs live in buckets scoped per organisation, under the same RLS rules as the data. |
| AI / LLM | **Anthropic Claude (Claude Sonnet 5) with JSON-schema structured output**, behind a thin `generateCopy()` interface | The LLM only fills template slots (headline, date line, "Ministering:/Host:" roles, honorifics, captions) as validated JSON. It never draws, so the logo and palette can't drift. The interface keeps a swap to OpenAI to one file if the program standardises on it. |
| Image rendering | **Satori (JSX → SVG) + resvg-js (SVG → PNG)** | Deterministic, fast, and needs no headless browser. Brand tokens (colours, fonts, logo file) go straight into the SVG, so every size is exact. **Playwright** is the fallback only if a template needs CSS that Satori doesn't support. |
| Video (MVP stretch) | **Remotion** | Video templates are React too, so countdown reels and quote clips reuse the same brand tokens and components as the posters. |

**What runs locally for now (no deployment yet):**

- **Phase 1:** a single `prototype/index.html` opened straight from disk. No server, no database, no API keys.
- **Phase 2 onward:** everything runs on the developer's machine. That means the Next.js dev server
  (`localhost:3000`), plus Postgres, Auth and Storage through the **Supabase CLI local stack (Docker)**,
  plus PNG rendering inside Next.js route handlers.
- **The only outbound network call** is the LLM API from Phase 3 on. It uses a key kept in `.env.local`,
  and that file is never committed.
- **Not set up yet:** Vercel hosting, a hosted Supabase project, custom domain (deloo.space), payments.

### Decision note: file storage (27 Sep 2026)

**Decision:** Use **Supabase Storage** for all Deloo files (logos, fonts, sample posts, exported PNGs,
print files, and video later).

**Why:**
- It runs locally from the same `supabase start` command as the database and auth. There is no extra
  service or key.
- Every file is also a row in Postgres (`storage.objects`), so the **same RLS rules** that protect the
  data protect the files. This lets the database itself enforce "volunteers can't change the logo".
- Private buckets and signed URLs (links that expire) cover sharing exports without making them public.

**Alternatives considered:** Cloudflare R2, AWS S3, Cloudinary, Vercel Blob, UploadThing, Firebase
Storage, MinIO/local disk. None of them combines local-first development with shared auth and
access rules. Vercel Blob and UploadThing are cloud-only. Cloudinary's automatic transformations work
against "the image model never touches the logo".

**Watch / revisit:** Print-resolution flex banners and video may exceed the default 50 MB upload limit
(see Open Question 8). If download costs matter after deployment, **Cloudflare R2** is the fallback.
Both are S3-compatible, so the move stays small.

---

## 6. Accounts & Data

### Accounts and roles

| Role | Scope | Can do (MVP) |
|---|---|---|
| **Org Admin** (HQ) | One organisation | Create and edit the brand kit and sub-brands, choose which templates/categories are enabled, invite members, see every brief and asset in the org. |
| **Branch / Department Volunteer** | One unit inside an org | Create briefs, generate/edit/regenerate/download assets using the brand kit set by HQ. **Cannot** edit logos, colours or fonts. |

Post-MVP roles (from the README's post-program list, not specified yet): **Approver** (for team
seats/approvals) and **zone/regional admin** (for the multi-branch hierarchy). See Open Questions.

### Main data entities

| Entity | Key fields | Notes |
|---|---|---|
| **Organisation** | id, name, plan (free / pro / network), created_at | The tenant. Every other row belongs to one. |
| **Unit** | id, org_id, parent_unit_id, name, type (branch / department / cell) | Branch or department. `parent_unit_id` keeps room for the post-MVP hierarchy. The MVP uses one level. |
| **Membership** | user_id, org_id, unit_id, role | Links a Supabase Auth user to an org/unit with a role. |
| **Brand Kit** | id, org_id, unit_id (null = master kit), logos[], colours{primary, secondary, accent, text, bg}, fonts{heading, body}, tone (text), sample_posts[] | One master kit per org. A sub-brand kit (department) inherits from the master and overrides only what HQ allows. |
| **Template** | id, category, name, sizes[], slots schema (JSON), component key | Code-defined layout plus a data row. `slots schema` is the JSON shape the LLM must fill. |
| **Category (occasion)** | key, label, slot conventions (e.g. "Ministering:", "Host:", honorific list) | MVP: event flyer, announcement post, quote/scripture card. |
| **Brief** | id, org_id, unit_id, author_id, category, raw text, structured fields (event, date, speaker, theme…), status | What the volunteer typed, plus the parsed result. |
| **Asset** | id, brief_id, template_id, size (ig_post / ig_story / whatsapp / x_banner / a5_handbill / print sizes), copy JSON, file path, version, created_at | One rendered output. Regenerating creates a new version and keeps the old one. |
| **Print Spec** | asset_id, physical size, bleed, DPI, colour note | Produces the spec sheet sent to the printer. |

### Files stored (Supabase Storage, one folder per organisation)

| Bucket | Contents | Written by |
|---|---|---|
| `brand/` | Logo files (SVG preferred, PNG accepted), font files if uploaded, sample posts | Org Admin |
| `exports/` | Rendered PNGs, one per asset per size | Render pipeline |
| `print/` | Print-resolution exports with bleed, plus spec sheets | Render pipeline |
| `video/` (stretch) | Rendered MP4s, uploaded transcripts | Render pipeline / volunteer |

---

## 7. Implementation Plan

Phases 1–4 roughly follow the README's QAF weeks 1–3. Phase 5 covers the Week 4 hardening and
validation work, **kept local**. Whether Week 4 still requires deployment is an Open Question.

### Phase 1 — Single-page local prototype (no keys, no server)

**Goal:** Test the core loop (brand kit + brief → on-brand graphics in 4 sizes) in the browser, before
building any backend.

**Tasks:**
1. Create `prototype/index.html`, one self-contained file. Put its CSS/JS inline, with at most a CDN
   script for PNG export.
2. Hard-code a **clearly labelled fictional test brand kit** (placeholder logo SVG, 5 colours, 2 Google
   Fonts, a tone line) as a JS object. Apply its colours and fonts as CSS custom properties.
3. Build the 3 MVP category templates (event flyer, announcement post, quote/scripture card) as HTML
   layouts driven only by brand tokens and slot data.
4. Add a brief text box and category picker. On submit, return a **mocked LLM response**: a canned
   JSON object per category in the exact slot schema planned for Phase 3.
5. Render each result in 4 sizes side by side (IG post 1080×1080, IG story 1080×1920, X banner
   1500×500, A5 handbill ratio). Let the user edit copy inline and swap templates.
6. Add "Download PNG" per size using client-side export.

**Done when:** Opening the file from disk (no server, no keys) lets a user type a brief, pick any of the
3 categories, see 4 correctly sized graphics that use only the kit's logo, colours and fonts, edit the
copy, swap templates and download a PNG.

### Phase 2 — Local app foundation (accounts, brand kit)

**Goal:** Make the prototype a real local app with accounts and a saved brand kit.

**Tasks:**
1. Scaffold Next.js + TypeScript + Tailwind. Start the Supabase CLI local stack. Add `.env.example`.
2. Write SQL migrations for the Section 6 entities, with RLS policies scoped by org and role.
3. Wire up Supabase Auth: sign-up creates an Organisation and makes the user its Org Admin. The admin
   can invite a Volunteer to a Unit.
4. Build brand kit CRUD. Logo/font upload goes to `brand/`, colours use pickers, fonts come from a list
   or upload, plus tone text. Volunteers get a read-only view.
5. Port the Phase 1 templates into React components that read the saved brand kit.

**Done when:** Locally, an admin can sign up, build a brand kit and invite a volunteer. The volunteer can
log in and see the kit's live template previews, but a direct API/DB attempt to edit the kit is
rejected by RLS.

### Phase 3 — Real AI copy + server-side rendering

**Goal:** Turn briefs into stored, rendered PNGs using the real LLM.

**Tasks:**
1. Put `generateCopy(brief, category, brandKit)` behind a provider interface. Call the LLM with a
   JSON schema per category and validate the response. On invalid output, retry once, then show an
   error.
2. Parse the free-text brief into structured Brief fields (event, date, speaker, theme) and save it.
3. Render every size server-side with Satori + resvg. Upload to `exports/` and create Asset rows.
4. Add edit & regenerate: editing copy re-renders without calling the LLM. Regenerate calls the LLM
   again and saves a new Asset version.
5. Log each LLM call's tokens and cost locally, so the Phase 5 cost controls start from real numbers.

**Done when:** A volunteer types "Youth conference, 3 Oct, guest speaker X, theme Y", gets back
validated copy and 4 stored PNGs that match the kit, can edit and regenerate, and the logo file in every
output is byte-identical to the uploaded one.

### Phase 4 — Occasion intelligence, print & export

**Goal:** Deliver the local-conventions and print hand-off parts of the edge.

**Tasks:**
1. Add category conventions to config: role lines ("Ministering:", "Host:", "Anchor:") and the honorific
   list (Pastor, Evang., Chief, Alhaji, HRM). The LLM prompt and output validation both enforce them.
2. Add print sizes: A5 handbill with bleed, flex banners 3×6 ft and 4×8 ft, roll-up. Export at print
   resolution to `print/`.
3. Generate a printer spec sheet (size, bleed, resolution, colour note) as a PNG that can be shared on
   WhatsApp.
4. Add "download all" (zip of every size for a brief).
5. Stretch categories: Celebration of Life, thanksgiving.
6. Have 2–3 cohort fellows run brief → graphic and record what breaks (README validation plan, Week 2).

**Done when:** All 3 launch categories produce correct role lines and honorifics from a brief, a print
export plus spec sheet can go straight to a printer, and the fellows' feedback is logged with each issue
either fixed or listed as a known issue.

### Phase 5 — Tone, campaigns, video stretch, hardening & validation (still local)

**Goal:** Make output sound like the organisation, add the stretch features, and get a real-world
validation.

**Tasks:**
1. Add retrieval over the brand kit's tone text and sample posts (README Week 3 "RAG over brand
   guidelines/past posts"), so generated copy follows the org's voice.
2. Build the campaign agent: one brief produces a full multi-asset set (announcement, flyer, quote card,
   reminder) in all sizes.
3. **Video (stretch):** one Remotion template (countdown reel *or* captioned quote clip) using the same
   brand tokens.
4. Add hardening: per-org rate limits, a monthly export cap for the Free plan, and a watermark on Free
   exports (README revenue model).
5. **Validation:** a real church/ministry media lead produces an actual campaign for a real event and
   gives documented feedback.
6. Write setup docs so the app can be run locally from a clean clone.

**Done when:** The validation user has made a real campaign on the local app and their feedback is
recorded, Free-plan limits and watermarks are enforced, and a fresh clone runs following the docs.

---

## 8. Open Questions

1. **Which 3 categories first?** The README's likely set is event flyer, announcement post and
   quote/scripture card. This PRD assumes that set.
2. **LLM provider:** the program's standard is still to be confirmed in Week 1. Claude is the
   confirmed pick, and OpenAI can be swapped in behind the interface if the program requires it.
3. **Validation user:** who? (README: _TBD_)
4. **Deployment vs Week 4:** the README's Week 4 row says "Deployed MVP", but this PRD keeps everything
   local for now. When does hosting (Vercel + hosted Supabase) come in, and is it required for
   certification?
5. **Roles in the MVP:** is Org Admin + Volunteer enough for Week 4, or does the validation user need an
   approver step before "team seats/approvals" arrive post-program?
6. **Sub-brands:** can a department's kit override colours/fonts, or only add a department logo/name?
7. **Fonts:** will orgs upload their own font files (licensing questions), or pick from a fixed set of
   free web fonts?
8. **Print output format:** is PNG enough for printers, or do flex banners need PDF? What resolution do
   local printers expect at 3×6 / 4×8 ft?
9. **Pricing amounts** for Free / Pro / Network. The README defines the tiers but gives no figures.
10. **`competitors.md`** is referenced in the README but isn't in this folder yet.
11. **QAF product form** is still _pending_ per the README.

---

## 9. Agent Steering Notes

| Date | Instruction I gave | Why | Result (file/section changed) | How I verified |
|---|---|---|---|---|
| 27 Sep 2026 | Prototype should be a journey: onboarding questions (organisation, type), pick poster types with "coming soon" and an "other" request form, pick sample designs; then a blank canvas with pointers (upload logo → choose type → describe in chat); a generating animation (blur to sharp); tabs to choose the version to download. Styles from my reference folder, text-only for now. Designs adapt to the church's brand/logo colours (adjustable) but keep their core design language. Chat accepts free-form, steered by fields while mocked. Grain on by default, optional. | The first prototype was one static dashboard; users weren't carried along. | `prototype/index.html` rebuilt: 4-step onboarding, dashboard (brand rail, canvas, chat), 7 poster types + 8 coming soon, 9 text-only styles × 4 sizes, logo colour extraction, option and size tabs, PNG download with embedded fonts. Mock no longer invents missing details. `docs/ux/phase-1-journey.md` added (partly superseded, see its header). | 4 Oct 2026: headless Chrome drove the real UI from `file://`. All 7 types went from typed brief to 4 sizes, and all 28 Download PNG files were saved at the right dimensions with no page errors (IMPLEMENTATION_PLAN Phase 1 exit check). |
| 4 Oct 2026 | "I also want this as a PWA with mobile UI so we can test on phone." | Testing has to happen on volunteers' phones, not only on a desktop browser. | `prototype/manifest.webmanifest`, `prototype/sw.js` (cache-first shell, fonts and image library cached after first use), `prototype/icons/`. Below 760 px the dashboard shows one panel at a time with a Chat / Design / Brand bottom tab bar, an unread dot on Chat, and automatic jumps to the panel where the next step happens. The service worker registers only over http(s), so `file://` still works. | Headless Chrome at 390×844: no horizontal overflow, all three panels screenshotted. Over localhost the service worker activates, the manifest parses, and the app reloads offline. The only installability error is `in-incognito`, which is expected in a test browser. |
| 4 Oct 2026 | "Let's integrate all and start setting up for launch", using free or low-cost APIs first (Supabase, Gemini/Groq free tiers, then Unsplash, Google Fonts, Paystack test mode, Resend, Turnstile, PostHog, Sentry). | Start real testing at no cost. The local Docker stack doesn't fit this machine (under 1 GB disk free, very slow network). | Phase 2 uses a **hosted Supabase free-tier project** instead of the local Docker stack (§5 said local first). AI layer `lib/ai/` (mock / gemini / groq behind one interface, shared prompt, schema validation, one retry, `AI_FALLBACK`) and `POST /api/understand` were brought forward from Phase 3. `docs/external-services.md` added. | `npm run check:ai` passes on mock (7 examples plus the no-invention case). Gemini and Groq are untested until keys are added. |
| 4 Oct 2026 | "I want it on Netlify", "keep pushing to main", production domain deloo.space. Then "proceed" with the brand kit editor and the design flow, rendering PNGs in the browser. | Get a live, testable app without paying for a render server. | **Hosting is Netlify** (§5 said Vercel): `netlify.toml` (Node 22, `@netlify/plugin-nextjs`, secrets scan skips the Turbopack cache). Work goes straight to `main`. **Phase 3 render decision: client-side**, not Satori/Playwright. `lib/posters/` ports the prototype's palette maths, content mapping and 9 style renderers, `app/posters.css` copies its poster CSS, and `components/poster.tsx` fits and scales posters. PNGs come from `html-to-image` with embedded fonts. Brand kit editor at `/brand-kit`: logo upload straight to the `brand` bucket, logo colours, pickers and presets, tone, grain, and live previews (read-only for volunteers). Design flow: `/designs/new` (type → brief → AI fields → check) and `/designs/[id]` (3 style options, 4 sizes, live edits without the AI, re-read brief, download). Each download is saved to `exports/` and recorded as an `assets` row. Fonts aren't editable yet because the styles use fixed type. | Netlify deploy live, groq 11/11 on `check:ai`, `check:rls` 23/23. Headless Chrome on localhost with the seeded test org: kit save with logo upload, AI brief → design, live edit, 4 downloads at exact sizes (1080², 1080×1920, 1500×500, 874×1240) each recorded as an asset, volunteer kit read-only and blocked from an HQ design. No horizontal overflow at 390 px. Test kit restored afterwards. |

## 10. Design Refinement Notes

| Date | Instruction I gave | Why | Result (file/section changed) | How I verified |
|---|---|---|---|---|
| 27 Sep 2026 | "Make the fonts a bit lighter and less bold; the borders around focused buttons are too big, make them lighter; I'm leaning towards smaller font weight and smaller elements." | v0.1 felt too heavy: bold type, thick 3px focus rings, large controls. | `design.html` v0.1 → v0.2 (commit `10bf106`): heading weights 700–800 → 500–600; buttons/labels bold → medium; body font switched to Atkinson Hyperlegible Next (variable weights); focus ring 3px solid → 2px softened gold; type scale reduced (display 56 → 44, H1 40 → 32, H2 28 → 24, H3 20 → 18, body 16 → 15 px); buttons 34/44/52 → 30/38/44 px, inputs 14px text with 1px border; colour chips 104 → 72 px in a 4-column grid. Kept 44px controls on touch screens and 16px input text on phones for tap size and to stop iOS zoom. | |
| 4 Oct 2026 | (Agent, Phase 1 exit check) Remove hard-coded colours from poster templates. | The exit check requires no hex values in templates, so every colour follows the brand palette. | `prototype/index.html`: the ticket slot metal, pinned-note pin and billboard post/rail greys now derive from the palette ink (`--metal-*`, `--prop-*`, `--pin-*`, `--post-*` in `posterVars()`). They look the same on the default palette and pick up a tint on others. | A search of the poster CSS and renderers finds 0 hex values. Samples re-rendered (contact sheet). |
