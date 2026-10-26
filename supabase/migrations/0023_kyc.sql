-- 0023: renter ID verification (KYC), manual path. Run in the Supabase SQL Editor after 0022. Safe to re-run.
--
-- Spec: docs/kyc-contract.md ("Database"). UX: docs/ux-kyc-protection.md §2, §4, §7.
--
--  1. profiles: kyc_* columns (renters can read them, never write them), blocked_reason, and every
--     signed-in renter is tier 1 (trust_level 0 now means "no account", per the tier table).
--  2. app_settings: kyc_value_kobo (₦400k) and trust3_value_kobo (₦5m).
--  3. bookings.required_trust, snapshotted by create_hold.
--  4. kyc_submissions: one row per ID + selfie the renter sends. Renters read their own; staff
--     (owner/admin/ops) read all. Nobody writes it directly; submit_kyc / staff_decide_kyc do.
--  5. Storage bucket kyc-documents (private): renters may only upload into <their uid>/…; staff
--     (owner/admin/ops) may read (the admin portal signs short-lived URLs).
--  6. kyc_gate(p_lines): what the Review screen asks before Pay.
--  7. submit_kyc(...): the renter's submission; sets kyc_status = 'pending'.
--  8. staff_decide_kyc(...): approve / approve_t3 / needs_more / reject, written to audit_log.
--  9. create_hold (0014) + the gate and the required_trust snapshot.
-- 10. Dispatch gate: staff_set_booking_status (0020) refuses out_for_delivery, or a pickup handover
--     (preparing/confirmed → delivered), with 'not_verified' while the renter's tier is below the
--     booking's required_trust. A trigger on bookings enforces the same for direct updates.
-- 11. Tier 3 is automatic: 2 closed bookings with no claim and the renter is tier 2 → tier 3.
--
-- Tiers (trust_level): 1 signed in · 2 ID + selfie approved · 3 tier 2 + 2 clean rentals (or staff).
-- Required tier for a basket: 3 if its replacement value > trust3_value_kobo; else 2 if it has a camera
-- or a lens, or its value > kyc_value_kobo; else 1.

-- ---------------------------------------------------------------------------
-- 1. Profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists kyc_status      text not null default 'none'
    check (kyc_status in ('none', 'pending', 'needs_more', 'verified', 'rejected')),
  add column if not exists kyc_reason      text,            -- renter-facing reason for needs_more / rejected
  add column if not exists kyc_verified_at timestamptz,
  add column if not exists kyc_expires_at  timestamptz,
  add column if not exists kyc_method      text check (kyc_method is null or kyc_method in ('manual', 'dojah', 'smile')),
  add column if not exists kyc_ref         text,            -- provider reference only, never an ID number
  add column if not exists kyc_id_type     text,
  add column if not exists kyc_name        text,            -- name as on the ID
  add column if not exists blocked_reason  text;            -- set by staff; blocks booking like `blocked`

-- Tier 1 = signed in (docs/ux-kyc-protection.md §2). Profiles only exist for signed-in people.
alter table public.profiles alter column trust_level set default 1;
update public.profiles set trust_level = 1 where trust_level = 0;

-- Renters may only write the columns 0007 granted. If a table-wide UPDATE grant crept back in
-- (Supabase's default privileges), take it away and re-grant just those columns.
do $$
begin
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    revoke update on public.profiles from authenticated;
    grant update (full_name, phone, wants_to_rent, has_gear) on public.profiles to authenticated;
    raise notice 'profiles: removed a table-wide UPDATE grant from authenticated';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'UPDATE') then
    revoke update on public.profiles from anon;
  end if;
end $$;
revoke update (trust_level, blocked, blocked_reason, is_ops, kyc_status, kyc_reason, kyc_verified_at, kyc_expires_at,
               kyc_method, kyc_ref, kyc_id_type, kyc_name)
  on public.profiles from authenticated, anon;

