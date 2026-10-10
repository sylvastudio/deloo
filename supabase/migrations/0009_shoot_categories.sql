-- Deloo rents its own production gear first (10 Oct 2026): cameras, lenses, gimbals, lights, audio and
-- grip for shoots, podcasts and content. Run after 0008_availability.sql.
--
-- 1. Category groups follow the shoot catalogue: camera, lens, light, audio, grip.
--    The event categories (speakers, LED walls, generators…) stay so old rows and unmet demand still
--    resolve, but nothing new is listed under them.
-- 2. New categories: lens, gimbal, headphones, grip (stands), backdrop.
-- 3. Cameras worth ₦3m+ go out without a technician: renters operate their own camera. The tier-3
--    "technician required" rule from 0007 was written for LED walls and generators, so it is dropped.

alter table public.categories drop constraint if exists categories_grp_check;
alter table public.categories add constraint categories_grp_check
  check (grp in ('sound', 'screen', 'camera', 'light', 'power', 'lens', 'audio', 'grip'));

update public.categories set grp = 'audio' where key in ('mic', 'mixer');

-- Spec keys are read by mobile/src/planner (meetsSpec); changing one is a code change there too.
update public.categories set spec_schema =
  '{"fields":[{"key":"kind","label":"Type","type":"text","options":["cinema","mirrorless"]},{"key":"grade","label":"Grade (1 entry – 4 cinema)","type":"number"},{"key":"full_frame","label":"Full frame","type":"boolean"},{"key":"resolution","label":"Resolution","type":"text","options":["1080p","4k"]}]}'
  where key = 'camera';
update public.categories set spec_schema =
  '{"fields":[{"key":"kind","label":"Type","type":"text","options":["cob","mat","panel","tube"]},{"key":"watts","label":"Power","type":"number","unit":"W"},{"key":"rgb","label":"Colour (RGB)","type":"boolean"},{"key":"battery","label":"Runs on battery","type":"boolean"}]}'
  where key = 'light';
update public.categories set spec_schema =
  '{"fields":[{"key":"kind","label":"Type","type":"text","options":["podcast","lavalier","handheld","shotgun"]},{"key":"wireless","label":"Wireless","type":"boolean"},{"key":"persons","label":"People covered","type":"number"},{"key":"usb","label":"USB","type":"boolean"}]}'
  where key = 'mic';
update public.categories set spec_schema =
  '{"fields":[{"key":"channels","label":"Mic inputs","type":"number"},{"key":"digital","label":"Digital","type":"boolean"},{"key":"records","label":"Records on its own","type":"boolean"}]}'
  where key = 'mixer';

insert into public.categories (key, label, grp, sort, spec_schema) values
  ('lens',       'Lens',       'lens',  105, '{"fields":[{"key":"kind","label":"Type","type":"text","options":["prime","zoom"]},{"key":"focal_mm","label":"Focal length","type":"text"},{"key":"aperture","label":"Widest aperture","type":"number"},{"key":"full_frame","label":"Full frame","type":"boolean"},{"key":"grade","label":"Grade (1–3)","type":"number"}]}'),
  ('gimbal',     'Gimbal',     'grip',  160, '{"fields":[{"key":"payload_kg","label":"Max payload","type":"number","unit":"kg"}]}'),
  ('headphones', 'Headphones', 'audio', 45,  '{"fields":[]}'),
  ('grip',       'Stand',      'grip',  170, '{"fields":[{"key":"kind","label":"Type","type":"text","options":["c_stand","light_stand","mic_stand","backdrop_stand"]}]}'),
  ('backdrop',   'Backdrop',   'grip',  180, '{"fields":[{"key":"kind","label":"Type","type":"text","options":["paper","cloth"]}]}')
on conflict (key) do update set label = excluded.label, grp = excluded.grp, sort = excluded.sort, spec_schema = excluded.spec_schema;

update public.categories set sort = 100 where key = 'camera';
update public.categories set sort = 130 where key = 'light';
update public.categories set sort = 40  where key = 'mic';
update public.categories set sort = 50  where key = 'mixer';

-- Drop 0007's table check "replacement_value_kobo < 300000000 or technician_required".
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.items'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%technician_required%'
  loop
    execute format('alter table public.items drop constraint %I', c);
  end loop;
end $$;

-- People who want to rent out their own gear join a waitlist while Deloo rents only its own stock.
alter type public.waitlist_vertical add value if not exists 'gear';
