-- 0017: delivery slot chosen at booking, and messages after booking (Phase 1, part D).
-- Run in the Supabase SQL Editor after 0016. Safe to re-run.
--
-- 1. set_booking_slot: the renter picks Morning / Afternoon / Evening on Review; the app saves it right
--    after create_hold (create_hold itself is unchanged from 0014).
-- 2. public.notifications: an outbox of messages to the renter. Rows are queued by triggers on bookings
--    and refunds, and sent by https://deloo.space/api/cron/notify every 15 minutes (email for now;
--    WhatsApp and push later use the same rows with another channel).
--      confirmed        when the booking is paid and confirmed
--      day_before       18:00 Lagos the day before the first day
--      return_tomorrow  10:00 Lagos on the last rental day
--      deposit_sent     when a deposit refund is marked as paid
-- Lagos is UTC+1 all year. starts_at is the first day 00:00 Lagos; ends_at is the day after the last, 00:00.

-- ---------------------------------------------------------------------------
-- 1. Delivery slot
-- ---------------------------------------------------------------------------
/** The three delivery windows the app offers. Stored as shown to staff ("8–11am"), like the admin field. */
create or replace function private.delivery_slots() returns text[]
language sql immutable set search_path = '' as $$ select array['8–11am', '12–3pm', '4–7pm']; $$;

create or replace function public.set_booking_slot(p_booking uuid, p_slot text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_slot is null or not (p_slot = any (private.delivery_slots())) then
    raise exception 'Choose morning, afternoon or evening.' using errcode = '22023';
  end if;
  update public.bookings b set delivery_slot = p_slot
   where b.id = p_booking and b.renter_id = auth.uid() and b.status in ('hold', 'confirmed');
  if not found then raise exception 'This booking can’t be changed in the app now. Message us on WhatsApp.' using errcode = '42501'; end if;
end $$;
revoke all on function public.set_booking_slot(uuid, text) from public, anon;
grant execute on function public.set_booking_slot(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Outbox
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('confirmed', 'day_before', 'return_tomorrow', 'deposit_sent')),
  channel     text not null default 'email' check (channel in ('email', 'whatsapp', 'push')),
  send_after  timestamptz not null default now(),
  status      text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts    int not null default 0,
  claimed_at  timestamptz,                -- when a send run took it (status 'sending')
  sent_at     timestamptz,
  error       text not null default '',
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (booking_id, kind, channel)
);
create index if not exists notifications_due_idx on public.notifications (send_after) where status = 'queued';
create index if not exists notifications_user_idx on public.notifications (user_id);

alter table public.notifications enable row level security;
-- Renters read their own; staff read all. Only the service role (the cron route) writes.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() or private.is_staff());
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;

