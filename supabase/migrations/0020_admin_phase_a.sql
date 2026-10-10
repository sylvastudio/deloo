-- 0020: admin Phase A, workflow dead ends (10 Oct 2026). Run in the Supabase SQL Editor after 0019.
-- Safe to re-run.
--
-- 1. staff_cancel: a staff cancellation always puts its refund in the Finance queue, in the same
--    transaction (before, Ops could cancel but RLS stopped them writing the refund row).
--    staff_set_booking_status sends cancellations here too.
-- 2. staff_inspect: return inspection (PRD A-42) in one step. Every unit OK or Problem; inspection photos
--    of every unit (an owner can override with a note); Problem units go to quarantine; any problem makes
--    the booking disputed. All OK with no deposit and no open refund closes the booking straight away.
-- 3. staff_set_booking_status: riders can't mark a booking collected before its last rental day, and the
--    inspected / disputed-from-collected moves go through staff_inspect (so units are quarantined).
-- 4. Notifications: a booking collected, inspected or closed early no longer gets "return tomorrow".

-- ---------------------------------------------------------------------------
-- 1. Staff cancellation with its refund
-- ---------------------------------------------------------------------------
/** Naira for messages: 1500000 → "₦15,000". */
create or replace function private.naira(k bigint) returns text
language sql immutable set search_path = '' as $$
  select '₦' || case when coalesce(k, 0) % 100 = 0 then to_char(coalesce(k, 0) / 100, 'FM999,999,999,990')
                     else to_char(k / 100.0, 'FM999,999,999,990.00') end;
$$;

/**
 * Cancel a booking as staff and queue its refund. p_refund_kobo null = the policy amount
 * (private.cancellation_refund). Only admin, finance or owner may set a different amount; for other
 * roles the policy amount is used. The refund can't be more than what was paid and not yet refunded.
 */
