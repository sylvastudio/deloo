-- Row-level security: org isolation, admin-only brand kit writes (PRD §6, plan step 2.4).
-- Helpers live in a schema the API doesn't expose and run as definer so policies
-- can read memberships without recursing through memberships' own RLS.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_member(target_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.org_id = target_org and m.user_id = auth.uid());
$$;

create or replace function private.is_admin(target_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.org_id = target_org and m.user_id = auth.uid() and m.role = 'admin');
$$;

create or replace function private.my_unit(target_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.unit_id from public.memberships m where m.org_id = target_org and m.user_id = auth.uid();
$$;

-- Can the caller see this brief? Admins see every brief in the org; volunteers see
-- their own and their unit's.
create or replace function private.can_read_brief(target_brief uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.briefs b
    where b.id = target_brief
      and (private.is_admin(b.org_id)
           or (private.is_member(b.org_id) and (b.author_id = auth.uid() or b.unit_id = private.my_unit(b.org_id))))
  );
$$;
create or replace function private.can_write_brief(target_brief uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.briefs b
    where b.id = target_brief and (private.is_admin(b.org_id) or (private.is_member(b.org_id) and b.author_id = auth.uid()))
  );
$$;

grant execute on all functions in schema private to authenticated;

alter table public.organisations  enable row level security;
alter table public.units          enable row level security;
alter table public.memberships    enable row level security;
alter table public.brand_kits     enable row level security;
alter table public.categories     enable row level security;
alter table public.templates      enable row level security;
alter table public.org_categories enable row level security;
alter table public.org_templates  enable row level security;
alter table public.type_requests  enable row level security;
alter table public.briefs         enable row level security;
alter table public.assets         enable row level security;
alter table public.print_specs    enable row level security;

-- Organisations: members read; admins rename. Created only through create_organisation().
create policy org_select on public.organisations for select to authenticated using (private.is_member(id));
create policy org_update on public.organisations for update to authenticated using (private.is_admin(id)) with check (private.is_admin(id));

-- Units: members read; admins manage.
create policy units_select on public.units for select to authenticated using (private.is_member(org_id));
create policy units_write  on public.units for all    to authenticated using (private.is_admin(org_id)) with check (private.is_admin(org_id));

-- Memberships: you see your own row; admins see and manage the org's.
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or private.is_admin(org_id));
create policy memberships_write on public.memberships for all to authenticated
  using (private.is_admin(org_id)) with check (private.is_admin(org_id));

-- Brand kits: every member reads (volunteers design with it); only admins write.
create policy brand_kits_select on public.brand_kits for select to authenticated using (private.is_member(org_id));
create policy brand_kits_insert on public.brand_kits for insert to authenticated with check (private.is_admin(org_id));
create policy brand_kits_update on public.brand_kits for update to authenticated using (private.is_admin(org_id)) with check (private.is_admin(org_id));
create policy brand_kits_delete on public.brand_kits for delete to authenticated using (private.is_admin(org_id));

-- Catalogue: read-only for signed-in users; changed by migrations/seed only.
create policy categories_select on public.categories for select to authenticated using (true);
create policy templates_select  on public.templates  for select to authenticated using (true);

-- Onboarding choices: members read; admins change.
create policy org_categories_select on public.org_categories for select to authenticated using (private.is_member(org_id));
create policy org_categories_write  on public.org_categories for all    to authenticated using (private.is_admin(org_id)) with check (private.is_admin(org_id));
create policy org_templates_select  on public.org_templates  for select to authenticated using (private.is_member(org_id));
create policy org_templates_write   on public.org_templates  for all    to authenticated using (private.is_admin(org_id)) with check (private.is_admin(org_id));

-- Type requests: any member can ask; admins read them all.
create policy type_requests_insert on public.type_requests for insert to authenticated
  with check (private.is_member(org_id) and created_by = auth.uid());
create policy type_requests_select on public.type_requests for select to authenticated
  using (created_by = auth.uid() or private.is_admin(org_id));

