-- Deloo rental core (PRD v2 §6, IMPLEMENTATION_PLAN Phase 0). Run after 0006_drop_poster.sql.
-- Money is stored in kobo (bigint), never as floating point.
-- Payments, claims, verifications, checklists and reviews arrive in later phases.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;   -- lets the reservation rule combine "same unit" with "overlapping time"

-- Also made by 0001; defined here too so a fresh test project can start from this file.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  full_name      text not null check (length(trim(full_name)) > 0),
  phone          text not null default '',
  wants_to_rent  boolean not null default true,
  has_gear       boolean not null default false,
  trust_level    smallint not null default 0 check (trust_level between 0 and 3),  -- PRD §4.5, raised by vetting
  is_ops         boolean not null default false,                                    -- Deloo staff
  blocked        boolean not null default false,                                    -- shared blocklist
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vendors: rental companies, churches with idle gear, individual owners
-- ---------------------------------------------------------------------------
create type public.vendor_type as enum ('company', 'church', 'individual');
create type public.vendor_role as enum ('owner', 'staff');

create table public.vendors (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) > 0),
  vendor_type        public.vendor_type not null,
  city               text not null default 'Lagos',
  areas              text[] not null default '{}',     -- areas served, e.g. {Ikeja, Lekki}
  phone              text not null default '',
  offers_delivery    boolean not null default false,
  offers_technician  boolean not null default false,   -- technicians are the vendor's own staff (PRD §8.7)
  cac_number         text,
  approved_at        timestamptz,                      -- set by Ops; only approved vendors' gear is public
  created_at         timestamptz not null default now()
);

create table public.vendor_members (
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.vendor_role not null default 'owner',
  created_at  timestamptz not null default now(),
  primary key (vendor_id, user_id)
);
create index vendor_members_user_idx on public.vendor_members (user_id);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
-- spec_schema: {"fields":[{"key","label","type":"number"|"boolean"|"text","unit"?,"options"?}]}
-- The planner (lib/planner) reads these keys, so changing a key is a code change too.
create table public.categories (
  key          text primary key,
  label        text not null,
  grp          text not null check (grp in ('sound', 'screen', 'camera', 'light', 'power')),
  spec_schema  jsonb not null default '{"fields":[]}'::jsonb,
  sort         int not null default 0
);

insert into public.categories (key, label, grp, sort, spec_schema) values
  ('speaker',           'Speaker',             'sound',  10, '{"fields":[{"key":"watts","label":"Power","type":"number","unit":"W"},{"key":"size_in","label":"Driver size","type":"number","unit":"inch"},{"key":"powered","label":"Powered (active)","type":"boolean"}]}'),
  ('subwoofer',         'Subwoofer',           'sound',  20, '{"fields":[{"key":"watts","label":"Power","type":"number","unit":"W"},{"key":"size_in","label":"Driver size","type":"number","unit":"inch"}]}'),
  ('monitor',           'Stage monitor',       'sound',  30, '{"fields":[{"key":"watts","label":"Power","type":"number","unit":"W"}]}'),
  ('mic',               'Microphone',          'sound',  40, '{"fields":[{"key":"kind","label":"Type","type":"text","options":["handheld","lavalier","headset","instrument"]},{"key":"wireless","label":"Wireless","type":"boolean"}]}'),
  ('mixer',             'Mixer',               'sound',  50, '{"fields":[{"key":"channels","label":"Channels","type":"number"},{"key":"digital","label":"Digital","type":"boolean"}]}'),
  ('led_wall',          'LED wall',            'screen', 60, '{"fields":[{"key":"width_ft","label":"Width","type":"number","unit":"ft"},{"key":"height_ft","label":"Height","type":"number","unit":"ft"},{"key":"pitch_mm","label":"Pixel pitch","type":"number","unit":"mm"},{"key":"outdoor","label":"Outdoor rated","type":"boolean"}]}'),
  ('projector',         'Projector',           'screen', 70, '{"fields":[{"key":"lumens","label":"Brightness","type":"number","unit":"lumens"}]}'),
  ('projection_screen', 'Projection screen',   'screen', 80, '{"fields":[{"key":"width_ft","label":"Width","type":"number","unit":"ft"},{"key":"height_ft","label":"Height","type":"number","unit":"ft"}]}'),
  ('tv',                'TV screen',           'screen', 90, '{"fields":[{"key":"size_in","label":"Size","type":"number","unit":"inch"}]}'),
  ('camera',            'Camera',              'camera', 100, '{"fields":[{"key":"kind","label":"Type","type":"text","options":["camcorder","ptz","cinema","dslr"]},{"key":"resolution","label":"Resolution","type":"text","options":["1080p","4k"]}]}'),
  ('switcher',          'Video switcher',      'camera', 110, '{"fields":[{"key":"inputs","label":"Camera inputs","type":"number"},{"key":"streams","label":"Streams directly","type":"boolean"}]}'),
  ('streaming_kit',     'Streaming kit',       'camera', 120, '{"fields":[{"key":"bonded","label":"Bonded internet (several SIMs)","type":"boolean"}]}'),
  ('light',             'Light',               'light',  130, '{"fields":[{"key":"kind","label":"Type","type":"text","options":["par","wash","moving_head","follow_spot","flood"]},{"key":"watts","label":"Power","type":"number","unit":"W"}]}'),
  ('generator',         'Generator',           'power',  140, '{"fields":[{"key":"kva","label":"Capacity","type":"number","unit":"kVA"},{"key":"silent","label":"Soundproof","type":"boolean"}]}'),
  ('avr',               'Stabiliser / surge protector', 'power', 150, '{"fields":[{"key":"kva","label":"Capacity","type":"number","unit":"kVA"}]}');

