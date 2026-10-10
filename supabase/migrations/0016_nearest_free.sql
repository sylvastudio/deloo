-- 0016: "Free if you shift a day". Run in the Supabase SQL Editor after 0014 (and 0015). Safe to re-run.
--
-- When a plan has gear booked on the renter's days, the app asks which nearby windows of the same
-- length have everything free, and offers the nearest one ("Everything is free Sun 19 – Tue 21. Switch?").
-- Counts exactly like free_units / item_calendar in 0014: whole Lagos days, turnaround included
-- (private.reservation_period), and only reservations that hold their unit (private.res_holding, so a
-- renter's own droppable hold doesn't count against them). Never offers a window before tomorrow.

/**
 * For each start day within p_radius days of p_around (and not before tomorrow, Lagos), a p_days-long
 * window and how many of the wanted units would still be missing in it. Nearest fully free first.
 * p_items / p_qty are parallel arrays (the same item twice is summed).
 */
create or replace function public.nearest_free_windows(
  p_items uuid[], p_qty int[], p_days int, p_around date, p_radius int default 3
) returns table (first date, last date, missing int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tomorrow date := (now() at time zone 'Africa/Lagos')::date + 1;
  v_radius int := least(greatest(coalesce(p_radius, 3), 0), 14);
begin
  if p_items is null or p_qty is null or p_around is null or p_days is null then return; end if;
  if cardinality(p_items) = 0 or cardinality(p_items) <> cardinality(p_qty) or cardinality(p_items) > 50 then return; end if;
  if p_days < 1 or p_days > 60 or p_around > v_tomorrow + 365 then return; end if;

  return query
  with want as (
    select w.item_id, least(sum(w.qty), 100)::int as qty
      from unnest(p_items, p_qty) as w(item_id, qty)
     where w.item_id is not null and w.qty > 0
     group by w.item_id
  ),
  starts as (
    select d::date as s
      from generate_series(greatest(p_around - v_radius, v_tomorrow), p_around + v_radius, interval '1 day') d
  ),
  scored as (
    select st.s,
           (select coalesce(sum(greatest(0, w.qty - (
              select count(*) from public.units u
                join public.items i on i.id = u.item_id and i.active
                join public.vendors v on v.id = i.vendor_id and v.approved_at is not null
               where u.item_id = w.item_id and u.status = 'active'
                 and not exists (
                   select 1 from public.reservations r
                    where r.unit_id = u.id and private.res_holding(r.live, r.booking_id)
                      and r.period && private.reservation_period(st.s, st.s + p_days - 1))
            )::int)), 0) from want w)::int as short
      from starts st
  )
  select sc.s, sc.s + p_days - 1, sc.short
    from scored sc
   order by sc.short, abs(sc.s - p_around), sc.s;
end $$;

revoke all on function public.nearest_free_windows(uuid[], int[], int, date, int) from public;
grant execute on function public.nearest_free_windows(uuid[], int[], int, date, int) to anon, authenticated;
