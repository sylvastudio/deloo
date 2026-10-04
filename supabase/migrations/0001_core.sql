-- Deloo core schema (PRD §6). Every tenant row carries org_id so RLS can scope it.

create extension if not exists pgcrypto;

create type public.plan_tier as enum ('free', 'pro', 'network');
create type public.unit_type as enum ('branch', 'department', 'cell');
create type public.member_role as enum ('admin', 'volunteer');
create type public.brief_status as enum ('draft', 'generated', 'archived');
-- Print sizes (a5_handbill_bleed, flex_3x6ft, …) are added in Phase 4.
create type public.asset_size as enum ('ig_post', 'ig_story', 'whatsapp', 'x_banner', 'a5_handbill');

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  org_type    text,                       -- church, school, ngo, business, association, events, other
  structure   text check (structure in ('single', 'branches', 'units')),
  plan        public.plan_tier not null default 'free',
  created_at  timestamptz not null default now()
);

create table public.units (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations (id) on delete cascade,
  parent_unit_id  uuid references public.units (id) on delete set null,  -- room for the post-MVP hierarchy
  name            text not null check (length(trim(name)) > 0),
  type            public.unit_type not null default 'branch',
  created_at      timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)                     -- lets memberships/briefs prove a unit belongs to their org
);

create table public.memberships (
  user_id     uuid not null references auth.users (id) on delete cascade,
  org_id      uuid not null references public.organisations (id) on delete cascade,
  unit_id     uuid,
  role        public.member_role not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, org_id),
  foreign key (unit_id, org_id) references public.units (id, org_id) on delete cascade,
  -- Volunteers always belong to a unit; HQ admins may sit above units.
  check (role = 'admin' or unit_id is not null)
);
create index memberships_org_idx on public.memberships (org_id);

-- ---------------------------------------------------------------------------
-- Brand kit. One master kit per org (unit_id null); sub-brand kits per unit later.
-- colours/fonts use the keys the templates read: primary, accent, paper, ink / heading, body.
-- ---------------------------------------------------------------------------
create table public.brand_kits (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations (id) on delete cascade,
  unit_id       uuid,
  logos         jsonb not null default '[]'::jsonb,        -- storage paths in the brand bucket
  colours       jsonb not null default '{"primary":"#2B3FB8","accent":"#F2C230","paper":"#E5E8F5","ink":"#0E1224"}'::jsonb,
  colour_source text not null default 'default' check (colour_source in ('default', 'logo', 'custom')),
  fonts         jsonb not null default '{"heading":"Archivo","body":"Inter Tight"}'::jsonb,
  tone          text not null default '',
  sample_posts  jsonb not null default '[]'::jsonb,
  grain         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (unit_id, org_id) references public.units (id, org_id) on delete cascade,
  check (jsonb_typeof(colours) = 'object'
     and colours ->> 'primary' ~ '^#[0-9A-Fa-f]{6}$'
     and colours ->> 'accent'  ~ '^#[0-9A-Fa-f]{6}$'
     and colours ->> 'paper'   ~ '^#[0-9A-Fa-f]{6}$'
     and colours ->> 'ink'     ~ '^#[0-9A-Fa-f]{6}$')
);
create unique index brand_kits_master_uidx on public.brand_kits (org_id) where unit_id is null;
create unique index brand_kits_unit_uidx on public.brand_kits (org_id, unit_id) where unit_id is not null;
create trigger brand_kits_touch before update on public.brand_kits
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Catalogue (global, code-defined). A category is a poster type with its slot schema;
-- a template is a style that can draw any category (Phase 1 scope update).
-- ---------------------------------------------------------------------------
create table public.categories (
  key              text primary key,
  label            text not null,
  description      text not null default '',
  slot_schema      jsonb not null,           -- fields the LLM fills (Phase 3 JSON schema)
  slot_conventions jsonb not null default '{}'::jsonb,  -- role lines, honorifics (Phase 4)
  sort             int not null default 0,
  available        boolean not null default true
);

create table public.templates (
  key            text primary key,           -- style key, e.g. 'badge'
  name           text not null,
  description    text not null default '',
  sizes          public.asset_size[] not null default '{ig_post,ig_story,x_banner,a5_handbill}',
  component_key  text not null,              -- React component in components/templates
  sort           int not null default 0
);

-- What an org chose during onboarding: the types it makes and the styles it leads with.
create table public.org_categories (
  org_id        uuid not null references public.organisations (id) on delete cascade,
  category_key  text not null references public.categories (key),
  primary key (org_id, category_key)
);
create table public.org_templates (
  org_id        uuid not null references public.organisations (id) on delete cascade,
  template_key  text not null references public.templates (key),
  position      int not null default 0,
  primary key (org_id, template_key)
);
-- "Something else" requests from onboarding.
create table public.type_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  description  text not null default '',
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Work: briefs → assets → print specs
-- ---------------------------------------------------------------------------
create table public.briefs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations (id) on delete cascade,
  unit_id       uuid,
  author_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  category_key  text not null references public.categories (key),
  raw_text      text not null default '',
  fields        jsonb not null default '{}'::jsonb,
  status        public.brief_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (unit_id, org_id) references public.units (id, org_id) on delete set null (unit_id),
  unique (id, org_id)
);
create index briefs_org_idx on public.briefs (org_id, created_at desc);
create trigger briefs_touch before update on public.briefs
  for each row execute function public.touch_updated_at();

create table public.assets (
  id            uuid primary key default gen_random_uuid(),
  brief_id      uuid not null,
  org_id        uuid not null,
  template_key  text not null references public.templates (key),
  size          public.asset_size not null,
  copy          jsonb not null default '{}'::jsonb,
  file_path     text,                        -- exports/{org_id}/{brief_id}/…
  version       int not null default 1 check (version > 0),
  created_at    timestamptz not null default now(),
  unique (brief_id, template_key, size, version),
  unique (id, org_id),
  foreign key (brief_id, org_id) references public.briefs (id, org_id) on delete cascade  -- asset's org = brief's org
);
create index assets_brief_idx on public.assets (brief_id);

create table public.print_specs (
  asset_id       uuid primary key,
  org_id         uuid not null,
  physical_size  text not null,
  bleed_mm       numeric(5, 2) not null default 3,
  dpi            int not null default 300 check (dpi > 0),
  colour_note    text not null default '',
  foreign key (asset_id, org_id) references public.assets (id, org_id) on delete cascade
);