-- One listing. Risk tier follows replacement value (PRD §4.5): under ₦500k → 1, under ₦3m → 2, else 3.
create table public.items (
  id                       uuid primary key default gen_random_uuid(),
  vendor_id                uuid not null references public.vendors (id) on delete cascade,
  category_key             text not null references public.categories (key),
  name                     text not null check (length(trim(name)) > 0),
  brand                    text not null default '',
  model                    text not null default '',
  description              text not null default '',
  specs                    jsonb not null default '{}'::jsonb check (jsonb_typeof(specs) = 'object'),
  day_rate_kobo            bigint not null check (day_rate_kobo >= 0),
  deposit_kobo             bigint not null default 0 check (deposit_kobo >= 0),
  replacement_value_kobo   bigint not null check (replacement_value_kobo > 0),
  risk_tier                smallint generated always as (
                             case when replacement_value_kobo < 50000000 then 1
                                  when replacement_value_kobo < 300000000 then 2
                                  else 3 end) stored,
  technician_required      boolean not null default false,
  photos                   text[] not null default '{}',   -- paths in the public `items` bucket
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Tier 3 gear only goes out with a technician (PRD §4.5).
  check (replacement_value_kobo < 300000000 or technician_required)
);
create index items_vendor_idx on public.items (vendor_id);
create index items_category_idx on public.items (category_key) where active;
create trigger items_touch before update on public.items for each row execute function public.touch_updated_at();

-- One physical piece of an item. Availability is counted in units.
create type public.unit_status as enum ('active', 'repair', 'retired');
create table public.units (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items (id) on delete cascade,
  serial      text not null default '',
  condition   text not null default '',
  status      public.unit_status not null default 'active',
  created_at  timestamptz not null default now()
);
create index units_item_idx on public.units (item_id);

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  renter_id   uuid not null references auth.users (id) on delete cascade default auth.uid(),
  raw_text    text not null default '',
  answers     jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  starts_at   timestamptz,
  ends_at     timestamptz,
  area        text not null default '',
  created_at  timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index events_renter_idx on public.events (renter_id);

create type public.setup_level as enum ('good', 'better', 'best');
create table public.recommendations (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  level          public.setup_level not null,
  lines          jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  rules_version  text not null,
  created_at     timestamptz not null default now()
);
create index recommendations_event_idx on public.recommendations (event_id);

