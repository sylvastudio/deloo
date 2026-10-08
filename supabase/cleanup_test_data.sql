-- Removes the seeded TEST data (supabase/seed.sql). Only needed if the seed was ever run on a project
-- real people use. Touches only the fixed seed IDs below.

-- Vendors cascade to members, items, units and reservations.
delete from public.vendors
 where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002');

-- The four test accounts (password deloo-test-123, published in the repo). Profiles cascade.
delete from auth.users
 where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
              '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444');
