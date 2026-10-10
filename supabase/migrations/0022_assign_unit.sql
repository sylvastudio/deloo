-- Admin Phase C: "Assign units" on the booking page.
--
-- staff_swap_unit (0011) assumed the line already had a unit and a live reservation, and took the new
-- reservation's period from the old one. A rental line with no unit (older bookings, or a unit released
-- by hand) then failed with a null period. Now, with no live reservation, the period is worked out the
-- same way place_hold does it (rental days plus turnaround), so the same button assigns or swaps.

create or replace function public.staff_swap_unit(p_booking_item uuid, p_unit uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  bi public.booking_items;
  b public.bookings;
  old_res public.reservations;
  v_period tstzrange;
begin
  if not private.staff_has(array['admin', 'ops']) then raise exception 'Ops only.' using errcode = '42501'; end if;
  select * into bi from public.booking_items where id = p_booking_item for update;
  if bi.id is null then raise exception 'Booking line not found.'; end if;
  select * into b from public.bookings where id = bi.booking_id;
  if b.status not in ('hold', 'confirmed', 'preparing') then raise exception 'The gear has already left base.'; end if;
  if not exists (select 1 from public.units u where u.id = p_unit and u.item_id = bi.item_id and u.status = 'active') then
    raise exception 'Pick an active unit of the same item.';
  end if;
  select * into old_res from public.reservations where booking_item_id = bi.id and live for update;
  if old_res.id is not null then
    update public.reservations set live = false where id = old_res.id;
    v_period := old_res.period;
  else
    v_period := private.reservation_period((b.starts_at at time zone 'Africa/Lagos')::date,
                                           (b.ends_at at time zone 'Africa/Lagos')::date - 1);
  end if;
  begin
    insert into public.reservations (unit_id, booking_id, booking_item_id, period, note)
    values (p_unit, b.id, bi.id, v_period, b.ref);
  exception when exclusion_violation then
    raise exception 'That unit is booked for these dates.';
  end;
  update public.booking_items set unit_id = p_unit where id = bi.id;
  insert into public.booking_notes (booking_id, body)
  values (b.id, case when old_res.id is null then 'Unit assigned on ' else 'Unit swapped on ' end || bi.item_name);
end $$;
grant execute on function public.staff_swap_unit(uuid, uuid) to authenticated;