-- Every request we couldn't fill: tells us what to source or buy (PRD §3.2).
create table public.unmet_demand (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references public.events (id) on delete set null,
  category_key  text not null references public.categories (key),
  spec          jsonb not null default '{}'::jsonb,
  quantity      int not null check (quantity > 0),
  period        tstzrange,
  area          text not null default '',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Booking. One booking per vendor per event, so payouts and vendor views stay simple.
-- ---------------------------------------------------------------------------
create type public.booking_status as enum ('hold', 'confirmed', 'out', 'returned', 'closed', 'cancelled', 'disputed');
create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete restrict,
  renter_id        uuid not null references auth.users (id) on delete restrict,
  vendor_id        uuid not null references public.vendors (id) on delete restrict,
  status           public.booking_status not null default 'hold',
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  hold_expires_at  timestamptz,
  delivery         text not null default 'pickup' check (delivery in ('pickup', 'delivery', 'delivery_setup')),
  total_kobo       bigint not null default 0 check (total_kobo >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index bookings_renter_idx on public.bookings (renter_id);
create index bookings_vendor_idx on public.bookings (vendor_id);
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

-- A unit is taken for a period, either by a booking or by the vendor's own use (a church's Sunday
-- service). The exclusion constraint makes the database refuse two live reservations of one unit
-- that overlap, however the request arrives.
create table public.reservations (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units (id) on delete cascade,
  booking_id  uuid references public.bookings (id) on delete cascade,   -- null = vendor block
  period      tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  note        text not null default '',
  live        boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint reservations_no_overlap exclude using gist (unit_id with =, period with &&) where (live)
);
create index reservations_booking_idx on public.reservations (booking_id);

-- Cancelled, returned and closed bookings free their units.
create or replace function private.sync_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    update public.reservations set live = new.status in ('hold', 'confirmed', 'out', 'disputed')
     where booking_id = new.id;
  end if;
  return new;
end $$;
create trigger bookings_sync_reservations after update of status on public.bookings
  for each row execute function private.sync_reservations();

-- ---------------------------------------------------------------------------
-- Coming soon: ad space, media crew, studios (PRD §4.9)
-- ---------------------------------------------------------------------------
create type public.waitlist_vertical as enum ('ad_space', 'crew', 'studio');
create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  vertical    public.waitlist_vertical not null,
  name        text not null check (length(trim(name)) > 0),
  contact     text not null check (length(trim(contact)) > 0),
  role        text not null default '' check (role in ('', 'buyer', 'supplier')),
  details     text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access helpers (security definer, so policies don't recurse through each other's RLS)
-- ---------------------------------------------------------------------------
create or replace function private.is_ops() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_ops from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function private.is_vendor_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vendor_members m where m.vendor_id = target and m.user_id = auth.uid());
$$;

