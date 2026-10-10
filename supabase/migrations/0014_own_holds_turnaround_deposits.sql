-- 0014: what the renter sees as free matches what a booking actually takes (10 Oct 2026 UX review).
-- Run in the Supabase SQL Editor after 0013. Safe to re-run.
--
-- 1. A renter's own unpaid hold (no Paystack checkout started) no longer counts against them, and a new
--    hold replaces it. Before, going Back from Pay and booking again said "was just booked" for 30 min.
-- 2. The item calendar and the planner count the turnaround after a rental (app_settings.turnaround_hours),
--    like quote_booking and create_hold do. Before, a day could look free and then be refused at Book.
-- 3. Deposits: one day's rate, at least ₦10,000 and at most ₦50,000 (founder decision, 10 Oct 2026).
-- 4. server_now(), for the pay screen countdown.

-- ---------------------------------------------------------------------------
-- 1. Own unpaid holds
-- ---------------------------------------------------------------------------
/** A hold the signed-in renter could still drop: theirs, unpaid, and no checkout started. */
create or replace function private.own_droppable_hold(b public.bookings) returns boolean
language sql stable security definer set search_path = '' as $$
  select b.status = 'hold' and auth.uid() is not null and b.renter_id = auth.uid()
     and not exists (select 1 from public.payments p
                      where p.booking_id = b.id and p.status in ('initialized', 'success', 'mismatch'));
$$;

