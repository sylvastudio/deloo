-- Removes the seeded TEST data (supabase/seed.sql) from a project real people will use.
-- Run in the Supabase SQL Editor before sharing the app. Touches only the fixed seed IDs below.
-- After this, `npm run check:rls` can't run against this project (it signs in as these users):
-- run it against a separate test project instead.

-- Files aren't removed here (Supabase blocks deleting storage rows with SQL). In Storage, open the brand,
-- exports and print buckets and delete the folders named aaaaaaaa-0000-4000-8000-000000000001 and
-- bbbbbbbb-0000-4000-8000-000000000002. They're private, so leaving them is harmless, just untidy.

-- Orgs cascade to units, memberships, brand kits, briefs, assets and print specs.
delete from public.organisations
 where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002');

-- The three test accounts (password deloo-test-123, published in the repo).
delete from auth.users
 where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
