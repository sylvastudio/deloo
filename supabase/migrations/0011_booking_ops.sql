-- Real rentals: staff, pricing settings, delivery zones, holds, Paystack payments, refunds, handover
-- evidence and an audit log (docs/prd-mvp-rental-ops.md §5–7, P0). Run after 0010_booking_enums.sql.
--
-- Who does what:
--   Renters call quote_booking → create_hold → pay (Paystack, via deloo.space/api/paystack/*), and
--   record handover photos on their own bookings. request_cancellation cancels before dispatch.
--   The payment webhook (server, service role) calls confirm_payment.
--   Staff (staff_members) work through the admin portal with their own session: RLS lets them read
--   everything, and staff_* functions move bookings through their stages with a role check.

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('owner', 'admin', 'ops', 'rider', 'finance', 'readonly');

create table public.staff_members (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  role          public.staff_role not null,
  display_name  text not null default '',
  phone         text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create or replace function private.staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select s.role from public.staff_members s where s.user_id = auth.uid() and s.active;
$$;

create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members s where s.user_id = auth.uid() and s.active);
$$;

/** Staff with one of these roles (owner always passes). */
create or replace function private.staff_has(roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members s
                  where s.user_id = auth.uid() and s.active and (s.role = 'owner' or s.role::text = any (roles)));
$$;

-- Staff count as Ops everywhere 0007 already checks is_ops() (read access to bookings, profiles, etc.).
create or replace function private.is_ops() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_ops from public.profiles p where p.id = auth.uid()), false) or private.is_staff();
$$;

grant execute on function private.staff_role(), private.is_staff(), private.staff_has(text[]) to authenticated, anon;

alter table public.staff_members enable row level security;
create policy staff_select on public.staff_members for select to authenticated using (user_id = auth.uid() or private.is_staff());
create policy staff_write on public.staff_members for all to authenticated
  using (private.staff_has(array['admin'])) with check (private.staff_has(array['admin']));

-- ---------------------------------------------------------------------------
-- Settings and delivery zones
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                int primary key default 1 check (id = 1),
  protection_rate   numeric not null default 0.07 check (protection_rate between 0 and 0.5),
  hold_minutes      int not null default 30 check (hold_minutes between 5 and 240),
  turnaround_hours  int not null default 12 check (turnaround_hours between 0 and 72),  -- after the last day: collect, check, charge
  pickup_address    text not null default '',
  support_whatsapp  text not null default '',
  updated_at        timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;

create table public.delivery_zones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  areas       text[] not null default '{}',
  price_kobo  bigint not null check (price_kobo >= 0),   -- one way; delivery and collection = 2×
  active      boolean not null default true,
  sort        int not null default 0
);
insert into public.delivery_zones (name, areas, price_kobo, sort) values
  ('Mainland', '{Ikeja,Yaba,Surulere,Gbagada,Maryland,Ogba,Magodo,Oshodi,Agege,Isolo,Festac,Apapa}', 500000, 1),
  ('Island',   '{Victoria Island,Ikoyi,Lekki}', 750000, 2),
  ('Outer Lagos', '{Ajah,Ikorodu,Epe,Badagry}', 1200000, 3);

alter table public.app_settings enable row level security;
alter table public.delivery_zones enable row level security;
create policy settings_select on public.app_settings for select to anon, authenticated using (true);
create policy settings_update on public.app_settings for update to authenticated
  using (private.staff_has(array['admin'])) with check (private.staff_has(array['admin']));
create policy zones_select on public.delivery_zones for select to anon, authenticated using (true);
create policy zones_write on public.delivery_zones for all to authenticated
  using (private.staff_has(array['admin'])) with check (private.staff_has(array['admin']));

-- ---------------------------------------------------------------------------
-- Catalogue and stock additions
-- ---------------------------------------------------------------------------
alter table public.items add column if not exists in_the_box text[] not null default '{}';
alter table public.units add column if not exists tag text not null default '';     -- e.g. FX3-01, written on the unit
alter table public.units add column if not exists notes text not null default '';

