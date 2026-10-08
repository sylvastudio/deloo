-- Removes everything demo_catalogue.sql created. Vendors cascade to members, items, units and blocks.
-- Run once real vendors have listed enough gear.
delete from public.vendors where id in (
  'dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002',
  'dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000004');
