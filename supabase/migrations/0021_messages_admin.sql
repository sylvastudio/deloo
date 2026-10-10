-- 0021: Messages in the staff portal (/admin/messages). Run in the Supabase SQL Editor after 0020. Safe to re-run.
--
-- Staff see every email in the outbox (public.notifications, 0017), send one again, cancel one that
-- hasn't gone, and write a one-off 'custom' email to a renter (about a booking, or to the renter alone).
--
-- 1. notifications: kind 'custom', status 'cancelled', booking_id optional (a message to a renter with
--    no booking), who queued / cancelled / retried. Booking messages stay once per booking, kind and
--    channel; custom messages can repeat (the unique constraint becomes a partial unique index).
-- 2. Who can read: the renter, and staff with messages.view (owner, admin, ops, finance, readonly).
--    Riders no longer read the outbox.
-- 3. staff_notifications(): the list for the portal, with the renter's name and email (email hidden
--    from read-only staff).
-- 4. staff_notification_retry / _cancel / _send, staff_find_renter: owner, admin, ops (messages.send).
-- 5. claim_notifications(): same as 0017 but a message with no booking is sent too (left join).

-- ---------------------------------------------------------------------------
-- 1. Table changes
-- ---------------------------------------------------------------------------
alter table public.notifications add column if not exists created_by   uuid references auth.users (id) on delete set null;
alter table public.notifications add column if not exists cancelled_by uuid references auth.users (id) on delete set null;
alter table public.notifications add column if not exists cancelled_at timestamptz;
alter table public.notifications add column if not exists retried_by   uuid references auth.users (id) on delete set null;
alter table public.notifications add column if not exists retried_at   timestamptz;

alter table public.notifications alter column booking_id drop not null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('confirmed', 'day_before', 'return_tomorrow', 'deposit_sent', 'custom'));

alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled'));

-- Only booking messages need a booking.
alter table public.notifications drop constraint if exists notifications_booking_needed;
alter table public.notifications add constraint notifications_booking_needed
  check (kind = 'custom' or booking_id is not null);

-- Once per booking, kind and channel, except custom messages (as many as staff write).
alter table public.notifications drop constraint if exists notifications_booking_id_kind_channel_key;
create unique index if not exists notifications_once_idx on public.notifications (booking_id, kind, channel) where kind <> 'custom';
create index if not exists notifications_booking_idx on public.notifications (booking_id);
create index if not exists notifications_created_idx on public.notifications (created_at desc);

/** 0017's queue_notification, with the conflict target naming the partial unique index. */
create or replace function private.queue_notification(b public.bookings, p_kind text, p_at timestamptz, p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_at < now() - interval '5 minutes' then return; end if;
  insert into public.notifications (booking_id, user_id, kind, channel, send_after, payload)
  values (b.id, b.renter_id, p_kind, 'email', p_at, coalesce(p_payload, '{}'::jsonb))
  on conflict (booking_id, kind, channel) where kind <> 'custom' do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Read access
-- ---------------------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() or private.staff_has(array['admin', 'ops', 'finance', 'readonly']));

-- ---------------------------------------------------------------------------
-- 3. The portal's list
-- ---------------------------------------------------------------------------
/**
 * Messages, newest first, with what the portal shows and what it needs to render a preview. Filters are
 * optional: status, kind, a search (booking ref, renter name, or email), Lagos days on the send time
 * (sent_at, else send_after), one booking. Email and address are blank for read-only staff.
 */
drop function if exists public.staff_notifications(text, text, text, date, date, uuid, int);
create or replace function public.staff_notifications(
  p_status text default null, p_kind text default null, p_q text default null,
  p_from date default null, p_to date default null, p_booking uuid default null, p_limit int default 200
)
returns table (
  id uuid, kind text, channel text, status text, send_after timestamptz, sent_at timestamptz, attempts int,
  error text, payload jsonb, created_at timestamptz, created_by uuid, cancelled_by uuid, cancelled_at timestamptz,
  retried_by uuid, retried_at timestamptz, user_id uuid, email text, full_name text,
  booking_id uuid, ref text, booking_status text, starts_at timestamptz, ends_at timestamptz, delivery text, address text,
  delivery_slot text, collection_slot text, deposit_kobo bigint, support_whatsapp text, pickup_address text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  pii boolean := private.staff_has(array['admin', 'ops', 'finance']);
  q text := nullif(lower(trim(coalesce(p_q, ''))), '');
begin
  if not private.staff_has(array['admin', 'ops', 'finance', 'readonly']) then
    raise exception 'Your role can’t see messages.' using errcode = '42501';
  end if;
  return query
  select n.id, n.kind, n.channel, n.status, n.send_after, n.sent_at, n.attempts,
         n.error, n.payload, n.created_at, n.created_by, n.cancelled_by, n.cancelled_at,
         n.retried_by, n.retried_at, n.user_id,
         case when pii then coalesce(u.email::text, '') else '' end,
         coalesce(p.full_name, ''),
         b.id, b.ref, b.status::text, b.starts_at, b.ends_at, b.delivery::text,
         case when pii then coalesce(b.address, '') else '' end,
         coalesce(b.delivery_slot, ''), coalesce(b.collection_slot, ''), coalesce(b.deposit_kobo, 0)::bigint,
         coalesce(s.support_whatsapp, ''), coalesce(s.pickup_address, '')
    from public.notifications n
    left join public.bookings b on b.id = n.booking_id
    left join auth.users u on u.id = n.user_id
    left join public.profiles p on p.id = n.user_id
    left join public.app_settings s on s.id = 1
   where (p_status is null or p_status = '' or n.status = p_status)
     and (p_kind is null or p_kind = '' or n.kind = p_kind)
     and (p_booking is null or n.booking_id = p_booking)
     and (p_from is null or coalesce(n.sent_at, n.send_after) >= private.day_start(p_from))
     and (p_to is null or coalesce(n.sent_at, n.send_after) < private.day_start(p_to + 1))
     and (q is null
          or strpos(lower(coalesce(b.ref, '')), q) > 0
          or strpos(lower(coalesce(p.full_name, '')), q) > 0
          or (pii and strpos(lower(coalesce(u.email::text, '')), q) > 0))
   order by coalesce(n.sent_at, n.send_after) desc, n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 500));