-- Staff manage stock directly (vendor members could already).
create policy items_staff_write on public.items for all to authenticated
  using (private.staff_has(array['admin', 'ops'])) with check (private.staff_has(array['admin', 'ops']));
create policy units_staff_write on public.units for all to authenticated
  using (private.staff_has(array['admin', 'ops'])) with check (private.staff_has(array['admin', 'ops']));
create policy reservations_staff_block on public.reservations for insert to authenticated
  with check (booking_id is null and private.staff_has(array['admin', 'ops']));
create policy reservations_staff_unblock on public.reservations for delete to authenticated
  using (booking_id is null and private.staff_has(array['admin', 'ops']));
create policy items_photos_staff on storage.objects for all to authenticated
  using (bucket_id = 'items' and private.staff_has(array['admin', 'ops']))
  with check (bucket_id = 'items' and private.staff_has(array['admin', 'ops']));

alter table public.events add column if not exists kind text not null default 'shoot';
alter table public.unmet_demand add column if not exists profile_id uuid references auth.users (id) on delete set null default auth.uid();
alter table public.unmet_demand add column if not exists reason text not null default 'not_stocked' check (reason in ('not_stocked', 'booked'));

-- ---------------------------------------------------------------------------
-- Bookings: item-led bookings have no event; money is snapshotted at hold time
-- ---------------------------------------------------------------------------
alter table public.bookings alter column event_id drop not null;
alter table public.bookings
  add column if not exists ref              text unique,
  add column if not exists days             int not null default 1,
  add column if not exists rental_kobo      bigint not null default 0,
  add column if not exists protection_kobo  bigint not null default 0,
  add column if not exists delivery_kobo    bigint not null default 0,
  add column if not exists deposit_kobo     bigint not null default 0,
  add column if not exists protection_rate  numeric not null default 0,
  add column if not exists delivery_zone_id uuid references public.delivery_zones (id),
  add column if not exists address          text not null default '',
  add column if not exists contact_phone    text not null default '',
  add column if not exists delivery_slot    text not null default '',
  add column if not exists collection_slot  text not null default '',
  add column if not exists rider_name       text not null default '',
  add column if not exists rider_phone      text not null default '',
  add column if not exists not_included     jsonb not null default '[]'::jsonb,   -- plan lines we couldn't supply
  add column if not exists needs_refund     boolean not null default false,       -- paid but couldn't be honoured
  add column if not exists confirmed_at     timestamptz,
  add column if not exists cancelled_at     timestamptz,
  add column if not exists cancel_reason    text not null default '';

create table public.booking_items (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings (id) on delete cascade,
  item_id        uuid not null references public.items (id) on delete restrict,
  unit_id        uuid references public.units (id) on delete set null,
  item_name      text not null,
  day_rate_kobo  bigint not null,
  days           int not null,
  rental_kobo    bigint not null,
  deposit_kobo   bigint not null,
  kind           text not null default 'rental' check (kind in ('rental', 'extension')),
  created_at     timestamptz not null default now()
);
create index booking_items_booking_idx on public.booking_items (booking_id);
alter table public.reservations add column if not exists booking_item_id uuid references public.booking_items (id) on delete cascade;

-- Reservations stay live from hold until the gear is back and checked (0007 freed them on 'returned').
create or replace function private.sync_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    update public.reservations
       set live = new.status in ('hold', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'collected', 'disputed', 'out')
     where booking_id = new.id;
  end if;
  return new;
end $$;

create policy booking_items_select on public.booking_items for select to authenticated
  using (private.booking_renter(booking_id) = auth.uid() or private.is_staff());
alter table public.booking_items enable row level security;