create index if not exists profiles_kyc_pending_idx on public.profiles (kyc_status) where kyc_status in ('pending', 'needs_more');

-- ---------------------------------------------------------------------------
-- 2. Settings
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column if not exists kyc_value_kobo    bigint not null default 40000000  check (kyc_value_kobo >= 0),
  add column if not exists trust3_value_kobo bigint not null default 500000000 check (trust3_value_kobo >= 0);

-- ---------------------------------------------------------------------------
-- 3. Bookings
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists required_trust smallint check (required_trust is null or required_trust between 1 and 3);

-- ---------------------------------------------------------------------------
-- 4. Submissions
-- ---------------------------------------------------------------------------
create table if not exists public.kyc_submissions (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  method           text not null default 'manual' check (method in ('manual', 'dojah', 'smile')),
  id_type          text not null check (id_type in ('nin_slip', 'drivers_licence', 'voters_card', 'passport')),
  doc_last4        text check (doc_last4 is null or doc_last4 ~ '^[A-Za-z0-9]{4}$'),   -- never the full number
  front_path       text not null,
  back_path        text,
  selfie_path      text not null,
  consent_at       timestamptz not null,
  consent_version  text not null,
  status           text not null default 'pending' check (status in ('pending', 'needs_more', 'verified', 'rejected')),
  reason_code      text check (reason_code is null or reason_code in
                     ('blurry', 'glare', 'id_expired', 'face_unclear', 'name_mismatch', 'id_not_accepted', 'other')),
  reason_note      text,
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  media_deleted_at timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists kyc_submissions_profile_idx on public.kyc_submissions (profile_id, created_at desc);
create index if not exists kyc_submissions_pending_idx on public.kyc_submissions (created_at) where status = 'pending';
-- One submission waiting for review per renter (also stops a double tap making two).
create unique index if not exists kyc_submissions_one_pending on public.kyc_submissions (profile_id) where status = 'pending';

alter table public.kyc_submissions enable row level security;
revoke all on public.kyc_submissions from anon, authenticated;
grant select on public.kyc_submissions to authenticated;

drop policy if exists kyc_submissions_select on public.kyc_submissions;
create policy kyc_submissions_select on public.kyc_submissions for select to authenticated
  using (profile_id = auth.uid() or private.staff_has(array['admin', 'ops']));

-- staff_decide_kyc looks up the audit trail by entity; the tier-3 check looks up bookings' history.
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- 5. Storage: <auth.uid()>/<client uuid>/{front,back,selfie}.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('kyc-documents', 'kyc-documents', false, 8388608, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Renters: INSERT into their own folder only (upload with upsert off; there is no select/update/delete).
drop policy if exists kyc_files_insert on storage.objects;
create policy kyc_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc-documents' and auth.uid() is not null
              and split_part(name, '/', 1) = auth.uid()::text
              and name !~ '\.\.' and array_length(string_to_array(name, '/'), 1) = 3);
-- Staff (owner/admin/ops) read, for the signed URLs in A-72. Riders, finance and read-only don't.
drop policy if exists kyc_files_staff_select on storage.objects;
create policy kyc_files_staff_select on storage.objects for select to authenticated
  using (bucket_id = 'kyc-documents' and private.staff_has(array['admin', 'ops']));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
/** Is this renter barred from booking? (0007's `blocked` flag, or a blocked_reason from staff.) */
create or replace function private.renter_blocked(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.blocked or coalesce(length(trim(p.blocked_reason)), 0) > 0
                     from public.profiles p where p.id = p_uid), false);
$$;

