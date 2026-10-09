-- Availability for the planner (docs/native-app-plan.md N2). Renters can't read vendors' calendars
-- (0007 RLS on reservations), so this returns only counts: for each public item, how many of its active
-- units are free for the whole period. It never says who booked what.

create or replace function public.free_units(p_from timestamptz, p_to timestamptz, p_categories text[] default null)
returns table (item_id uuid, free int, total int)
language plpgsql stable security definer set search_path = '' as $$
begin
  -- An empty or reversed window has no availability (and would make tstzrange throw).
  if p_from is null or p_to is null or p_to <= p_from then return; end if;
  return query
  select i.id,
         (count(u.id) filter (where not exists (
           select 1 from public.reservations r
            where r.unit_id = u.id and r.live and r.period && tstzrange(p_from, p_to)
         )))::int,
         count(u.id)::int
    from public.items i
    join public.vendors v on v.id = i.vendor_id and v.approved_at is not null
    join public.units u on u.item_id = i.id and u.status = 'active'
   where i.active
     and (p_categories is null or i.category_key = any (p_categories))
   group by i.id;
end $$;
revoke all on function public.free_units(timestamptz, timestamptz, text[]) from public;
grant execute on function public.free_units(timestamptz, timestamptz, text[]) to anon, authenticated;
