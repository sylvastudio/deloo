-- Fix: a volunteer creating a brief and reading it back in the same request (INSERT … RETURNING)
-- was refused. The read policy looked the brief up by id inside a function, and that lookup can't
-- see a row inserted by the same statement. Check the row's own columns instead.

drop policy if exists briefs_select on public.briefs;
drop policy if exists briefs_update on public.briefs;
drop policy if exists briefs_delete on public.briefs;

-- Admins see every brief in the org; volunteers see their own and their unit's.
create policy briefs_select on public.briefs for select to authenticated using (
  private.is_admin(org_id)
  or (private.is_member(org_id) and (author_id = auth.uid() or unit_id = private.my_unit(org_id)))
);
create policy briefs_update on public.briefs for update to authenticated
  using (private.is_admin(org_id) or (private.is_member(org_id) and author_id = auth.uid()))
  with check (private.is_admin(org_id) or (author_id = auth.uid() and unit_id is not distinct from private.my_unit(org_id)));
create policy briefs_delete on public.briefs for delete to authenticated
  using (private.is_admin(org_id) or (private.is_member(org_id) and author_id = auth.uid()));
