-- TEST DATA. Fictional vendors and people only (IMPLEMENTATION_PLAN rules).
-- For a TEST Supabase project, never the live one: paste into its SQL Editor after migrations 0006–0007.
-- Safe to run more than once: existing rows are left alone.
--
-- Sign in with any of these (password: deloo-test-123):
--   renter@deloo.test      Renter only
--   owner@soundcity.test   Owner of Sound City Rentals (TEST), an approved rental company
--   media@grace.test       Owner of Grace Harbour Chapel Media (TEST), a church vendor NOT yet approved
--   ops@deloo.test         Deloo Ops

-- Users -----------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in select * from (values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'renter@deloo.test',    'Ada Okafor (TEST)'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'owner@soundcity.test', 'Tobi Bello (TEST)'),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'media@grace.test',     'Chidi Eze (TEST)'),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'ops@deloo.test',       'Ngozi Ade (TEST)')
  ) as t(id, email, full_name) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            extensions.crypt('deloo-test-123', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name), now(), now(),
            '', '', '', '')
    on conflict (id) do nothing;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now())
    on conflict do nothing;
  end loop;
end $$;

insert into public.profiles (id, full_name, phone, wants_to_rent, has_gear, is_ops) values
  ('11111111-1111-4111-8111-111111111111', 'Ada Okafor (TEST)', '08030000001', true,  false, false),
  ('22222222-2222-4222-8222-222222222222', 'Tobi Bello (TEST)', '08030000002', false, true,  false),
  ('33333333-3333-4333-8333-333333333333', 'Chidi Eze (TEST)',  '08030000003', true,  true,  false),
  ('44444444-4444-4444-8444-444444444444', 'Ngozi Ade (TEST)',  '08030000004', true,  false, true)
on conflict do nothing;

-- Vendors ---------------------------------------------------------------------
insert into public.vendors (id, name, vendor_type, areas, phone, offers_delivery, offers_technician, approved_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Sound City Rentals (TEST)',        'company', '{Ikeja,Maryland,Yaba}', '08030000002', true, true, now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Grace Harbour Chapel Media (TEST)', 'church',  '{Lekki,Ajah}',          '08030000003', false, true, null)
on conflict do nothing;

insert into public.vendor_members (vendor_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'owner')
on conflict do nothing;

-- A little gear (Phase 1's seed script adds the full demo catalogue) ----------------
-- Prices in kobo: ₦25,000 = 2500000.
insert into public.items (id, vendor_id, category_key, name, brand, model, specs, day_rate_kobo, deposit_kobo, replacement_value_kobo, technician_required) values
  ('aaaaaaaa-2000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'speaker', '15" powered speaker (TEST)', 'JBL', 'EON715',
   '{"watts":1300,"size_in":15,"powered":true}', 2500000, 5000000, 90000000, false),
  ('aaaaaaaa-2000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'led_wall', 'Outdoor LED wall 12×8 ft (TEST)', 'Absen', 'P3.9',
   '{"width_ft":12,"height_ft":8,"pitch_mm":3.9,"outdoor":true}', 35000000, 0, 1500000000, true),
  ('bbbbbbbb-2000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'mic', 'Wireless handheld mic (TEST)', 'Shure', 'BLX24',
   '{"kind":"handheld","wireless":true}', 800000, 2000000, 35000000, false)
on conflict do nothing;

insert into public.units (id, item_id, serial) values
  ('aaaaaaaa-3000-4000-8000-000000000001', 'aaaaaaaa-2000-4000-8000-000000000001', 'SC-SPK-01'),
  ('aaaaaaaa-3000-4000-8000-000000000002', 'aaaaaaaa-2000-4000-8000-000000000001', 'SC-SPK-02'),
  ('aaaaaaaa-3000-4000-8000-000000000003', 'aaaaaaaa-2000-4000-8000-000000000002', 'SC-LED-01'),
  ('bbbbbbbb-3000-4000-8000-000000000001', 'bbbbbbbb-2000-4000-8000-000000000001', 'GH-MIC-01')
on conflict do nothing;