create or replace function public.staff_cancel(p_booking uuid, p_note text, p_refund_kobo bigint default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  note text := left(trim(coalesce(p_note, '')), 500);
  policy bigint;
  refund bigint;
  paid bigint;
  refunded bigint;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found.'; end if;
  if not ((b.status in ('hold', 'confirmed', 'preparing') and private.staff_has(array['admin', 'ops']))
       or (b.status in ('out_for_delivery', 'delivered') and private.staff_has(array['admin']))) then
    raise exception 'Can’t cancel a % booking with your role.', b.status using errcode = '42501';
  end if;
  if length(note) < 3 then raise exception 'Add a short note saying why.' using errcode = '22023'; end if;

  -- Work out the refund before the status changes (the policy depends on timing, not status).
  policy := private.cancellation_refund(b);
  refund := case when p_refund_kobo is not null and private.staff_has(array['admin', 'finance']) then p_refund_kobo else policy end;
  if refund < 0 then raise exception 'The refund can’t be negative.' using errcode = '22023'; end if;
  select coalesce(sum(p.amount_kobo), 0) into paid from public.payments p where p.booking_id = b.id and p.status = 'success';
  select coalesce(sum(r.amount_kobo), 0) into refunded from public.refunds r where r.booking_id = b.id and r.status <> 'failed';
  if refund > greatest(0, paid - refunded) then
    raise exception 'The refund can’t be more than what was paid and not yet refunded (%).', private.naira(greatest(0, paid - refunded))
      using errcode = '22023';
  end if;

  update public.bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = note where id = b.id;
  insert into public.booking_notes (booking_id, body) values (b.id, 'cancelled: ' || note);
  if refund > 0 then
    insert into public.refunds (booking_id, purpose, amount_kobo, reason)
    values (b.id, 'cancellation', refund, left('Cancelled by staff: ' || note, 500));
    if refund <> policy then
      insert into public.booking_notes (booking_id, body)
      values (b.id, 'Refund set to ' || private.naira(refund) || ' (policy was ' || private.naira(policy) || ').');
    end if;
  end if;
  return jsonb_build_object('status', 'cancelled', 'refund_kobo', refund, 'policy_kobo', policy);
end $$;
revoke all on function public.staff_cancel(uuid, text, bigint) from public, anon;
grant execute on function public.staff_cancel(uuid, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Return inspection
-- ---------------------------------------------------------------------------
/**
 * p_results: [{"unit_id": "…", "ok": true|false, "note": "…"}], one per unit on the booking.
 * p_override_note: an owner may inspect without photos of every unit; the note says why.
 * Returns {"status": "closed" | "inspected" | "disputed", "problems": n}.
 */
create or replace function public.staff_inspect(p_booking uuid, p_results jsonb, p_override_note text default '')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  unit_ids uuid[];
  u uuid;
  r jsonb;
  ok boolean;
  note text;
  tag text;
  problems int := 0;
  missing int;
  has_deposit boolean;
  final public.booking_status;
begin
  if not private.staff_has(array['admin', 'ops']) then
    raise exception 'Only ops, admin or the owner can inspect returns.' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found.'; end if;
  if b.status <> 'collected' then
    raise exception 'Only a collected booking can be inspected (this one is %).', b.status using errcode = '22023';
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'Give a result for every unit.' using errcode = '22023'; end if;

  select array_agg(distinct bi.unit_id) into unit_ids
    from public.booking_items bi where bi.booking_id = b.id and bi.kind = 'rental' and bi.unit_id is not null;
  if unit_ids is null then raise exception 'No units are assigned to this booking.' using errcode = '22023'; end if;

  -- Photos: every unit needs one in a staff inspection handover.
  select count(*) into missing from unnest(unit_ids) x(id)
   where not exists (
     select 1 from public.handover_media m join public.handovers h on h.id = m.handover_id
      where h.booking_id = b.id and h.kind = 'inspection' and h.party = 'staff'
        and m.unit_id = x.id and m.media_type = 'photo');
  if missing > 0 then
    if private.staff_role() is distinct from 'owner' then
      raise exception 'Add inspection photos of every unit first (% of % missing).', missing, cardinality(unit_ids) using errcode = '22023';
    end if;
    if length(trim(coalesce(p_override_note, ''))) < 3 then
      raise exception 'Say why you’re inspecting without photos of every unit.' using errcode = '22023';
    end if;
    insert into public.booking_notes (booking_id, body)
    values (b.id, left('Inspected without photos of ' || missing || ' unit' || case when missing = 1 then '' else 's' end || ': ' || trim(p_override_note), 2000));
  end if;

  -- Check every unit has a result before changing anything.
  foreach u in array unit_ids loop
    select x.e into r from jsonb_array_elements(p_results) as x(e) where x.e->>'unit_id' = u::text limit 1;
    if r is null then raise exception 'Give a result for every unit.' using errcode = '22023'; end if;
    if jsonb_typeof(r->'ok') is distinct from 'boolean' then raise exception 'Mark each unit OK or Problem.' using errcode = '22023'; end if;
    if not (r->>'ok')::boolean and length(trim(coalesce(r->>'note', ''))) < 3 then
      raise exception 'Describe the problem on each unit marked Problem.' using errcode = '22023';
    end if;
  end loop;

  foreach u in array unit_ids loop
    select x.e into r from jsonb_array_elements(p_results) as x(e) where x.e->>'unit_id' = u::text limit 1;
    ok := (r->>'ok')::boolean;
    note := left(trim(coalesce(r->>'note', '')), 500);
    select coalesce(nullif(un.tag, ''), nullif(un.serial, ''), left(un.id::text, 8)) into tag from public.units un where un.id = u;
    if ok then
      if note <> '' then
        insert into public.booking_notes (booking_id, body) values (b.id, 'Inspection OK on ' || tag || ': ' || note);
      end if;
    else
      problems := problems + 1;
      update public.units un
         set status = 'quarantine',
             notes = left(trim(both e'\n' from un.notes || e'\n' || to_char(now() at time zone 'Africa/Lagos', 'DD Mon YYYY') || ' ' || coalesce(b.ref, '') || ': ' || note), 4000)
       where un.id = u;
      insert into public.booking_notes (booking_id, body) values (b.id, 'Inspection problem on ' || tag || ' (quarantined): ' || note);
    end if;
  end loop;

  if problems > 0 then
    final := 'disputed';
    update public.bookings set status = 'disputed' where id = b.id;
  else
    update public.bookings set status = 'inspected' where id = b.id;
    final := 'inspected';
    -- No deposit to give back and no refund still open: nothing left to do, so close it.
    has_deposit := b.deposit_kobo > 0
      or exists (select 1 from public.booking_items bi where bi.booking_id = b.id and bi.deposit_kobo > 0);
    if not has_deposit and not exists (
         select 1 from public.refunds rf where rf.booking_id = b.id and rf.status in ('queued', 'processing')) then
      update public.bookings set status = 'closed' where id = b.id;
      final := 'closed';
    end if;
  end if;
  return jsonb_build_object('status', final, 'problems', problems);
end $$;
revoke all on function public.staff_inspect(uuid, jsonb, text) from public, anon;
grant execute on function public.staff_inspect(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Status moves (0011, with the changes listed at the top)
-- ---------------------------------------------------------------------------
create or replace function public.staff_set_booking_status(p_booking uuid, p_status public.booking_status, p_note text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  allowed boolean;
begin
  -- Cancelling always queues the refund.
  if p_status = 'cancelled' then
    perform public.staff_cancel(p_booking, p_note, null);
    return;
  end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found.'; end if;
  allowed := case
    when p_status = 'preparing'        then b.status = 'confirmed' and private.staff_has(array['admin', 'ops'])
    when p_status = 'out_for_delivery' then b.status in ('confirmed', 'preparing') and private.staff_has(array['admin', 'ops', 'rider'])
    when p_status = 'delivered'        then b.status in ('preparing', 'out_for_delivery') and private.staff_has(array['admin', 'ops', 'rider'])
    when p_status = 'collected'        then b.status = 'delivered' and private.staff_has(array['admin', 'ops', 'rider'])
    when p_status = 'disputed'         then b.status = 'inspected' and private.staff_has(array['admin', 'ops'])
    when p_status = 'closed'           then b.status in ('inspected', 'disputed') and private.staff_has(array['admin', 'finance'])
    else false end;
  if not allowed then
    if p_status = 'inspected' or (p_status = 'disputed' and b.status = 'collected') then
      raise exception 'Use Inspect return on the booking.' using errcode = '42501';
    end if;
    raise exception 'Can’t move % to % with your role.', b.status, p_status using errcode = '42501';
  end if;
  -- Riders collect on the last rental day or later; ops can take gear back early.
  if p_status = 'collected' and private.staff_role() = 'rider' and now() < b.ends_at - interval '1 day' then
    raise exception 'Collection opens on the last rental day.' using errcode = '42501';
  end if;
  update public.bookings set status = p_status where id = b.id;
  if length(trim(coalesce(p_note, ''))) > 0 then
    insert into public.booking_notes (booking_id, body) values (b.id, p_status || ': ' || trim(p_note));
  end if;
end $$;
grant execute on function public.staff_set_booking_status(uuid, public.booking_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Notifications (0017's trigger function, plus: back early → no "return tomorrow")
-- ---------------------------------------------------------------------------
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
      if new.ends_at > old.ends_at and new.status in ('confirmed', 'preparing', 'out_for_delivery', 'delivered') then
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
    -- The gear is already back: no "return tomorrow" reminder.
    if new.status in ('collected', 'inspected', 'closed', 'disputed') and old.status is distinct from new.status then
      update public.notifications n set status = 'skipped', error = 'Returned early (' || new.status::text || ')'
       where n.booking_id = new.id and n.status = 'queued' and n.kind = 'return_tomorrow';
    end if;
  end if;
  return new;
end $$;
