-- 0019: no refundable deposit; Deloo Protection (damage cover) priced by gear (founder decision, 10 Oct 2026).
-- Run in the Supabase SQL Editor after 0018. Safe to re-run.
--
--   cameras 20% · lenses, lights and gimbals 15% · audio, grip and backdrops 10% (of each item's rental)
--
-- Not "insurance": Protection is Deloo's own damage waiver (insurance is a licensed product in Nigeria).
-- Bookings already made keep the deposit and protection they were made with.

-- Per-item rate, so staff can change one item later without a code change.
alter table public.items add column if not exists protection_rate numeric
  check (protection_rate is null or protection_rate between 0 and 0.5);

update public.items set protection_rate = case
    when category_key = 'camera' then 0.20
    when category_key in ('lens', 'light', 'gimbal') then 0.15
    else 0.10
  end
 where protection_rate is null;

-- No deposits from now on.
update public.items set deposit_kobo = 0 where deposit_kobo <> 0;

/** The rate for one item: its own, else by category (new items default the same way). */
create or replace function private.item_protection_rate(p_item uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(i.protection_rate,
           case when i.category_key = 'camera' then 0.20
                when i.category_key in ('lens', 'light', 'gimbal') then 0.15
                else 0.10 end)
    from public.items i where i.id = p_item;
$$;

/**
 * Same as 0011, except Protection is the sum of each line's rental × that item's rate, and
 * protection_rate in the result is the effective rate over the whole basket (kept for the
 * booking snapshot and older app versions).
 */
create or replace function public.quote_booking(p_lines jsonb, p_first date, p_last date, p_delivery text default 'pickup', p_zone uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  days int := p_last - p_first + 1;
  v_period tstzrange;
  l jsonb;
  it record;
  qty int;
  free int;
  lines jsonb := '[]'::jsonb;
  rental bigint := 0;
  protection bigint := 0;
  line_rental bigint;
  line_protection bigint;
  deposit bigint := 0;
  delivery bigint := 0;
  problems text[] := '{}';
begin
  if p_first is null or p_last is null or days < 1 then raise exception 'Choose your rental days.' using errcode = '22023'; end if;
  if days > 60 then raise exception 'Rentals are up to 60 days.' using errcode = '22023'; end if;
  if p_first <= (now() at time zone 'Africa/Lagos')::date then problems := array_append(problems, 'starts_too_soon'); end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add an item.' using errcode = '22023'; end if;
  v_period := private.reservation_period(p_first, p_last);

  for l in select * from jsonb_array_elements(p_lines) loop
    qty := greatest(1, least(20, coalesce((l ->> 'qty')::int, 1)));
    select i.id, i.name, i.day_rate_kobo, i.deposit_kobo, i.vendor_id into it
      from public.items i join public.vendors v on v.id = i.vendor_id and v.approved_at is not null
     where i.id = (l ->> 'item_id')::uuid and i.active;
    if not found then problems := array_append(problems, 'item_unavailable'); continue; end if;
    select count(*) into free from public.units u
     where u.item_id = it.id and u.status = 'active'
       and not exists (select 1 from public.reservations r
                        where r.unit_id = u.id and private.res_holding(r.live, r.booking_id) and r.period && v_period);
    if free < qty then problems := array_append(problems, 'not_free'); end if;
    line_rental := it.day_rate_kobo * qty * days;
    line_protection := round(line_rental * private.item_protection_rate(it.id))::bigint;
    lines := lines || jsonb_build_object('item_id', it.id, 'name', it.name, 'qty', qty, 'days', days, 'free', free,
      'day_rate_kobo', it.day_rate_kobo, 'rental_kobo', line_rental, 'deposit_kobo', it.deposit_kobo * qty,
      'protection_rate', private.item_protection_rate(it.id), 'protection_kobo', line_protection, 'ok', free >= qty);
    rental := rental + line_rental;
    protection := protection + line_protection;
    deposit := deposit + it.deposit_kobo * qty;
  end loop;

  if p_delivery = 'delivery' then
    select z.price_kobo * 2 into delivery from public.delivery_zones z where z.id = p_zone and z.active;
    if delivery is null then problems := array_append(problems, 'choose_zone'); delivery := 0; end if;
  elsif p_delivery <> 'pickup' then
    raise exception 'Choose delivery or pickup.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'days', days, 'lines', lines, 'rental_kobo', rental,
    'protection_rate', case when rental > 0 then round(protection::numeric / rental, 4) else 0 end,
    'protection_kobo', protection, 'delivery_kobo', delivery, 'deposit_kobo', deposit,
    'total_kobo', rental + protection + delivery + deposit,
    'ok', cardinality(problems) = 0, 'problems', to_jsonb(problems));
end $$;
grant execute on function public.quote_booking(jsonb, date, date, text, uuid) to anon, authenticated;