/** Queue one message (once per booking, kind and channel). A time already past is skipped, not sent late. */
create or replace function private.queue_notification(b public.bookings, p_kind text, p_at timestamptz, p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_at < now() - interval '5 minutes' then return; end if;
  insert into public.notifications (booking_id, user_id, kind, channel, send_after, payload)
  values (b.id, b.renter_id, p_kind, 'email', p_at, coalesce(p_payload, '{}'::jsonb))
  on conflict (booking_id, kind, channel) do nothing;
end $$;

create or replace function private.bookings_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.renter_id is null then return new; end if;

  -- Paid and confirmed: the confirmation now, and the two reminders at their times.
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.queue_notification(new, 'confirmed', now());
    perform private.queue_notification(new, 'day_before', new.starts_at - interval '6 hours');
    perform private.queue_notification(new, 'return_tomorrow', new.ends_at - interval '14 hours');
  end if;

  if tg_op = 'UPDATE' then
    -- Days moved (an extension, or staff moving the booking): reminders follow.
    if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
      update public.notifications n set send_after = case n.kind
          when 'day_before' then new.starts_at - interval '6 hours'
          else new.ends_at - interval '14 hours' end
       where n.booking_id = new.id and n.status = 'queued' and n.kind in ('day_before', 'return_tomorrow');
      -- Extended after the reminder went: remind again for the new last day.
      if new.ends_at > old.ends_at then
        update public.notifications n set status = 'queued', sent_at = null, attempts = 0, error = '',
               send_after = new.ends_at - interval '14 hours'
         where n.booking_id = new.id and n.kind = 'return_tomorrow' and n.status in ('sent', 'skipped', 'failed')
           and new.ends_at - interval '14 hours' > now();
      end if;
      if new.status in ('confirmed', 'preparing', 'out_for_delivery', 'delivered') then
        perform private.queue_notification(new, 'return_tomorrow', new.ends_at - interval '14 hours');
      end if;
    end if;
    -- Cancelled or ended early: nothing more about this rental goes out.
    if new.status in ('cancelled', 'expired') and old.status is distinct from new.status then
      update public.notifications n set status = 'skipped', error = 'Booking ' || new.status::text
       where n.booking_id = new.id and n.status = 'queued' and n.kind <> 'deposit_sent';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert or update of status, starts_at, ends_at on public.bookings
  for each row execute function private.bookings_notify();

/** A deposit refund marked as paid: tell the renter it's on its way. */
create or replace function private.refunds_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  if new.status = 'success' and new.purpose in ('deposit', 'claim_balance')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select * into b from public.bookings where id = new.booking_id;
    if b.id is not null and b.renter_id is not null then
      perform private.queue_notification(b, 'deposit_sent', now(), jsonb_build_object('amount_kobo', new.amount_kobo, 'refund_id', new.id));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists refunds_notify on public.refunds;
create trigger refunds_notify after insert or update of status on public.refunds
  for each row execute function private.refunds_notify();

-- ---------------------------------------------------------------------------
-- 3. For the cron route (service role only)
-- ---------------------------------------------------------------------------
/**
 * Claim up to p_limit due messages and return what each needs to be written. Claimed rows move to
 * 'sending' so two runs never send the same one; notification_result() finishes them. A message whose
 * moment has passed (the booking moved on) is skipped instead.
 */
drop function if exists public.claim_notifications(int);
create or replace function public.claim_notifications(p_limit int default 50)
returns table (
  id uuid, kind text, channel text, payload jsonb, attempts int, send_after timestamptz,
  booking_id uuid, ref text, status text, starts_at timestamptz, ends_at timestamptz, delivery text, address text,
  delivery_slot text, collection_slot text, deposit_kobo bigint, email text, full_name text,
  support_whatsapp text, pickup_address text
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  -- Stuck in 'sending' (a run died): try again.
  update public.notifications n set status = 'queued'
   where n.status = 'sending' and n.claimed_at < now() - interval '10 minutes';

  update public.notifications n set status = 'skipped', error = 'Booking is ' || b.status::text
    from public.bookings b
   where b.id = n.booking_id and n.status = 'queued' and n.send_after <= now()
     and ((n.kind in ('confirmed', 'day_before') and b.status not in ('confirmed', 'preparing', 'out_for_delivery'))
       or (n.kind = 'return_tomorrow' and b.status not in ('confirmed', 'preparing', 'out_for_delivery', 'delivered')));

  return query
  with due as (
    select n.id from public.notifications n
     where n.status = 'queued' and n.send_after <= now()
     order by n.send_after
     limit greatest(1, least(p_limit, 200))
     for update skip locked
  ), claimed as (
    update public.notifications n set status = 'sending', attempts = n.attempts + 1, claimed_at = now()
      from due where n.id = due.id
    returning n.*
  )
  select c.id, c.kind, c.channel, c.payload, c.attempts, c.send_after,
         b.id, b.ref, b.status::text, b.starts_at, b.ends_at, b.delivery::text, b.address,
         b.delivery_slot, b.collection_slot, b.deposit_kobo, u.email::text, coalesce(p.full_name, ''),
         s.support_whatsapp, s.pickup_address
    from claimed c
    join public.bookings b on b.id = c.booking_id
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    left join public.app_settings s on s.id = 1;
end $$;

/** Record how a claimed message went. A failure is retried on the next run, up to 5 tries. */
create or replace function public.notification_result(p_id uuid, p_ok boolean, p_error text default '')
returns void language sql security definer set search_path = '' as $$
  update public.notifications n
     set status = case when p_ok then 'sent' when n.attempts >= 5 then 'failed' else 'queued' end,
         sent_at = case when p_ok then now() else n.sent_at end,
         error = case when p_ok then '' else left(coalesce(p_error, ''), 500) end,
         send_after = case when p_ok then n.send_after else now() + make_interval(mins => 15 * n.attempts) end
   where n.id = p_id and n.status = 'sending';
$$;

revoke all on function public.claim_notifications(int) from public, anon, authenticated;
revoke all on function public.notification_result(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
grant execute on function public.notification_result(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Bookings already confirmed before this ran: queue their reminders (not the confirmation).
-- ---------------------------------------------------------------------------
do $$
declare b public.bookings;
begin
  for b in select * from public.bookings
            where renter_id is not null and status in ('confirmed', 'preparing', 'out_for_delivery', 'delivered') loop
    if b.status in ('confirmed', 'preparing') then
      perform private.queue_notification(b, 'day_before', b.starts_at - interval '6 hours');
    end if;
    perform private.queue_notification(b, 'return_tomorrow', b.ends_at - interval '14 hours');
  end loop;
end $$;
