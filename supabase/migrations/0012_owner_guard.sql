-- Only an owner can create, change or remove an owner, or make someone an owner. RLS lets admins manage
-- staff (0011 staff_write); this closes the gap where an admin could promote themselves through the API.
-- The service role (SQL editor, server scripts) is not limited.

create or replace function private.guard_owner_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;   -- service role / SQL editor
  if (tg_op <> 'INSERT' and old.role = 'owner') or (tg_op <> 'DELETE' and new.role = 'owner') then
    if not exists (select 1 from public.staff_members s where s.user_id = auth.uid() and s.active and s.role = 'owner') then
      raise exception 'Only an owner can add or change an owner.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger staff_members_owner_guard before insert or update or delete on public.staff_members
  for each row execute function private.guard_owner_rows();