-- Renters keep seeing what they booked (name, photos, serials) even if the listing is later hidden.
create or replace function private.renter_has_item(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.booking_items bi join public.bookings b on b.id = bi.booking_id
                  where bi.item_id = target and b.renter_id = auth.uid());
$$;
create or replace function private.renter_has_unit(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.booking_items bi join public.bookings b on b.id = bi.booking_id
                  where bi.unit_id = target and b.renter_id = auth.uid());
$$;
grant execute on function private.renter_has_item(uuid), private.renter_has_unit(uuid) to authenticated;
create policy items_renter_booked on public.items for select to authenticated using (private.renter_has_item(id));
create policy units_renter_booked on public.units for select to authenticated using (private.renter_has_unit(id));
create policy bookings_staff_update on public.bookings for update to authenticated
  using (private.staff_has(array['admin', 'ops'])) with check (private.staff_has(array['admin', 'ops']));

-- ---------------------------------------------------------------------------
-- Payments (Paystack). Rows are written by the server only (service role); renters read their own.
-- ---------------------------------------------------------------------------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings (id) on delete restrict,
  purpose            text not null default 'booking' check (purpose in ('booking', 'extension', 'late_fee', 'claim', 'offline')),
  reference          text not null unique,
  amount_kobo        bigint not null check (amount_kobo > 0),
  fees_kobo          bigint not null default 0,
  channel            text not null default '',
  status             text not null default 'initialized' check (status in ('initialized', 'success', 'failed', 'abandoned', 'mismatch')),
  flags              text[] not null default '{}',
  paystack_id        text not null default '',
  authorization_url  text not null default '',
  paid_at            timestamptz,
  created_at         timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id);

create table public.payment_events (
  id            uuid primary key default gen_random_uuid(),
  dedupe_key    text not null unique,     -- event + reference + Paystack id: a replayed webhook is ignored
  event_type    text not null,
  reference     text not null default '',
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text not null default ''
);

create table public.refunds (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id) on delete restrict,
  payment_id    uuid references public.payments (id),
  purpose       text not null check (purpose in ('deposit', 'cancellation', 'duplicate', 'gear_gone', 'claim_balance', 'goodwill')),
  amount_kobo   bigint not null check (amount_kobo > 0),
  method        text not null default 'manual' check (method in ('paystack_refund', 'transfer', 'manual')),
  status        text not null default 'queued' check (status in ('queued', 'processing', 'success', 'failed')),
  provider_ref  text not null default '',
  reason        text not null default '',
  requested_by  uuid references auth.users (id) default auth.uid(),
  processed_by  uuid references auth.users (id),
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index refunds_booking_idx on public.refunds (booking_id);

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
create policy payments_select on public.payments for select to authenticated
  using (private.booking_renter(booking_id) = auth.uid() or private.is_staff());
create policy payment_events_select on public.payment_events for select to authenticated using (private.staff_has(array['admin', 'finance']));
create policy refunds_select on public.refunds for select to authenticated
  using (private.booking_renter(booking_id) = auth.uid() or private.is_staff());
create policy refunds_staff_write on public.refunds for all to authenticated
  using (private.staff_has(array['admin', 'finance'])) with check (private.staff_has(array['admin', 'finance']));

-- ---------------------------------------------------------------------------
-- Handover evidence: photos/videos of the gear at each hand-off, kept for insurance and claims
-- ---------------------------------------------------------------------------
create table public.handovers (
  id                   uuid primary key default gen_random_uuid(),
  booking_id           uuid not null references public.bookings (id) on delete cascade,
  kind                 text not null check (kind in ('dispatch', 'delivery', 'collection', 'inspection')),
  party                text not null check (party in ('staff', 'renter')),
  performed_by         uuid references auth.users (id) default auth.uid(),
  checklist            jsonb not null default '{}'::jsonb,
  problem_note         text not null default '',
  result               text check (result in ('ok', 'issue')),
  confirmed_at         timestamptz,            -- the slide: "I received / returned these in this condition"
  device_completed_at  timestamptz,            -- when it was done on the phone (may be earlier, offline)
  created_at           timestamptz not null default now()
);
create index handovers_booking_idx on public.handovers (booking_id);