/** Is this reservation holding its unit? Live, not a hold whose time ran out, and not the caller's own droppable hold. */
create or replace function private.res_holding(res_live boolean, res_booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select res_live and not exists (
    select 1 from public.bookings b
     where b.id = res_booking
       and ((b.status = 'hold' and b.hold_expires_at < now()) or private.own_droppable_hold(b)));
$$;

-- create_hold: drop the caller's droppable holds first, so their units are really free for the new one.
-- Same as 0011 otherwise.
create or replace function public.create_hold(
  p_lines jsonb, p_first date, p_last date, p_delivery text, p_zone uuid default null,
  p_address text default '', p_phone text default '', p_event uuid default null, p_not_included jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  q jsonb;
  l jsonb;
  vendor uuid;
  booking uuid;
  bref text;
  v_period tstzrange;
  unit uuid;
  bitem uuid;
  n int;
  expires timestamptz;
begin
  if uid is null then raise exception 'Sign in to book.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = uid and p.blocked) then
    raise exception 'Your account can’t book right now. Message us on WhatsApp.' using errcode = '42501';
  end if;
  if p_event is not null and not private.owns_event(p_event) then raise exception 'Not your plan.' using errcode = '42501'; end if;
  perform public.expire_holds();

  update public.bookings b set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Replaced by a new booking before paying'
   where b.renter_id = uid and private.own_droppable_hold(b);

  q := public.quote_booking(p_lines, p_first, p_last, p_delivery, p_zone);
  if q -> 'problems' ? 'starts_too_soon' then raise exception 'Bookings start from tomorrow.' using errcode = '22023'; end if;
  if q -> 'problems' ? 'choose_zone' then raise exception 'Choose a delivery area.' using errcode = '22023'; end if;
  if not (q ->> 'ok')::boolean then raise exception 'gear_taken' using errcode = 'P0001', detail = (q -> 'lines')::text; end if;
  if p_delivery = 'delivery' and length(trim(p_address)) < 5 then raise exception 'Add the delivery address.' using errcode = '22023'; end if;

  select distinct i.vendor_id into vendor from public.items i
   where i.id in (select (x ->> 'item_id')::uuid from jsonb_array_elements(q -> 'lines') x);
  v_period := private.reservation_period(p_first, p_last);
  expires := now() + make_interval(mins => (select s.hold_minutes from public.app_settings s where s.id = 1));

  loop
    bref := 'DLO-' || upper(substr(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=0O1Il', ''), 1, 5));
    exit when length(bref) = 9 and not exists (select 1 from public.bookings b where b.ref = bref);
  end loop;

  insert into public.bookings (event_id, renter_id, vendor_id, status, starts_at, ends_at, hold_expires_at, delivery,
    delivery_zone_id, address, contact_phone, days, rental_kobo, protection_kobo, delivery_kobo, deposit_kobo,
    protection_rate, total_kobo, ref, not_included)
  values (p_event, uid, vendor, 'hold', private.day_start(p_first), private.day_start(p_last + 1), expires, p_delivery,
    case when p_delivery = 'delivery' then p_zone end, trim(p_address), trim(p_phone), (q ->> 'days')::int,
    (q ->> 'rental_kobo')::bigint, (q ->> 'protection_kobo')::bigint, (q ->> 'delivery_kobo')::bigint, (q ->> 'deposit_kobo')::bigint,
    (q ->> 'protection_rate')::numeric, (q ->> 'total_kobo')::bigint, bref, coalesce(p_not_included, '[]'::jsonb))
  returning id into booking;

  begin
    for l in select * from jsonb_array_elements(q -> 'lines') loop
      for n in 1 .. (l ->> 'qty')::int loop
        -- A free unit of this item, least used in the last 30 days first (spreads the wear).
        select u.id into unit from public.units u
         where u.item_id = (l ->> 'item_id')::uuid and u.status = 'active'
           and not exists (select 1 from public.reservations r
                            where r.unit_id = u.id and private.res_holding(r.live, r.booking_id) and r.period && v_period)
         order by (select count(*) from public.reservations r2
                    where r2.unit_id = u.id and r2.period && tstzrange(now() - interval '30 days', now())), u.created_at
         limit 1 for update skip locked;
        if unit is null then raise exception 'gear_taken' using errcode = 'P0001'; end if;
        insert into public.booking_items (booking_id, item_id, unit_id, item_name, day_rate_kobo, days, rental_kobo, deposit_kobo)
        values (booking, (l ->> 'item_id')::uuid, unit, l ->> 'name', (l ->> 'day_rate_kobo')::bigint, (l ->> 'days')::int,
                (l ->> 'day_rate_kobo')::bigint * (l ->> 'days')::int, (l ->> 'deposit_kobo')::bigint / (l ->> 'qty')::int)
        returning id into bitem;
        insert into public.reservations (unit_id, booking_id, booking_item_id, period, note)
        values (unit, booking, bitem, v_period, bref);
        unit := null;
      end loop;
    end loop;
  exception when exclusion_violation then
    raise exception 'gear_taken' using errcode = 'P0001';
  end;

  return jsonb_build_object('booking_id', booking, 'ref', bref, 'total_kobo', (q ->> 'total_kobo')::bigint, 'hold_expires_at', expires);
end $$;
revoke all on function public.create_hold(jsonb, date, date, text, uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_hold(jsonb, date, date, text, uuid, text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Availability counts the turnaround, by whole Lagos days (as the app books them)
-- ---------------------------------------------------------------------------
/** The planner's question: free units for the rental days covering [p_from, p_to), plus turnaround. */
create or replace function public.free_units(p_from timestamptz, p_to timestamptz, p_categories text[] default null)
returns table (item_id uuid, free int, total int)
language plpgsql stable security definer set search_path = '' as $$
declare v_period tstzrange;
begin
  if p_from is null or p_to is null or p_to <= p_from then return; end if;
  v_period := private.reservation_period((p_from at time zone 'Africa/Lagos')::date,
                                         ((p_to - interval '1 millisecond') at time zone 'Africa/Lagos')::date);
  return query
  select i.id,
         (count(u.id) filter (where not exists (
           select 1 from public.reservations r
            where r.unit_id = u.id and private.res_holding(r.live, r.booking_id) and r.period && v_period
         )))::int,
         count(u.id)::int
    from public.items i
    join public.vendors v on v.id = i.vendor_id and v.approved_at is not null
    join public.units u on u.item_id = i.id and u.status = 'active'
   where i.active
     and (p_categories is null or i.category_key = any (p_categories))
   group by i.id;
end $$;

/** Item page calendar: a day is free when a one-day rental of it (turnaround included) would fit. */
create or replace function public.item_calendar(p_item uuid, p_from date, p_to date)
returns table (day date, free int, total int)
language sql stable security definer set search_path = '' as $$
  with units as (
    select u.id from public.units u join public.items i on i.id = u.item_id
    join public.vendors v on v.id = i.vendor_id and v.approved_at is not null
    where u.item_id = p_item and u.status = 'active' and i.active
  )
  select d::date,
         (select count(*) from units u where not exists (
            select 1 from public.reservations r
             where r.unit_id = u.id and private.res_holding(r.live, r.booking_id)
               and r.period && private.reservation_period(d::date, d::date)))::int,
         (select count(*) from units)::int
    from generate_series(p_from, least(p_to, p_from + 180), interval '1 day') d;
$$;
grant execute on function public.item_calendar(uuid, date, date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Deposits (bookings keep the deposit they were made with)
-- ---------------------------------------------------------------------------
update public.items set deposit_kobo = least(5000000, greatest(1000000, day_rate_kobo))
 where deposit_kobo <> least(5000000, greatest(1000000, day_rate_kobo));

-- ---------------------------------------------------------------------------
-- 4. The server's clock, so the pay screen's hold countdown doesn't trust a wrong phone clock
-- ---------------------------------------------------------------------------
create or replace function public.server_now() returns timestamptz
language sql stable set search_path = '' as $$ select now(); $$;
grant execute on function public.server_now() to anon, authenticated;
