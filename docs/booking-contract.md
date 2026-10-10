# Booking contract (mobile app, admin portal, server)

What the database and server expose for real rentals. Source of truth: `supabase/migrations/0009`–`0011`,
`lib/paystack.ts`, `app/api/paystack/*`. Product spec: `docs/prd-mvp-rental-ops.md` (P0 in §9).

## Money and time
- Money is kobo (`bigint`). Show with `naira()` (mobile `src/lib/format.ts`).
- Lagos is UTC+1 all year. A rental is whole calendar days `[first, last]`.
  Booking `starts_at` = first day 00:00 Lagos, `ends_at` = day after last, 00:00 Lagos.
  The unit's reservation also covers `app_settings.turnaround_hours` (12h) after that.
- Bookings start from tomorrow at the earliest.

## Renter RPCs (supabase-js `rpc`, signed in)
| Function | Args | Returns |
|---|---|---|
| `item_calendar` | `p_item uuid, p_from date, p_to date` (≤180 days) | rows `{ day, free, total }` per day |
| `quote_booking` | `p_lines jsonb [{item_id, qty}], p_first date, p_last date, p_delivery 'pickup'\|'delivery', p_zone uuid?` | `{ days, lines:[{item_id,name,qty,days,free,day_rate_kobo,rental_kobo,deposit_kobo,ok}], rental_kobo, protection_rate, protection_kobo, delivery_kobo, deposit_kobo, total_kobo, ok, problems[] }` problems: `starts_too_soon`, `not_free`, `item_unavailable`, `choose_zone` |
| `create_hold` | same as quote + `p_address text, p_phone text, p_event uuid?, p_not_included jsonb` | `{ booking_id, ref, total_kobo, hold_expires_at }`. Errors: message `gear_taken` (someone just booked it; `details` has the lines), or a plain-English message to show as is. |
| `quote_cancellation` | `p_booking` | `{ can_cancel, refund_kobo, hours_to_start }` |
| `request_cancellation` | `p_booking, p_reason` | `{ status:'cancelled', refund_kobo }` (refund row queued for Finance) |
| `expire_holds` | – | count (also run every minute by pg_cron) |
| `booking_stage` | `p_status, p_starts, p_ends` | tracker stage (adds `in_use`, `return_due`) |

Tables renters read (RLS: own rows): `bookings`, `booking_items`, `payments`, `refunds`, `handovers`,
`handover_media`, `delivery_zones`, `app_settings`. Renters insert `handovers` (party `renter`, kind
`delivery`|`collection`) and `handover_media` for their booking, and upload to the private storage bucket
`handover-media` at `<booking_id>/<handover_id>/<file>`.

## Payment (server, deloo.space)
1. App: `create_hold` → `POST {API}/api/paystack/init` with `Authorization: Bearer <access token>`, body `{ booking_id }`
   → `{ authorization_url, reference }`.
2. App opens `authorization_url` with `WebBrowser.openAuthSessionAsync(url, 'deloo://pay')`. Paystack's
   callback goes to `https://deloo.space/pay/return`, which hands over to `deloo://pay?reference=…`.
3. App: `GET {API}/api/paystack/verify?reference=…` (Bearer) → `{ paid, booking_status, needs_refund, paystack_status? }`.
   Bank transfers can stay `pending` for minutes: show "Waiting for your transfer" and poll the booking row.
4. Webhook `POST /api/paystack/webhook` confirms independently (signature + re-verify). Success is shown
   only when `bookings.status = 'confirmed'`.

Env: `PAYSTACK_SECRET_KEY` (server only, Netlify + `.env.local`), `NEXT_PUBLIC_SITE_URL`.

## Booking statuses (`booking_status`)
`hold → confirmed → preparing → out_for_delivery → delivered → collected → inspected → closed`;
also `expired` (hold ran out), `cancelled`, `disputed` (issue at inspection). Renter tracker labels:
confirmed "Confirmed", preparing "Being prepared", out_for_delivery "Out for delivery", delivered
"Delivered" (then `in_use` / `return_due` by time), collected "Collected", inspected "Checked",
closed "Deposit refunded". `needs_refund = true`: paid but couldn't be honoured.

## Staff (admin portal, signed in as a `staff_members` user; roles owner/admin/ops/rider/finance/readonly)
- Read everything through RLS (`private.is_staff()`).
- `staff_set_booking_status(p_booking, p_status, p_note)`: role-checked transitions (PRD §6.1).
- `staff_swap_unit(p_booking_item, p_unit)`: before dispatch.
- Direct writes allowed by RLS: `bookings` (admin, ops: slots, rider, address), `items`/`units`
  (admin, ops), vendor blocks in `reservations` (booking_id null), `refunds` (admin, finance),
  `handovers`/`handover_media` (admin, ops, rider), `booking_notes`, `delivery_zones`/`app_settings`
  (admin), `staff_members` (admin).
- `audit_log` is written by triggers (bookings status, payments, refunds, units, item prices).

## Stock
One in-house vendor, `de100000-0000-4000-8000-000000000001` ("Deloo"). Item photos are in the public
`items` bucket at `<vendor id>/<file>.jpg`. Categories: camera, lens, gimbal, light, mic, mixer,
headphones, grip, backdrop.