create table public.handover_media (
  id            uuid primary key default gen_random_uuid(),
  handover_id   uuid not null references public.handovers (id) on delete cascade,
  booking_id    uuid not null references public.bookings (id) on delete cascade,
  unit_id       uuid references public.units (id) on delete set null,
  shot          text not null default 'overview' check (shot in ('overview', 'serial', 'accessories', 'damage', 'video_test', 'other')),
  media_type    text not null default 'photo' check (media_type in ('photo', 'video')),
  storage_path  text not null,               -- handover-media bucket: <booking id>/<handover id>/<file>
  sha256        text not null default '',
  bytes         int not null default 0,
  width         int,
  height        int,
  duration_s    numeric,
  captured_at   timestamptz,
  uploaded_at   timestamptz not null default now(),
  uploaded_by   uuid references auth.users (id) default auth.uid()
);
create index handover_media_handover_idx on public.handover_media (handover_id);

alter table public.handovers enable row level security;
alter table public.handover_media enable row level security;
create policy handovers_select on public.handovers for select to authenticated
  using (private.booking_renter(booking_id) = auth.uid() or private.is_staff());
create policy handovers_renter_insert on public.handovers for insert to authenticated
  with check (party = 'renter' and performed_by = auth.uid() and kind in ('delivery', 'collection')
              and private.booking_renter(booking_id) = auth.uid());
create policy handovers_staff_write on public.handovers for all to authenticated
  using (private.staff_has(array['admin', 'ops', 'rider'])) with check (private.staff_has(array['admin', 'ops', 'rider']));
create policy handover_media_select on public.handover_media for select to authenticated
  using (private.booking_renter(booking_id) = auth.uid() or private.is_staff());
create policy handover_media_renter_insert on public.handover_media for insert to authenticated
  with check (uploaded_by = auth.uid() and private.booking_renter(booking_id) = auth.uid()
              and exists (select 1 from public.handovers h where h.id = handover_id and h.booking_id = handover_media.booking_id and h.party = 'renter'));