-- Briefs: volunteers create in their own unit, as themselves.
create policy briefs_select on public.briefs for select to authenticated using (private.can_read_brief(id));
create policy briefs_insert on public.briefs for insert to authenticated with check (
  author_id = auth.uid() and private.is_member(org_id)
  and (private.is_admin(org_id) or unit_id is not distinct from private.my_unit(org_id))
);
create policy briefs_update on public.briefs for update to authenticated
  using (private.can_write_brief(id))
  with check (private.is_admin(org_id) or (author_id = auth.uid() and unit_id is not distinct from private.my_unit(org_id)));
create policy briefs_delete on public.briefs for delete to authenticated using (private.can_write_brief(id));

-- Assets and print specs follow their brief.
create policy assets_select on public.assets for select to authenticated using (private.can_read_brief(brief_id));
create policy assets_write  on public.assets for all    to authenticated using (private.can_write_brief(brief_id)) with check (private.can_write_brief(brief_id));
create policy print_specs_select on public.print_specs for select to authenticated
  using (exists (select 1 from public.assets a where a.id = asset_id and private.can_read_brief(a.brief_id)));
create policy print_specs_write on public.print_specs for all to authenticated
  using (exists (select 1 from public.assets a where a.id = asset_id and private.can_write_brief(a.brief_id)))
  with check (exists (select 1 from public.assets a where a.id = asset_id and private.can_write_brief(a.brief_id)));

-- ---------------------------------------------------------------------------
-- Sign-up → organisation. One call creates the org, makes the caller its admin,
-- creates the master brand kit and saves the onboarding choices.
-- ---------------------------------------------------------------------------
create or replace function public.create_organisation(
  org_name text, org_type text, org_structure text,
  category_keys text[] default '{}', template_keys text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_org uuid;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if exists (select 1 from public.memberships where user_id = uid) then
    raise exception 'already a member of an organisation' using errcode = '23505';
  end if;
  insert into public.organisations (name, org_type, structure) values (trim(org_name), org_type, org_structure) returning id into new_org;
  insert into public.memberships (user_id, org_id, role) values (uid, new_org, 'admin');
  insert into public.brand_kits (org_id) values (new_org);
  insert into public.org_categories (org_id, category_key) select new_org, k from unnest(category_keys) k
    where k in (select key from public.categories where available);
  insert into public.org_templates (org_id, template_key, position) select new_org, k, ord from unnest(template_keys) with ordinality t(k, ord)
    where k in (select key from public.templates);
  return new_org;
end $$;
revoke all on function public.create_organisation from public, anon;
grant execute on function public.create_organisation to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket per kind, first path segment = org_id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('brand',   'brand',   false, 10485760, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'font/ttf', 'font/otf', 'font/woff', 'font/woff2']),
  ('exports', 'exports', false, 52428800, array['image/png']),
  ('print',   'print',   false, 52428800, array['image/png', 'application/pdf'])
on conflict (id) do nothing;

create or replace function private.path_org(object_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(object_name, '/', 1)::uuid end;
$$;
grant execute on function private.path_org to authenticated;

create policy brand_read   on storage.objects for select to authenticated using (bucket_id = 'brand' and private.is_member(private.path_org(name)));
create policy brand_insert on storage.objects for insert to authenticated with check (bucket_id = 'brand' and private.is_admin(private.path_org(name)));
create policy brand_update on storage.objects for update to authenticated using (bucket_id = 'brand' and private.is_admin(private.path_org(name)));
create policy brand_delete on storage.objects for delete to authenticated using (bucket_id = 'brand' and private.is_admin(private.path_org(name)));

create policy outputs_read  on storage.objects for select to authenticated using (bucket_id in ('exports', 'print') and private.is_member(private.path_org(name)));
create policy outputs_write on storage.objects for insert to authenticated with check (bucket_id in ('exports', 'print') and private.is_member(private.path_org(name)));