/** The renter's tier as the dispatch gate sees it: at least 1 once signed in. 0 = no profile. */
create or replace function private.renter_trust(p_uid uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  select coalesce((select greatest(p.trust_level, 1)::smallint from public.profiles p where p.id = p_uid), 0::smallint);
$$;

/**
 * The renter's standing for the checkout gate: {trust, kyc_status, kyc_reason, blocked}.
 * A verification past kyc_expires_at counts as none (tier 1), so the app asks for the ID again.
 */
create or replace function private.kyc_state(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'trust', case when p.kyc_expires_at is not null and p.kyc_expires_at <= now() then 1
                    else greatest(p.trust_level, 1) end,
      'kyc_status', case when p.kyc_status = 'verified' and p.kyc_expires_at is not null and p.kyc_expires_at <= now()
                         then 'none' else p.kyc_status end,
      'kyc_reason', case when p.kyc_status in ('needs_more', 'rejected') then p.kyc_reason end,
      'blocked', p.blocked or coalesce(length(trim(p.blocked_reason)), 0) > 0)
      from public.profiles p where p.id = p_uid),
    jsonb_build_object('trust', 0, 'kyc_status', 'none', 'kyc_reason', null, 'blocked', false));
$$;

/**
 * What a basket needs. p_lines as quote_booking: [{"item_id": uuid, "qty": int}], qty 1–20; lines
 * that aren't public, active items are skipped (quote_booking refuses those anyway).
 * Returns {required, basket_value_kobo, has_camera_or_lens, top_item: {name, value_kobo} | null}.
 * top_item is the single most valuable piece (replacement value of one unit).
 */
