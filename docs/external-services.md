# Deloo: external services we may use

**Status:** draft for discussion, 4 Oct 2026. Nothing below is signed up for or wired in, except where
"Chosen" says so. Check prices and terms when you sign up; they change often.
**Rule that shapes every AI choice (PRD §4.4):** layout, logo and brand colours come from our own
templates. Image models may only make *backgrounds, illustrations and edits*. They never draw or
recolour the logo.

Legend: **MVP** = needed by Week 4 · **Next** = right after the program · **Later** = when usage justifies it.

## 1. AI for copy (writing the words on the poster)

| Service | Use in Deloo | When |
|---|---|---|
| **Anthropic Claude** (Chosen, PRD §5) | Brief → slot JSON (headline, date line, "Ministering:/Host:", honorifics, captions). Structured output. | MVP (Phase 3) |
| OpenAI | Fallback behind the same `generateCopy()` interface if the program standardises on it. | Only if required |

## 2. AI image generation (backgrounds, illustrations, photo styles)

| Service | Strength | When |
|---|---|---|
| Google **Gemini image** models | Good quality, can edit an existing image from a text instruction, strong on text-in-image. | Next |
| OpenAI **GPT Image** | Good at following instructions, edits with masks. | Next |
| **FLUX** (Black Forest Labs), incl. Kontext for edits | Photo-real backgrounds, cheap per image, open weights for some variants. | Next |
| **Ideogram** | Best-in-class lettering inside images (useful for decorative titles, not body copy). | Later |
| **Recraft** | Vector/SVG output and brand-style consistency, so illustrations stay editable. | Later |
| **Seedream** (ByteDance) | Strong quality-for-price. | Later |
| Aggregators: **fal.ai**, **Replicate** | One API key and bill for many of the models above. Easy A/B testing. | Next (start here) |

## 3. AI editing and recognition (the "brand guardian" and upload-and-audit, README edge #4)

| Job | Service options | When |
|---|---|---|
| Score a volunteer's Canva/Corel poster against the kit (wrong logo? off-palette? wrong font? typos?) | **Claude vision** (send the image plus the kit, get a JSON score). Colour checks run in our own code. | Next |
| Read the text on an uploaded poster (OCR) | Claude vision first. Google Cloud Vision OCR or AWS Textract if we need exact word boxes for auto-fix. | Next |
| Find *our* logo in an upload (right version, not stretched, not recoloured) | Our own code: image embeddings (CLIP-style) or template matching against the kit's logo files. Cloud "logo detection" APIs only know famous brands. | Next |
| Identify the font used | No reliable API. Use a vision LLM to classify it as "serif/sans/script, matches kit or not". | Later |
| Remove a photo background (speaker photos for line-ups) | **remove.bg**, **Photoroom API**, or open models (BiRefNet) via fal.ai | Next (speaker line-up type) |
| Upscale for print (3×6 ft flex banners) | Real-ESRGAN / Clarity via fal.ai or Replicate, Topaz API | Phase 4 / Next |
| Inpaint / "remove this object" / extend a photo | Gemini image edit, GPT Image edit, FLUX Kontext | Later |

## 4. Video and audio (README edge #3)

| Job | Service options | When |
|---|---|---|
| Render on-brand video templates | **Remotion** (Chosen, PRD §5). Note: companies above a small headcount need a paid Remotion licence. Check before going commercial. Remotion Lambda for cloud rendering. | MVP stretch |
| Sermon/talk → transcript with timestamps (for captioned quote clips) | **Deepgram**, **AssemblyAI**, OpenAI transcription. Test on Nigerian-accented English first. | Next |
| Captions in Yoruba, Hausa, Igbo, Pidgin, French | Translate captions with Claude. Speech-to-text in those languages is weak everywhere, so validate before promising it. | Later |
| AI-generated video clips (b-roll, motion backgrounds) | Veo (Google), Kling, Seedance, Runway, Wan | Later |

## 5. Payments (README revenue model: Free / Pro / Network)

| Service | Why | When |
|---|---|---|
| **Paystack** | Nigeria-first, cards plus bank transfer plus USSD, recurring subscriptions in NGN. Stripe-owned. | Next (first paid plan) |
| **Flutterwave** | Alternative with wider African coverage. Good for multi-country ministries. | Next (pick one of these two) |
| Stripe | International customers (diaspora churches, UK/US chapters). Not available to Nigerian-registered merchants directly. | Later |

## 6. Messaging and notifications

| Service | Use | When |
|---|---|---|
| Email: **Resend** or **Postmark** | Magic links, volunteer invites, "your design is ready". Supabase Auth needs a real SMTP provider once hosted (local dev uses the built-in mail catcher). | Hosting time |
| **WhatsApp Business Cloud API** (Meta), or Twilio as the provider | Post-program "WhatsApp-native input": text a brief, get posters back. Also sending the print spec sheet. | Later |
| SMS: **Termii** (Nigeria), Twilio | Phone-number sign-in and OTP for volunteers without email | Later |

## 7. Hosting and infrastructure

| Service | Use | When |
|---|---|---|
| **Supabase** hosted (Chosen) | DB, Auth, Storage once we leave localhost | Hosting time (Open Question 4) |
| **Vercel** (Chosen) | Next.js hosting | Hosting time |
| Rendering worker: **Browserless**, or a small container on **Fly.io** / **Render** with Playwright | **Likely needed.** The Phase 1 templates use CSS that Satori can't render (container units, grid, clip-path, font-stretch), so server-side PNGs will probably use headless Chrome. That doesn't fit well in Vercel functions. | Phase 3 decision |
| Cloudflare **R2** | Cheaper file downloads if Storage bills grow (PRD §5 fallback) | Later |

## 8. Publishing and content sources

| Service | Use | When |
|---|---|---|
| Meta Graph API (Instagram/Facebook), LinkedIn API, X API (paid) | Post directly from Deloo. Ayrshare is one API for all of them. | Later |
| Unsplash / Pexels APIs | Free stock photos for backgrounds | Next |
| Google Fonts | Free-licence fonts for templates (Open Question 7) | MVP (already used) |

## 9. Product analytics and errors

| Service | Use | When |
|---|---|---|
| **PostHog** | Funnels: onboarding → first download. Which types and styles get used ("niche down by usage", README). | Hosting time |
| **Sentry** | Errors in the app and the render pipeline | Hosting time |

## Suggested first picks

1. Claude (copy and vision audit). Already chosen.
2. fal.ai as one key for image generation and editing experiments. Gemini image and FLUX first.
3. Paystack for payments.
4. Resend for email when we host.
5. A Playwright render worker, *if* the Phase 3 Satori-vs-Playwright decision goes that way.
