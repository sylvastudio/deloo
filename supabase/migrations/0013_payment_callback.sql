-- Where Paystack sends the renter back after checkout: the native app's hand-over page on deloo.space,
-- or the web app (app.deloo.space/pay). Stored so a reused checkout returns to the same place.
alter table public.payments add column if not exists callback_url text not null default '';