create or replace function private.item_vendor(target uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select i.vendor_id from public.items i where i.id = target;
$$;

create or replace function private.unit_vendor(target uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select i.vendor_id from public.units u join public.items i on i.id = u.item_id where u.id = target;
$$;

-- Public catalogue: active gear from approved vendors.
create or replace function private.item_is_public(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.items i join public.vendors v on v.id = i.vendor_id
                  where i.id = target and i.active and v.approved_at is not null);
$$;

create or replace function private.owns_event(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = target and e.renter_id = auth.uid());
$$;

create or replace function private.booking_renter(target uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.renter_id from public.bookings b where b.id = target;
$$;

revoke all on all functions in schema private from public;
grant execute on function private.is_ops(), private.is_vendor_member(uuid), private.item_vendor(uuid),
  private.unit_vendor(uuid), private.item_is_public(uuid), private.owns_event(uuid), private.booking_renter(uuid)
  to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.vendors          enable row level security;
alter table public.vendor_members   enable row level security;
alter table public.categories       enable row level security;
alter table public.items            enable row level security;
alter table public.units            enable row level security;
alter table public.events           enable row level security;
alter table public.recommendations  enable row level security;
alter table public.unmet_demand     enable row level security;
alter table public.bookings         enable row level security;
alter table public.reservations     enable row level security;
alter table public.waitlist         enable row level security;

-- Profiles: you see and edit your own. Trust level, Ops and blocked are never writable by users:
-- only the listed columns are granted.
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or private.is_ops());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update on public.profiles from authenticated, anon;
grant insert (id, full_name, phone, wants_to_rent, has_gear) on public.profiles to authenticated;
grant update (full_name, phone, wants_to_rent, has_gear) on public.profiles to authenticated;

-- Vendors: anyone sees approved vendors; members and Ops see their own/all. Created through
-- create_vendor(). Members edit their details; approval and CAC verification belong to Ops.
create policy vendors_select on public.vendors for select to anon, authenticated
  using (approved_at is not null or private.is_vendor_member(id) or private.is_ops());
create policy vendors_update on public.vendors for update to authenticated
  using (private.is_vendor_member(id)) with check (private.is_vendor_member(id));
revoke insert, update on public.vendors from authenticated, anon;
grant update (name, vendor_type, city, areas, phone, offers_delivery, offers_technician, cac_number) on public.vendors to authenticated;

create policy vendor_members_select on public.vendor_members for select to authenticated
  using (user_id = auth.uid() or private.is_vendor_member(vendor_id) or private.is_ops());

create policy categories_select on public.categories for select to anon, authenticated using (true);

create policy items_select on public.items for select to anon, authenticated
  using (private.item_is_public(id) or private.is_vendor_member(vendor_id) or private.is_ops());
create policy items_insert on public.items for insert to authenticated with check (private.is_vendor_member(vendor_id));
create policy items_update on public.items for update to authenticated
  using (private.is_vendor_member(vendor_id)) with check (private.is_vendor_member(vendor_id));
create policy items_delete on public.items for delete to authenticated using (private.is_vendor_member(vendor_id));

create policy units_select on public.units for select to anon, authenticated
  using (private.item_is_public(item_id) or private.is_vendor_member(private.item_vendor(item_id)) or private.is_ops());
create policy units_insert on public.units for insert to authenticated with check (private.is_vendor_member(private.item_vendor(item_id)));
create policy units_update on public.units for update to authenticated
  using (private.is_vendor_member(private.item_vendor(item_id))) with check (private.is_vendor_member(private.item_vendor(item_id)));
create policy units_delete on public.units for delete to authenticated using (private.is_vendor_member(private.item_vendor(item_id)));

create policy events_select on public.events for select to authenticated using (renter_id = auth.uid() or private.is_ops());
create policy events_insert on public.events for insert to authenticated with check (renter_id = auth.uid());
create policy events_update on public.events for update to authenticated using (renter_id = auth.uid()) with check (renter_id = auth.uid());
create policy events_delete on public.events for delete to authenticated using (renter_id = auth.uid());

create policy recommendations_select on public.recommendations for select to authenticated using (private.owns_event(event_id) or private.is_ops());
create policy recommendations_insert on public.recommendations for insert to authenticated with check (private.owns_event(event_id));

create policy unmet_select on public.unmet_demand for select to authenticated using (private.is_ops());
create policy unmet_insert on public.unmet_demand for insert to authenticated with check (event_id is not null and private.owns_event(event_id));

-- Bookings are created and moved through their statuses by server functions (Phase 3), not directly.
create policy bookings_select on public.bookings for select to authenticated
  using (renter_id = auth.uid() or private.is_vendor_member(vendor_id) or private.is_ops());

-- Reservations: vendors and Ops see a unit's calendar; a renter sees their own booking's. Vendors add
-- and remove their own blocks directly; booking reservations come from server functions (Phase 3).
create policy reservations_select on public.reservations for select to authenticated
  using (private.is_vendor_member(private.unit_vendor(unit_id)) or private.is_ops()
         or (booking_id is not null and private.booking_renter(booking_id) = auth.uid()));
create policy reservations_insert_block on public.reservations for insert to authenticated
  with check (booking_id is null and private.is_vendor_member(private.unit_vendor(unit_id)));
create policy reservations_delete_block on public.reservations for delete to authenticated
  using (booking_id is null and private.is_vendor_member(private.unit_vendor(unit_id)));

create policy waitlist_insert on public.waitlist for insert to anon, authenticated with check (true);
create policy waitlist_select on public.waitlist for select to authenticated using (private.is_ops());

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------
-- Creates a vendor and makes the caller its owner, in one step.
create or replace function public.create_vendor(
  vendor_name text, kind public.vendor_type, vendor_city text default 'Lagos', vendor_areas text[] default '{}',
  vendor_phone text default '', delivery boolean default false, technician boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); new_id uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.vendors (name, vendor_type, city, areas, phone, offers_delivery, offers_technician)
  values (trim(vendor_name), kind, coalesce(nullif(trim(vendor_city), ''), 'Lagos'), vendor_areas, vendor_phone, delivery, technician)
  returning id into new_id;
  insert into public.vendor_members (vendor_id, user_id, role) values (new_id, uid, 'owner');
  return new_id;
end $$;
revoke all on function public.create_vendor from public, anon;
grant execute on function public.create_vendor to authenticated;

-- Ops approves a vendor so their gear appears in the public catalogue.
create or replace function public.approve_vendor(target uuid, approve boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_ops() then raise exception 'Ops only' using errcode = '42501'; end if;
  update public.vendors set approved_at = case when approve then now() end where id = target;
end $$;
revoke all on function public.approve_vendor from public, anon;
grant execute on function public.approve_vendor to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: listing photos, public to read. First path segment = vendor id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('items', 'items', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function private.path_vendor(object_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(object_name, '/', 1)::uuid end;
$$;
grant execute on function private.path_vendor(text) to authenticated;

create policy items_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'items' and private.is_vendor_member(private.path_vendor(name)));
create policy items_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'items' and private.is_vendor_member(private.path_vendor(name)));
create policy items_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'items' and private.is_vendor_member(private.path_vendor(name)));
