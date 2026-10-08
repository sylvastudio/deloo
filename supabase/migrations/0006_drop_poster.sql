-- Rental pivot (PRD v2, 8 Oct 2026): remove the poster tool's schema.
--
-- BEFORE RUNNING, check what is there:
--   select name, created_at from public.organisations;
--   select count(*) from public.briefs;
-- This file stops with an error while any organisation exists, so real data is never dropped by
-- accident. If every row is yours to throw away, run `delete from public.organisations;` first.
--
-- Storage: Supabase won't let SQL delete stored files. After this runs, empty and delete the `brand`,
-- `exports` and `print` buckets in Storage. Their access policies are removed here, so until then
-- nobody but the service role can read them.

do $$
declare n int;
begin
  select count(*) into n from public.organisations;
  if n > 0 then
    raise exception 'public.organisations still has % row(s). Look at them, delete them if they can go, then run this again.', n;
  end if;
end $$;

drop policy if exists brand_read    on storage.objects;
drop policy if exists brand_insert  on storage.objects;
drop policy if exists brand_update  on storage.objects;
drop policy if exists brand_delete  on storage.objects;
drop policy if exists outputs_read  on storage.objects;
drop policy if exists outputs_write on storage.objects;

drop function if exists public.create_organisation(text, text, text, text[], text[]);

drop table if exists public.print_specs, public.assets, public.briefs, public.type_requests,
  public.org_templates, public.org_categories, public.templates, public.categories,
  public.brand_kits, public.memberships, public.units, public.organisations cascade;

drop function if exists private.can_read_brief(uuid);
drop function if exists private.can_write_brief(uuid);
drop function if exists private.is_member(uuid);
drop function if exists private.is_admin(uuid);
drop function if exists private.my_unit(uuid);
drop function if exists private.path_org(text);

drop type if exists public.asset_size, public.brief_status, public.member_role, public.unit_type, public.plan_tier;
