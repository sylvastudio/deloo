# Deloo — one person, a whole media team

*Deloo* (from Greek δηλόω, *dēloō*: "to make visible, to make known").
Brand-locked posters **and** video for organisations that run on volunteers.

**Status:** Concept (name locked 9 Sep 2026). QAF product form: _pending_.
**Bucket:** Smart Utilities (generators / business utilities / AI assistants). Secondary: Impact & Innovation.
**Track:** Income-Generating (SaaS). Secondary: Ecosystem Systems / Agenda-Driven (multi-branch ministries).
**Domain:** deloo.space (primary; .online/.site/.world also open as of 9 Sep 2026).

## The problem

Every church, ministry department, small brand, school and event runs its social media and print on
one or two overstretched volunteer designers. Output is late, inconsistent (wrong logo version,
off-palette colours, random fonts), and depends on whoever has Canva open that week. The workflow —
brief → copy → design → resize → captions → video cut → print → post — takes 3–5 people.

Generic AI design tools exist and we share that market knowingly. What none of them do is what
volunteer-run, multi-unit organisations actually need.

## Who it's for

- **Primary (validation + first paying users):** church/ministry media teams and departments — reachable
  through the Qubators/LoveWorld network and personal church connections. Especially organisations with
  many branches/departments/cells that all publish separately.
- **Secondary:** small brands, schools with multiple campuses, NGOs with chapters, alumni/association
  bodies, event organisers.

## Our edge (what the existing tools don't do)

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

Positioning: **"Not a design tool. A designer and a brand guardian, for organisations that run on
volunteers."**

## MVP (what ships by Week 4)

1. **Brand kit** — logo(s), colours, fonts, tone, sample posts. Optional sub-brands (departments).
2. **Brief → assets** — type "Youth conference, 3 Oct, guest speaker X, theme Y" → on-brand copy + a set
   of graphics in the right sizes (IG post/story, WhatsApp flyer, X/LinkedIn banner, A5 handbill).
3. **Occasion categories** — at least 3 at launch (event flyer, announcement post, quote/scripture card;
   stretch: Celebration of Life, thanksgiving).
4. **On-brand by construction** — HTML/SVG templates rendered to PNG/MP4 from brand tokens; the image
   model never touches the logo.
5. **Video (stretch for Week 3)** — brief → short countdown reel; transcript → captioned quote clip.
6. **Edit & export** — swap template, tweak copy, regenerate, download; print spec sheet.

Post-program: multi-branch hierarchy + compliance dashboard, upload-and-audit, team seats/approvals,
multilingual captions (Yoruba, Hausa, Igbo, Pidgin, French), WhatsApp-native input.

## Why this can be a business

- **Market size:** tens of thousands of churches/ministries in Nigeria alone, plus schools, NGOs, brands,
  events — far past the 5,000-payer threshold.
- **Competition:** crowded at the generic "AI graphics" level (we share it); empty at "multi-unit brand
  control + local occasion intelligence + print handoff for volunteer-run orgs."
- **Monetization clarity:** these orgs already pay designers, Canva Pro and printers.
- **Buildability:** template rendering + LLM structured output sits squarely inside the QAF curriculum.

**Revenue model (initial):**
- Free — limited exports/month, watermark
- Pro — per-organisation monthly subscription: unlimited exports, all categories, all sizes, video
- Network — per-branch pricing for multi-unit organisations, compliance dashboard, seats, approvals

## Mapping to the QAF 4-week plan

| Week | Program deliverable | Deloo milestone |
|---|---|---|
| 1 | Dev env + AI-generated architecture + defined scope | Repo, stack chosen, brand-kit data model, 3 templates designed, architecture doc |
| 2 | Functional UI + backend + working AI interaction | Brand kit CRUD → brief → LLM structured output (copy + template slots) → rendered PNGs in 4 sizes |
| 3 | Core intelligent features aligned with product value | RAG over brand guidelines/past posts for tone; agent generates a full multi-asset campaign; first video template (countdown reel or captioned quote clip) |
| 4 | Deployed MVP + validated + demo-ready | Auth, rate limits, cost controls, hosting, docs, pitch; **a real church/ministry media lead produces a live campaign and gives feedback** |

## Proposed stack (confirm in Week 1)

- Next.js + Tailwind (web app; templates as HTML/SVG components) · Cursor as editor · GitHub
- LLM API (Claude or OpenAI — whichever the program standardises on) with structured/JSON output
- Server-side HTML/SVG → PNG (satori/resvg or Playwright); video via Remotion or ffmpeg templates
- Supabase (auth, DB, storage for logos/exports) · Vercel (hosting)

## Validation plan

- Week 2: 2–3 cohort fellows run brief → graphic and report what breaks
- Week 4: one real church/ministry media lead produces an actual campaign for a real event and gives
  documented feedback (certification "validated product" requirement)
- Validation user: _TBD — name/role here once confirmed_

## Ownership note

Per the MOU (§4), ownership of program builds is shared with Qubators on terms to be agreed later. Keep
dated records (this repo's git history, design docs) from day one, and get specific commercial terms in
writing before scaling anything post-program.

## Name & domain notes

- Chosen 9 Sep 2026 over EveryBulletin / Praeco / Kerysso. Rejected names and why: see git history
  (OnBrand — generic and crowded; Okwa/Ikede — user preferred English/coined).
- Verified 9 Sep 2026: no company/app called "Deloo" found; deloo.space/.online/.site/.lol/.fit/.world
  all unregistered; deloo.app unregistered; deloo.com registered (parked).
- To do: Nigerian trademark registry search; grab @deloo handles (Instagram, X, TikTok).

## Related docs

- `competitors.md` — full competitor map, pricing, gaps, and the study plan (run the same brief
  through each tool; record results in `resources/competitor-tests/`).

## Open questions

- Which 3 categories first? (event flyer, announcement post, quote/scripture card is the likely set)
- Program's standard LLM provider (ask in Week 1)
- Validation user — who?