end $$;
revoke all on function public.staff_notifications(text, text, text, date, date, uuid, int) from public, anon;
grant execute on function public.staff_notifications(text, text, text, date, date, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Staff actions (owner, admin, ops)
-- ---------------------------------------------------------------------------
/** Send a failed or cancelled message again: back in the queue now, with fresh tries. */
create or replace function public.staff_notification_retry(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.staff_has(array['admin', 'ops']) then raise exception 'Your role can’t send messages.' using errcode = '42501'; end if;
  update public.notifications n
     set status = 'queued', send_after = now(), attempts = 0, error = '', sent_at = null, claimed_at = null,
         cancelled_by = null, cancelled_at = null, retried_by = auth.uid(), retried_at = now()
   where n.id = p_id and n.status in ('failed', 'cancelled');
  if not found then raise exception 'Only a failed or cancelled message can be sent again.' using errcode = '22023'; end if;
end $$;

/** Stop a message that hasn't gone yet. */
create or replace function public.staff_notification_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.staff_has(array['admin', 'ops']) then raise exception 'Your role can’t cancel messages.' using errcode = '42501'; end if;
  update public.notifications n
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), error = 'Cancelled by staff'
   where n.id = p_id and n.status = 'queued';
  if not found then raise exception 'Only a message still waiting to go can be cancelled.' using errcode = '22023'; end if;
end $$;

/**
 * Queue a one-off email written by staff. With a booking, it goes to that booking's renter (p_user is
 * ignored) and a note is added to the booking; without, to p_user. Sent by the next cron run.
 */
create or replace function public.staff_notification_send(p_booking uuid, p_user uuid, p_subject text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  target uuid;
  subj text := trim(coalesce(p_subject, ''));
  body text := trim(coalesce(p_body, ''));
  who text;
  new_id uuid;
begin
  if not private.staff_has(array['admin', 'ops']) then raise exception 'Your role can’t send messages.' using errcode = '42501'; end if;
  if length(subj) < 3 or length(subj) > 150 then raise exception 'Write a subject (3 to 150 characters).' using errcode = '22023'; end if;
  if length(body) < 3 or length(body) > 5000 then raise exception 'Write the message (up to 5,000 characters).' using errcode = '22023'; end if;

  if p_booking is not null then
    select * into b from public.bookings where id = p_booking;
    if not found then raise exception 'Booking not found.' using errcode = '22023'; end if;
    target := b.renter_id;
  else
    target := p_user;
  end if;
  if target is null or not exists (select 1 from auth.users u where u.id = target) then
    raise exception 'Pick a booking or a renter.' using errcode = '22023';
  end if;

  select coalesce(nullif(s.display_name, ''), '') into who from public.staff_members s where s.user_id = auth.uid();
  insert into public.notifications (booking_id, user_id, kind, channel, send_after, payload, created_by)
  values (p_booking, target, 'custom', 'email', now(),
          jsonb_build_object('subject', subj, 'body', body, 'sent_by', auth.uid(), 'sent_by_name', coalesce(who, '')),
          auth.uid())
  returning id into new_id;

  if p_booking is not null then
    insert into public.booking_notes (booking_id, author_id, body) values (p_booking, auth.uid(), 'Email queued: ' || left(subj, 150));
  end if;
  return new_id;
end $$;

/** A renter's account by email (exact, any case), for writing to someone without picking a booking. */
drop function if exists public.staff_find_renter(text);
create or replace function public.staff_find_renter(p_email text)
returns table (user_id uuid, email text, full_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.staff_has(array['admin', 'ops']) then raise exception 'Your role can’t send messages.' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, coalesce(p.full_name, '')
    from auth.users u left join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(coalesce(p_email, '')))
   limit 1;
end $$;

revoke all on function public.staff_notification_retry(uuid) from public, anon;
revoke all on function public.staff_notification_cancel(uuid) from public, anon;
revoke all on function public.staff_notification_send(uuid, uuid, text, text) from public, anon;
revoke all on function public.staff_find_renter(text) from public, anon;
grant execute on function public.staff_notification_retry(uuid) to authenticated;
grant execute on function public.staff_notification_cancel(uuid) to authenticated;
grant execute on function public.staff_notification_send(uuid, uuid, text, text) to authenticated;
grant execute on function public.staff_find_renter(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. claim_notifications: as 0017, but messages without a booking (custom) are claimed and returned too.
-- ---------------------------------------------------------------------------
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
         c.booking_id, b.ref, b.status::text, b.starts_at, b.ends_at, b.delivery::text, b.address,
         b.delivery_slot, b.collection_slot, b.deposit_kobo, u.email::text, coalesce(p.full_name, ''),
         s.support_whatsapp, s.pickup_address
    from claimed c
    left join public.bookings b on b.id = c.booking_id
    left join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    left join public.app_settings s on s.id = 1;
end $$;
revoke all on function public.claim_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