create policy handover_media_staff_write on public.handover_media for all to authenticated
  using (private.staff_has(array['admin', 'ops', 'rider'])) with check (private.staff_has(array['admin', 'ops', 'rider']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('handover-media', 'handover-media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

create or replace function private.path_uuid(object_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(object_name, '/', 1)::uuid end;
$$;
grant execute on function private.path_uuid(text) to authenticated;

create policy handover_files_select on storage.objects for select to authenticated
  using (bucket_id = 'handover-media' and (private.booking_renter(private.path_uuid(name)) = auth.uid() or private.is_staff()));
create policy handover_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'handover-media' and (private.booking_renter(private.path_uuid(name)) = auth.uid() or private.staff_has(array['admin', 'ops', 'rider'])));

-- ---------------------------------------------------------------------------
-- Staff notes, push tokens, audit log
-- ---------------------------------------------------------------------------
create table public.booking_notes (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  author_id   uuid references auth.users (id) default auth.uid(),
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now()
);
alter table public.booking_notes enable row level security;
create policy booking_notes_staff on public.booking_notes for all to authenticated
  using (private.is_staff()) with check (private.staff_has(array['admin', 'ops', 'rider', 'finance']));

create table public.push_tokens (
  expo_token    text primary key,
  profile_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  platform      text not null default '',
  last_seen_at  timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create table public.audit_log (
  id         bigserial primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select to authenticated using (private.staff_has(array['admin', 'finance']));

create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), lower(tg_op), tg_table_name,
          case when tg_op = 'DELETE' then old.id else new.id end,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger bookings_audit after update on public.bookings for each row
  when (old.status is distinct from new.status or old.needs_refund is distinct from new.needs_refund) execute function private.audit();
create trigger payments_audit after insert or update on public.payments for each row execute function private.audit();
create trigger refunds_audit after insert or update on public.refunds for each row execute function private.audit();
create trigger units_audit after insert or update or delete on public.units for each row execute function private.audit();
create trigger items_audit after update of day_rate_kobo, deposit_kobo, active on public.items for each row execute function private.audit();

-- ---------------------------------------------------------------------------
-- Time helpers. Lagos is UTC+1 all year. A rental day is a calendar day; the reservation also covers
-- turnaround_hours after the last day (collection, inspection, charging).
-- ---------------------------------------------------------------------------
create or replace function private.day_start(d date) returns timestamptz
language sql immutable set search_path = '' as $$
  select (d::timestamp at time zone 'Africa/Lagos');
$$;

create or replace function private.reservation_period(first_day date, last_day date) returns tstzrange
language sql stable security definer set search_path = '' as $$
  select tstzrange(private.day_start(first_day),
                   private.day_start(last_day + 1) + make_interval(hours => (select s.turnaround_hours from public.app_settings s where s.id = 1)));
$$;

/** Is this reservation holding its unit? Live, and not an unpaid hold whose time ran out. */
create or replace function private.res_holding(res_live boolean, res_booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select res_live and not exists (
    select 1 from public.bookings b where b.id = res_booking and b.status = 'hold' and b.hold_expires_at < now());
$$;

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------
-- 0008's free_units, now ignoring holds that ran out before the cron caught them.
create or replace function public.free_units(p_from timestamptz, p_to timestamptz, p_categories text[] default null)
returns table (item_id uuid, free int, total int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to <= p_from then return; end if;
  return query
  select i.id,
         (count(u.id) filter (where not exists (
           select 1 from public.reservations r
            where r.unit_id = u.id and private.res_holding(r.live, r.booking_id) and r.period && tstzrange(p_from, p_to)
         )))::int,
         count(u.id)::int
    from public.items i
    join public.vendors v on v.id = i.vendor_id and v.approved_at is not null
    join public.units u on u.item_id = i.id and u.status = 'active'
   where i.active
     and (p_categories is null or i.category_key = any (p_categories))
   group by i.id;
end $$;

/** Free units of one public item for each day in [p_from, p_to] (the item page calendar). */
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
               and r.period && tstzrange(private.day_start(d::date), private.day_start(d::date + 1))))::int,
         (select count(*) from units)::int
    from generate_series(p_from, least(p_to, p_from + 180), interval '1 day') d;
$$;
grant execute on function public.item_calendar(uuid, date, date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Holds expire (pg_cron every minute, and lazily before every new hold)
-- ---------------------------------------------------------------------------
create or replace function public.expire_holds() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with gone as (
    update public.bookings b set status = 'expired'
     where b.status = 'hold' and b.hold_expires_at < now()
       and not exists (select 1 from public.payments p where p.booking_id = b.id and p.status = 'mismatch')
    returning b.id)
  select count(*) into n from gone;
  update public.payments p set status = 'abandoned'
   where p.status = 'initialized' and exists (select 1 from public.bookings b where b.id = p.booking_id and b.status = 'expired');
  return n;
end $$;
revoke all on function public.expire_holds() from public;
grant execute on function public.expire_holds() to authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('deloo-expire-holds', '* * * * *', 'select public.expire_holds()');
exception when others then
  raise notice 'pg_cron not available (%). Holds still expire lazily; enable pg_cron in the dashboard to schedule it.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Quote and hold
-- ---------------------------------------------------------------------------
/**
 * Prices a basket for whole days [p_first, p_last] (Lagos). p_lines: [{"item_id": uuid, "qty": int}].
 * p_delivery: 'pickup' or 'delivery' (needs p_zone). Server-side so prices can't be tampered with.
 */
create or replace function public.quote_booking(p_lines jsonb, p_first date, p_last date, p_delivery text default 'pickup', p_zone uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  days int := p_last - p_first + 1;
  v_period tstzrange;
  rate numeric;
  l jsonb;
  it record;
  qty int;
  free int;
  lines jsonb := '[]'::jsonb;
  rental bigint := 0;
  deposit bigint := 0;
  delivery bigint := 0;
  problems text[] := '{}';
begin
  if p_first is null or p_last is null or days < 1 then raise exception 'Choose your rental days.' using errcode = '22023'; end if;
  if days > 60 then raise exception 'Rentals are up to 60 days.' using errcode = '22023'; end if;
  if p_first <= (now() at time zone 'Africa/Lagos')::date then problems := array_append(problems, 'starts_too_soon'); end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add an item.' using errcode = '22023'; end if;
  v_period := private.reservation_period(p_first, p_last);
  select s.protection_rate into rate from public.app_settings s where s.id = 1;

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
    lines := lines || jsonb_build_object('item_id', it.id, 'name', it.name, 'qty', qty, 'days', days, 'free', free,
      'day_rate_kobo', it.day_rate_kobo, 'rental_kobo', it.day_rate_kobo * qty * days, 'deposit_kobo', it.deposit_kobo * qty, 'ok', free >= qty);
    rental := rental + it.day_rate_kobo * qty * days;
    deposit := deposit + it.deposit_kobo * qty;
  end loop;

  if p_delivery = 'delivery' then
    select z.price_kobo * 2 into delivery from public.delivery_zones z where z.id = p_zone and z.active;
    if delivery is null then problems := array_append(problems, 'choose_zone'); delivery := 0; end if;
  elsif p_delivery <> 'pickup' then
    raise exception 'Choose delivery or pickup.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'days', days, 'lines', lines, 'rental_kobo', rental, 'protection_rate', rate,
    'protection_kobo', round(rental * rate)::bigint, 'delivery_kobo', delivery, 'deposit_kobo', deposit,
    'total_kobo', rental + round(rental * rate)::bigint + delivery + deposit,
    'ok', cardinality(problems) = 0, 'problems', to_jsonb(problems));
end $$;
grant execute on function public.quote_booking(jsonb, date, date, text, uuid) to anon, authenticated;

/**
 * Holds the gear for the renter: books specific units for the period and creates the booking at
 * 'hold' until it's paid (app_settings.hold_minutes). All or nothing: if any unit is taken meanwhile,
 * nothing is held and it raises 'gear_taken'.
 */
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
-- Payment confirmation (server only: the Paystack webhook and verify endpoints, service role)
-- ---------------------------------------------------------------------------
create or replace function public.confirm_payment(p_reference text, p_amount bigint, p_paystack_id text default '',
  p_channel text default '', p_paid_at timestamptz default now(), p_fees bigint default 0)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments;
  b public.bookings;
begin
  select * into pay from public.payments where reference = p_reference for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_reference'); end if;
  select * into b from public.bookings where id = pay.booking_id for update;
  if pay.status = 'success' then return jsonb_build_object('ok', true, 'already', true, 'status', b.status, 'booking_id', b.id); end if;

  if p_amount <> pay.amount_kobo then
    update public.payments set status = 'mismatch', flags = array_append(flags, 'amount_' || p_amount), paystack_id = p_paystack_id where id = pay.id;
    update public.bookings set hold_expires_at = greatest(hold_expires_at, now() + interval '60 minutes') where id = b.id and status = 'hold';
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch', 'booking_id', b.id);
  end if;

  update public.payments set status = 'success', paid_at = p_paid_at, channel = p_channel, fees_kobo = p_fees, paystack_id = p_paystack_id
   where id = pay.id;

  if pay.purpose <> 'booking' then return jsonb_build_object('ok', true, 'status', b.status, 'booking_id', b.id); end if;

  if b.status = 'hold' then
    update public.bookings set status = 'confirmed', confirmed_at = now(), hold_expires_at = null where id = b.id;
    return jsonb_build_object('ok', true, 'status', 'confirmed', 'booking_id', b.id);
  elsif b.status in ('expired', 'cancelled') and b.cancelled_at is null then
    -- Paid after the hold ran out: keep the booking if the same units are still free.
    begin
      update public.bookings set status = 'confirmed', confirmed_at = now(), hold_expires_at = null where id = b.id;
      return jsonb_build_object('ok', true, 'status', 'confirmed', 'late', true, 'booking_id', b.id);
    exception when exclusion_violation then
      update public.bookings set needs_refund = true where id = b.id;
      insert into public.refunds (booking_id, payment_id, purpose, amount_kobo, reason, requested_by)
      values (b.id, pay.id, 'gear_gone', pay.amount_kobo, 'Paid after the hold ended and the gear was booked by someone else.', null);
      return jsonb_build_object('ok', true, 'status', 'expired', 'gear_gone', true, 'booking_id', b.id);
    end;
  else
    -- Already confirmed by an earlier payment: this one is a duplicate to refund.
    update public.payments set flags = array_append(flags, 'duplicate') where id = pay.id;
    insert into public.refunds (booking_id, payment_id, purpose, amount_kobo, reason, requested_by)
    values (b.id, pay.id, 'duplicate', pay.amount_kobo, 'Second payment for an already paid booking.', null);
    return jsonb_build_object('ok', true, 'status', b.status, 'duplicate', true, 'booking_id', b.id);
  end if;
end $$;
revoke all on function public.confirm_payment(text, bigint, text, text, timestamptz, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cancellation (docs/prd-mvp-rental-ops.md §5.15; tiers are a proposal until the founder signs off)
-- ---------------------------------------------------------------------------
create or replace function private.cancellation_refund(b public.bookings) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  paid bigint;
  hours numeric := extract(epoch from b.starts_at - now()) / 3600;
begin
  select coalesce(sum(p.amount_kobo), 0) into paid from public.payments p where p.booking_id = b.id and p.status = 'success';
  if paid = 0 then return 0; end if;
  if hours > 72 or (hours > 24 and b.confirmed_at > now() - interval '1 hour') then return paid; end if;
  if hours > 24 then return paid - b.rental_kobo / 2; end if;
  return greatest(0, paid - b.rental_kobo);
end $$;

create or replace function public.quote_cancellation(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and (renter_id = auth.uid() or private.is_staff());
  if not found then raise exception 'Booking not found.' using errcode = '42501'; end if;
  return jsonb_build_object('can_cancel', b.status in ('hold', 'confirmed', 'preparing'),
    'refund_kobo', private.cancellation_refund(b), 'hours_to_start', round(extract(epoch from b.starts_at - now()) / 3600));
end $$;
grant execute on function public.quote_cancellation(uuid) to authenticated;

create or replace function public.request_cancellation(p_booking uuid, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  refund bigint;
begin
  select * into b from public.bookings where id = p_booking and renter_id = auth.uid() for update;
  if not found then raise exception 'Booking not found.' using errcode = '42501'; end if;
  if b.status not in ('hold', 'confirmed', 'preparing') then
    raise exception 'This booking is already on its way. Message us on WhatsApp to change it.' using errcode = '22023';
  end if;
  refund := private.cancellation_refund(b);
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = left(coalesce(p_reason, ''), 500) where id = b.id;
  if refund > 0 then
    insert into public.refunds (booking_id, purpose, amount_kobo, reason) values (b.id, 'cancellation', refund, 'Cancelled by renter');
  end if;
  return jsonb_build_object('status', 'cancelled', 'refund_kobo', refund);
end $$;
grant execute on function public.request_cancellation(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff: move a booking through its stages (§6.1), swap a unit
-- ---------------------------------------------------------------------------
create or replace function public.staff_set_booking_status(p_booking uuid, p_status public.booking_status, p_note text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  allowed boolean;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found.'; end if;
  allowed := case
    when p_status = 'preparing'        then b.status = 'confirmed' and private.staff_has(array['admin', 'ops'])
    when p_status = 'out_for_delivery' then b.status in ('confirmed', 'preparing') and private.staff_has(array['admin', 'ops', 'rider'])
    when p_status = 'delivered'        then b.status in ('preparing', 'out_for_delivery') and private.staff_has(array['admin', 'ops', 'rider'])
    when p_status = 'collected'        then b.status = 'delivered' and private.staff_has(array['admin', 'ops', 'rider'])
    when p_status = 'inspected'        then b.status = 'collected' and private.staff_has(array['admin', 'ops'])
    when p_status = 'disputed'         then b.status in ('collected', 'inspected') and private.staff_has(array['admin', 'ops'])
    when p_status = 'closed'           then b.status in ('inspected', 'disputed') and private.staff_has(array['admin', 'finance'])
    when p_status = 'cancelled'        then (b.status in ('hold', 'confirmed', 'preparing') and private.staff_has(array['admin', 'ops']))
                                            or (b.status in ('out_for_delivery', 'delivered') and private.staff_has(array['admin']))
    else false end;
  if not allowed then raise exception 'Can’t move % to % with your role.', b.status, p_status using errcode = '42501'; end if;
  update public.bookings set status = p_status,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when p_status = 'cancelled' then left(coalesce(p_note, ''), 500) else cancel_reason end
   where id = b.id;
  if length(trim(coalesce(p_note, ''))) > 0 then
    insert into public.booking_notes (booking_id, body) values (b.id, p_status || ': ' || trim(p_note));
  end if;
end $$;
grant execute on function public.staff_set_booking_status(uuid, public.booking_status, text) to authenticated;

/** Give a booking line a different unit (same item), before it leaves base. */
create or replace function public.staff_swap_unit(p_booking_item uuid, p_unit uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  bi public.booking_items;
  b public.bookings;
  old_res public.reservations;
begin
  if not private.staff_has(array['admin', 'ops']) then raise exception 'Ops only.' using errcode = '42501'; end if;
  select * into bi from public.booking_items where id = p_booking_item for update;
  select * into b from public.bookings where id = bi.booking_id;
  if b.status not in ('hold', 'confirmed', 'preparing') then raise exception 'The gear has already left base.'; end if;
  if not exists (select 1 from public.units u where u.id = p_unit and u.item_id = bi.item_id and u.status = 'active') then
    raise exception 'Pick an active unit of the same item.';
  end if;
  select * into old_res from public.reservations where booking_item_id = bi.id and live for update;
  update public.reservations set live = false where id = old_res.id;
  begin
    insert into public.reservations (unit_id, booking_id, booking_item_id, period, note)
    values (p_unit, b.id, bi.id, old_res.period, b.ref);
  exception when exclusion_violation then
    raise exception 'That unit is booked for these dates.';
  end;
  update public.booking_items set unit_id = p_unit where id = bi.id;
  insert into public.booking_notes (booking_id, body) values (b.id, 'Unit swapped on ' || bi.item_name);
end $$;
grant execute on function public.staff_swap_unit(uuid, uuid) to authenticated;

/** Rental tracker stage (the app's timeline), derived from status and time. */
create or replace function public.booking_stage(p_status public.booking_status, p_starts timestamptz, p_ends timestamptz)
returns text
language sql stable set search_path = '' as $$
  select case
    when p_status = 'delivered' and now() >= p_ends - interval '6 hours' then 'return_due'
    when p_status = 'delivered' and now() >= p_starts then 'in_use'
    else p_status::text end;
$$;
grant execute on function public.booking_stage(public.booking_status, timestamptz, timestamptz) to anon, authenticated;
