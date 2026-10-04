# Launch checklist

Everything here is a dashboard step for the account owner. The code is already in place and each feature
stays switched off until its key is added, so do these in order and nothing breaks in between.
Current live URL: `https://peaceful-bonbon-42fa32.netlify.app` → target: `https://deloo.space`.

## 1. Database is up to date
Supabase → **SQL Editor** → run, in order, any you haven't run yet:
`supabase/migrations/0004_asset_logo_variant.sql`, `supabase/migrations/0005_print_sizes.sql`.
Check: on a design, download a print size. The message shouldn't say "couldn't save a copy".

## 2. Connect deloo.space (Namecheap → Netlify)
1. Netlify → your site → **Domain management → Add a domain** → `deloo.space` → **Set up Netlify DNS**.
   Netlify shows 4 nameservers (like `dns1.p0X.nsone.net`). Add `www.deloo.space` too when offered.
2. Namecheap → **Domain List → deloo.space → Manage → Nameservers → Custom DNS** → paste the 4 → ✓.
   Takes minutes to a few hours. Netlify adds HTTPS by itself.
3. When `https://deloo.space` opens the app, in Netlify **Site configuration → Environment variables**:
   delete `NEXT_PUBLIC_SITE_URL`, add it again as `https://deloo.space` (not secret), then
   **Deploys → Trigger deploy**. (The value is built in, so it needs a redeploy.)
4. Supabase → **Authentication → URL Configuration**:
   Site URL `https://deloo.space`; Redirect URLs add `https://deloo.space/**`.
   Keep the netlify.app and `http://localhost:3000/**` entries.

## 3. Real email with Resend
Supabase's built-in email sends only a few emails an hour and often lands in spam.
1. Sign up at resend.com → **Domains → Add domain** → `deloo.space`.
2. Resend lists DNS records (MX + TXT for sending, a DKIM TXT). Add each in Netlify → **Domain management →
   deloo.space → DNS settings → Add new record**. Wait for Resend to show **Verified**.
3. Resend → **API Keys → Create** (sending access only). Copy it.
4. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   - Sender email `hello@deloo.space` · Sender name `Deloo`
   - Host `smtp.resend.com` · Port `465` · Username `resend` · Password = the API key
5. Supabase → **Authentication → Rate Limits**: raise "emails per hour" (e.g. 100).

## 4. Branded emails
Supabase → **Authentication → Emails → Templates**. For each, set the subject and paste the whole file:

| Template | Subject | File |
|---|---|---|
| Confirm signup | Confirm your email | `supabase/templates/confirm-signup.html` |
| Invite user | You're invited to Deloo | `supabase/templates/invite.html` |
| Magic link | Your Deloo sign-in link | `supabase/templates/magic-link.html` |
| Reset password | Choose a new Deloo password | `supabase/templates/reset-password.html` |
| Change email address | Confirm your new email for Deloo | `supabase/templates/change-email.html` |

## 5. Spam protection (Cloudflare Turnstile), in this order
1. dash.cloudflare.com (free account) → **Turnstile → Add widget**. Hostnames: `deloo.space`,
   `peaceful-bonbon-42fa32.netlify.app`, `localhost`. Mode: **Managed**. You get a **site key** and a **secret key**.
2. Netlify env: add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = site key (not secret) → **Trigger deploy**.
   Add it to `.env.local` too for local testing. Check that sign-in now shows the Cloudflare check.
3. Only then: Supabase → **Authentication → Attack Protection** → enable **CAPTCHA protection**, provider
   **Turnstile**, paste the **secret key**. (Doing this before step 2 would block every sign-in.)

## 6. Error tracking (Sentry)
1. sentry.io (free plan) → create a project, platform **Next.js**. Copy the **DSN**.
2. Netlify env: `NEXT_PUBLIC_SENTRY_DSN` = DSN (not secret) → **Trigger deploy**.
3. Optional, for readable stack traces: Sentry → **Settings → Auth Tokens** → create one. In Netlify add
   `SENTRY_AUTH_TOKEN` (**mark secret**), `SENTRY_ORG`, `SENTRY_PROJECT` (your Sentry org and project slugs).

Deloo sends errors only: no user info, cookies, request bodies or query values (`lib/sentry-privacy.ts`).

## 7. Remove the test accounts
Anyone could sign in to the seeded accounts: the password is in this repo.
1. Supabase → **SQL Editor** → run `supabase/cleanup_test_data.sql`.
2. Supabase → **Storage** → in `brand`, `exports` and `print`, delete the folders
   `aaaaaaaa-0000-4000-8000-000000000001` and `bbbbbbbb-0000-4000-8000-000000000002`.
3. `npm run check:rls` needs those accounts. To keep running it, create a second free Supabase project
   for testing, run the migrations and `seed.sql` there, and point a local `.env.local` at it.

## 8. Final check on deloo.space
- Netlify → **Project configuration → General → Powered by Netlify badge** → off (if not already).
- Sign up with a new email → confirm (branded email, from hello@deloo.space) → onboarding → brand kit with
  your real logo → a design → download post and a print size → invite a volunteer → they accept and design.
- **Forgot password?** on the sign-in page → email → choose a new password.
