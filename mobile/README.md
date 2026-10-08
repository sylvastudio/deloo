# Deloo mobile (Expo, Android first)

The native app for renters and vendors. Plan: `../docs/native-app-plan.md`. Backend: the same Supabase
project as the web (`../supabase/migrations`), so RLS rules apply here too.

## Run it on your phone

1. `cp .env.example .env` and fill in the same public Supabase URL and key as the web's `NEXT_PUBLIC_*` values.
2. `npm install`
3. `npx expo start`, then scan the QR code with **Expo Go** (Android) or the Camera app (iOS).

Signing in sends a 6-digit code by email. The Supabase **Magic Link** and **Confirm signup** templates must
show `{{ .Token }}` (copies in `../supabase/templates/`).

## Before writing code

Read `AGENTS.md`: Expo changes every SDK, so check the versioned docs for SDK 57 first.
Run `npx tsc --noEmit` and `npx expo lint` before calling anything done.

## Layout

- `src/app/`: screens (Expo Router). `(renter)` and `(vendor)` are the two modes' tab bars.
- `src/ui/`: Deloo components (Text, Button, Tile, Chip, Badge, Screen, Card, Field).
- `src/theme/`: colours, type scale and spacing.
- `src/lib/`: Supabase client, session (profile, vendors, mode), catalogue labels, money formatting.
