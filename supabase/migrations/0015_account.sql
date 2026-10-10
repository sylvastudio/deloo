-- 0015: account deletion requests (Google Play's account-deletion requirement; Phase 1 Account hub).
-- Run in the Supabase SQL Editor after 0014. Safe to re-run.
--
-- The app's Delete account screen calls request_account_deletion(reason) and signs the person out.
-- Deloo processes requests by hand (open bookings, deposits and refunds may still need finishing),
-- then sets processed_at. Payment records the law requires us to keep are kept.

create table if not exists public.account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  reason       text not null default '',
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.account_deletion_requests enable row level security;

-- People see and add their own request; Deloo staff see all of them.
drop policy if exists account_deletion_select on public.account_deletion_requests;
create policy account_deletion_select on public.account_deletion_requests for select to authenticated
  using (user_id = auth.uid() or private.is_ops() or private.is_staff());
drop policy if exists account_deletion_insert on public.account_deletion_requests;
create policy account_deletion_insert on public.account_deletion_requests for insert to authenticated
  with check (user_id = auth.uid());

-- Users may only write who and why; processed_at is for staff (service role / SQL editor).
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant insert (user_id, reason) on public.account_deletion_requests to authenticated;

/**
 * Record (or re-record) the signed-in person's request to delete their account. Asking again before
 * it's processed just updates the reason, so a double tap or a retry after a dropped connection is fine.
 */
create or replace function public.request_account_deletion(p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_at timestamptz;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  insert into public.account_deletion_requests (user_id, reason)
  values (uid, left(coalesce(p_reason, ''), 1000))
  on conflict (user_id) do update
    set reason = case when excluded.reason <> '' then excluded.reason else public.account_deletion_requests.reason end
  returning created_at into v_at;
  return jsonb_build_object('requested_at', v_at);
end;
$$;

revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;