create or replace function private.kyc_basket(p_lines jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l jsonb;
  it record;
  qty int;
  v_id uuid;
  total bigint := 0;
  cam boolean := false;
  top_name text;
  top_value bigint := -1;
  kyc_value bigint;
  t3_value bigint;
  req smallint;
begin
  select s.kyc_value_kobo, s.trust3_value_kobo into kyc_value, t3_value from public.app_settings s where s.id = 1;
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'Add an item.' using errcode = '22023';
  end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    begin
      v_id := (l ->> 'item_id')::uuid;
      qty := greatest(1, least(20, coalesce((l ->> 'qty')::int, 1)));
    exception when invalid_text_representation or numeric_value_out_of_range then
      continue;
    end;
    select i.name, i.replacement_value_kobo, i.category_key into it
      from public.items i join public.vendors v on v.id = i.vendor_id and v.approved_at is not null
     where i.id = v_id and i.active;
    if not found then continue; end if;
    total := total + it.replacement_value_kobo * qty;
    cam := cam or it.category_key in ('camera', 'lens');
    if it.replacement_value_kobo > top_value then
      top_value := it.replacement_value_kobo;
      top_name := it.name;
    end if;
  end loop;

  req := case when total > coalesce(t3_value, 500000000) then 3
              when cam or total > coalesce(kyc_value, 40000000) then 2
              else 1 end;
  return jsonb_build_object(
    'required', req, 'basket_value_kobo', total, 'has_camera_or_lens', cam,
    'top_item', case when top_value >= 0 then jsonb_build_object('name', top_name, 'value_kobo', top_value) end);
end $$;

revoke all on function private.renter_blocked(uuid), private.renter_trust(uuid), private.kyc_state(uuid),
  private.kyc_basket(jsonb) from public, anon;
grant execute on function private.renter_blocked(uuid), private.renter_trust(uuid), private.kyc_state(uuid),
  private.kyc_basket(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. kyc_gate: the Review screen's question before Pay
-- ---------------------------------------------------------------------------
/**
 * {required: 1|2|3, trust, kyc_status, kyc_reason, basket_value_kobo, top_item: {name, value_kobo}|null,
 *  ok_to_pay, blocked}. ok_to_pay: trust ≥ required, or required = 2 while the ID is pending; never when blocked.
 */
create or replace function public.kyc_gate(p_lines jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  st jsonb;
  bk jsonb;
  req int;
  tr int;
  ok boolean;
begin
  if uid is null then raise exception 'Sign in to book.' using errcode = '42501'; end if;
  st := private.kyc_state(uid);
  bk := private.kyc_basket(p_lines);
  req := (bk ->> 'required')::int;
  tr := (st ->> 'trust')::int;
  ok := not (st ->> 'blocked')::boolean
        and (tr >= req or (req = 2 and st ->> 'kyc_status' = 'pending'));
  return jsonb_build_object(
    'required', req, 'trust', tr, 'kyc_status', st ->> 'kyc_status', 'kyc_reason', st -> 'kyc_reason',
    'basket_value_kobo', (bk ->> 'basket_value_kobo')::bigint, 'top_item', bk -> 'top_item',
    'ok_to_pay', ok, 'blocked', (st ->> 'blocked')::boolean);
end $$;
revoke all on function public.kyc_gate(jsonb) from public, anon;
grant execute on function public.kyc_gate(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. submit_kyc: the renter sends their ID and selfie (already uploaded to kyc-documents)
-- ---------------------------------------------------------------------------
create or replace function public.submit_kyc(
  p_id_type text, p_front_path text, p_back_path text, p_selfie_path text, p_consent_version text,
  p_doc_last4 text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  prefix text;
  path text;
  back text := nullif(trim(coalesce(p_back_path, '')), '');
  last4 text := nullif(trim(coalesce(p_doc_last4, '')), '');
  existing uuid;
  sub uuid;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into prof from public.profiles p where p.id = uid for update;
  if not found then raise exception 'Finish your profile first.' using errcode = '22023'; end if;

  if p_id_type is null or p_id_type not in ('nin_slip', 'drivers_licence', 'voters_card', 'passport') then
    raise exception 'Choose the type of ID.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_consent_version, ''))) = 0 then
    raise exception 'Tick the consent box to continue.' using errcode = '22023';
  end if;
  if last4 is not null and last4 !~ '^[A-Za-z0-9]{4}$' then
    raise exception 'Enter only the last 4 characters of the ID number.' using errcode = '22023';
  end if;
  if p_front_path is null or p_selfie_path is null then
    raise exception 'Add a photo of your ID and a selfie.' using errcode = '22023';
  end if;

  -- Every file must be in the renter's own folder of the kyc-documents bucket.
  prefix := uid::text || '/';
  foreach path in array array_remove(array[p_front_path, back, p_selfie_path], null) loop
    if left(path, length(prefix)) <> prefix or path ~ '\.\.' or length(path) > 300 then
      raise exception 'kyc_bad_path' using errcode = '42501';
    end if;
  end loop;

  -- A retry of a submission that already went through (lost response) returns the same id.
  select k.id into existing from public.kyc_submissions k
   where k.profile_id = uid and k.status = 'pending' and k.front_path = p_front_path and k.selfie_path = p_selfie_path;
  if existing is not null then return existing; end if;

  if prof.kyc_status = 'verified' and (prof.kyc_expires_at is null or prof.kyc_expires_at > now()) then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;
  if prof.kyc_status = 'rejected' then
    raise exception 'kyc_rejected' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.kyc_submissions k where k.profile_id = uid and k.status = 'pending') then
    raise exception 'kyc_pending' using errcode = 'P0001';
  end if;

  insert into public.kyc_submissions (profile_id, method, id_type, doc_last4, front_path, back_path, selfie_path,
                                      consent_at, consent_version)
  values (uid, 'manual', p_id_type, last4, p_front_path, back, p_selfie_path, now(), left(trim(p_consent_version), 40))
  returning id into sub;

  update public.profiles set kyc_status = 'pending', kyc_reason = null where id = uid;
  return sub;
end $$;
revoke all on function public.submit_kyc(text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_kyc(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. staff_decide_kyc: owner / admin / ops review a pending submission
-- ---------------------------------------------------------------------------
create or replace function public.staff_decide_kyc(
  p_submission uuid, p_decision text, p_reason_code text default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sub public.kyc_submissions;
  before_p public.profiles;
  after_p public.profiles;
  code text := nullif(trim(coalesce(p_reason_code, '')), '');
  note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  new_status text;
begin
  if uid is null or not private.staff_has(array['admin', 'ops']) then
    raise exception 'Only ops, admin or the owner can review IDs.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'approve_t3', 'needs_more', 'reject') then
    raise exception 'Choose approve, approve as tier 3, need more or reject.' using errcode = '22023';
  end if;
  if code is not null and code not in ('blurry', 'glare', 'id_expired', 'face_unclear', 'name_mismatch', 'id_not_accepted', 'other') then
    raise exception 'Unknown reason.' using errcode = '22023';
  end if;
  if p_decision in ('needs_more', 'reject') and code is null then
    raise exception 'Choose a reason.' using errcode = '22023';
  end if;

  select * into sub from public.kyc_submissions where id = p_submission for update;
  if not found then raise exception 'Submission not found.' using errcode = '22023'; end if;
  if sub.status <> 'pending' then
    raise exception 'This submission was already reviewed (%).', sub.status using errcode = '22023';
  end if;
  select * into before_p from public.profiles where id = sub.profile_id for update;

  new_status := case p_decision when 'approve' then 'verified' when 'approve_t3' then 'verified'
                                when 'needs_more' then 'needs_more' else 'rejected' end;

  update public.kyc_submissions
     set status = new_status, reason_code = code, reason_note = note, reviewed_by = uid, reviewed_at = now()
   where id = sub.id;

  if new_status = 'verified' then
    update public.profiles
       set kyc_status = 'verified', kyc_reason = null,
           trust_level = greatest(trust_level, case when p_decision = 'approve_t3' then 3 else 2 end),
           kyc_verified_at = now(), kyc_expires_at = now() + interval '24 months',
           kyc_method = 'manual', kyc_id_type = sub.id_type
     where id = sub.profile_id
    returning * into after_p;
  else
    update public.profiles
       set kyc_status = new_status, kyc_reason = coalesce(note, code),
           -- A rejected renter can't keep a tier that rested on an ID.
           trust_level = case when new_status = 'rejected' then least(trust_level, 1) else trust_level end
     where id = sub.profile_id
    returning * into after_p;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (uid, 'kyc_' || p_decision, 'kyc_submissions', sub.id,
          jsonb_build_object('profile_id', sub.profile_id, 'submission_status', sub.status,
                             'kyc_status', before_p.kyc_status, 'trust_level', before_p.trust_level),
          jsonb_build_object('profile_id', sub.profile_id, 'submission_status', new_status,
                             'kyc_status', after_p.kyc_status, 'trust_level', after_p.trust_level,
                             'reason_code', code, 'reason_note', note, 'kyc_expires_at', after_p.kyc_expires_at));
end $$;
revoke all on function public.staff_decide_kyc(uuid, text, text, text) from public, anon;
grant execute on function public.staff_decide_kyc(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. create_hold: 0014 plus the KYC gate and the required_trust snapshot
-- ---------------------------------------------------------------------------
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
  st jsonb;
  req int;
  tr int;
begin
  if uid is null then raise exception 'Sign in to book.' using errcode = '42501'; end if;
  if private.renter_blocked(uid) then
    raise exception 'account_blocked' using errcode = 'P0001';
  end if;
  if p_event is not null and not private.owns_event(p_event) then raise exception 'Not your plan.' using errcode = '42501'; end if;

  -- KYC gate (docs/kyc-contract.md): paying is allowed while a tier-2 ID check is pending.
  st := private.kyc_state(uid);
  req := (private.kyc_basket(p_lines) ->> 'required')::int;
  tr := (st ->> 'trust')::int;
  if tr < req and not (req = 2 and st ->> 'kyc_status' = 'pending') then
    if req = 3 and tr >= 2 then
      raise exception 'trust3_needed' using errcode = 'P0001', detail = jsonb_build_object('required', req, 'trust', tr)::text;
    end if;
    raise exception 'verify_needed' using errcode = 'P0001', detail = jsonb_build_object('required', req, 'trust', tr)::text;
  end if;

  perform public.expire_holds();

  update public.bookings b set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Replaced by a new booking before paying'
   where b.renter_id = uid and private.own_droppable_hold(b);

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
    protection_rate, total_kobo, ref, not_included, required_trust)
  values (p_event, uid, vendor, 'hold', private.day_start(p_first), private.day_start(p_last + 1), expires, p_delivery,
    case when p_delivery = 'delivery' then p_zone end, trim(p_address), trim(p_phone), (q ->> 'days')::int,
    (q ->> 'rental_kobo')::bigint, (q ->> 'protection_kobo')::bigint, (q ->> 'delivery_kobo')::bigint, (q ->> 'deposit_kobo')::bigint,
    (q ->> 'protection_rate')::numeric, (q ->> 'total_kobo')::bigint, bref, coalesce(p_not_included, '[]'::jsonb), req)
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
-- 10. Dispatch gate
-- ---------------------------------------------------------------------------
/** Does this status change send the gear out of base? (Delivery trip, or a pickup handed over at base.) */
create or replace function private.leaves_base(p_from public.booking_status, p_to public.booking_status) returns boolean
language sql immutable set search_path = '' as $$
  select p_to in ('out_for_delivery', 'delivered', 'out') and p_from in ('hold', 'confirmed', 'preparing');
$$;
revoke all on function private.leaves_base(public.booking_status, public.booking_status) from public, anon;
grant execute on function private.leaves_base(public.booking_status, public.booking_status) to authenticated;

-- 0020's staff_set_booking_status, plus the 'not_verified' check.
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
  -- The renter's ID must be approved before the gear leaves (out for delivery, or a pickup handover).
  if private.leaves_base(b.status, p_status) and b.required_trust is not null
     and private.renter_trust(b.renter_id) < b.required_trust then
    raise exception 'not_verified' using errcode = 'P0001';
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

-- The same rule for any other path (staff can update bookings directly under RLS, 0011).
-- The service role / SQL editor (no auth.uid()) is not limited, so the founder can override by hand.
create or replace function private.bookings_kyc_dispatch_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if private.leaves_base(old.status, new.status) and new.required_trust is not null
     and private.renter_trust(new.renter_id) < new.required_trust then
    raise exception 'not_verified' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists bookings_kyc_dispatch_gate on public.bookings;
create trigger bookings_kyc_dispatch_gate before update of status on public.bookings
  for each row when (old.status is distinct from new.status) execute function private.bookings_kyc_dispatch_gate();

-- ---------------------------------------------------------------------------
-- 11. Automatic tier 3: two closed bookings with no claim, for a tier-2 renter
-- ---------------------------------------------------------------------------
-- "No claim": the booking was never disputed (audit_log keeps every status change, 0011) and has no
-- claim payment. There is no claims table yet; when one arrives, add it here.
create or replace function private.bookings_trust3() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  clean int;
begin
  if new.renter_id is null then return new; end if;
  if not exists (select 1 from public.profiles p where p.id = new.renter_id and p.trust_level = 2) then return new; end if;
  select count(*) into clean from public.bookings b
   where b.renter_id = new.renter_id and b.status = 'closed'
     and not exists (select 1 from public.payments p where p.booking_id = b.id and p.purpose = 'claim')
     and not exists (select 1 from public.audit_log a
                      where a.entity = 'bookings' and a.entity_id = b.id and a.after ->> 'status' = 'disputed');
  if clean >= 2 then
    update public.profiles set trust_level = 3 where id = new.renter_id and trust_level = 2;
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'trust_auto_3', 'profiles', new.renter_id,
            jsonb_build_object('trust_level', 2), jsonb_build_object('trust_level', 3, 'clean_rentals', clean, 'booking_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists bookings_trust3 on public.bookings;
create trigger bookings_trust3 after update of status on public.bookings
  for each row when (new.status = 'closed' and old.status is distinct from new.status)
  execute function private.bookings_trust3();

revoke all on function private.bookings_kyc_dispatch_gate(), private.bookings_trust3() from public, anon, authenticated;
