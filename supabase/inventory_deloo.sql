-- Deloo's own rental stock (formerly listed at themastermind.cc/rent-gear, 10 Oct 2026).
-- Run in the Supabase SQL Editor after 0009_shoot_categories.sql. Safe to re-run: it replaces the
-- in-house vendor's items and units each time (reservations on those units go with them).
--
-- Day rates: as on the Mastermind site. Units: 1 each, except ZV-E1 and Amaran COB 200x S (2 each).
-- Replacement value: new in Lagos, researched 10 Oct 2026 (Nigerian dealers; else B&H USD × ₦1,585,
-- i.e. ₦1,378/$ plus 15% import). Deposit: one day's rate, at least ₦10,000 and at most ₦50,000
-- (founder decision 10 Oct 2026; theft risk is covered by verifying renters, not by the deposit).
-- Decommissioned: DJI FPV Drone Combo (not listed).
-- Photos: supabase/inventory-photos, uploaded to the `items` bucket as <vendor id>/<site id>-<n>.jpg
-- by scripts/upload-inventory-photos.ts.

insert into public.vendors (id, name, vendor_type, city, areas, phone, offers_delivery, offers_technician, approved_at)
values ('de100000-0000-4000-8000-000000000001', 'Deloo', 'company', 'Lagos',
        '{Ikeja,Lekki,Ajah,Victoria Island,Ikoyi,Yaba,Surulere,Gbagada,Maryland,Ogba,Magodo,Ikorodu,Festac,Apapa,Oshodi,Agege,Isolo,Epe,Badagry}',
        '', true, false, now())
on conflict (id) do update set name = excluded.name, areas = excluded.areas, offers_delivery = excluded.offers_delivery,
  approved_at = coalesce(public.vendors.approved_at, excluded.approved_at);

delete from public.items where vendor_id = 'de100000-0000-4000-8000-000000000001';

-- One statement (no temp table): the Supabase SQL Editor may run each statement on a new connection.
with stock (site_id, cat, name, brand, model, specs, rate, replacement, qty, photos, note) as (values
  -- Cameras (bodies only: add a lens)
  (1630, 'camera', 'Sony FX3 cinema camera', 'Sony', 'FX3', '{"kind":"cinema","grade":4,"full_frame":true,"resolution":"4k"}', 50000, 4900000, 1, 1, 'Full-frame cinema camera, body only. Add a lens.'),
  (438,  'camera', 'Sony ZV-E1', 'Sony', 'ZV-E1', '{"kind":"mirrorless","grade":3,"full_frame":true,"resolution":"4k"}', 40000, 3600000, 2, 1, 'Full-frame vlogging and content camera, body only. Add a lens.'),
  (449,  'camera', 'Sony FX30 cinema camera', 'Sony', 'FX30', '{"kind":"cinema","grade":2,"full_frame":false,"resolution":"4k"}', 35000, 2700000, 1, 3, 'Super 35 cinema camera, body only. Add a lens.'),
  (1194, 'camera', 'Sony ZV-E10', 'Sony', 'ZV-E10', '{"kind":"mirrorless","grade":1,"full_frame":false,"resolution":"4k"}', 20000, 1000000, 1, 1, 'Light APS-C content camera, body only. Add a lens.'),

  -- Lenses (Sony E mount)
  (1633, 'lens', 'Sony FE 24-70mm f/2.8 GM', 'Sony', 'FE 24-70mm F2.8 GM', '{"kind":"zoom","focal_mm":"24-70","aperture":2.8,"full_frame":true,"grade":3}', 30000, 2850000, 1, 1, 'The do-everything zoom for events and run-and-gun.'),
  (1202, 'lens', 'Sony FE 85mm f/1.8', 'Sony', 'FE 85mm F1.8', '{"kind":"prime","focal_mm":"85","aperture":1.8,"full_frame":true,"grade":2}', 17000, 1000000, 1, 1, 'Portrait and interview close-ups with soft backgrounds.'),
  (1196, 'lens', 'Sony FE 35mm f/1.8', 'Sony', 'FE 35mm F1.8', '{"kind":"prime","focal_mm":"35","aperture":1.8,"full_frame":true,"grade":2}', 17000, 900000, 1, 1, 'Natural wide-ish view for talking heads and B-roll.'),
  (1200, 'lens', 'Sony FE 50mm f/1.8', 'Sony', 'FE 50mm F1.8', '{"kind":"prime","focal_mm":"50","aperture":1.8,"full_frame":true,"grade":1}', 10000, 400000, 1, 1, 'Light, affordable standard prime.'),
  (1198, 'lens', 'Sigma 16mm f/1.4 DC DN', 'Sigma', '16mm F1.4 DC DN Contemporary', '{"kind":"prime","focal_mm":"16","aperture":1.4,"full_frame":false,"grade":2}', 15000, 800000, 1, 1, 'Wide, bright prime for APS-C bodies (ZV-E10, FX30).'),

  -- Gimbals
  (1862, 'gimbal', 'DJI RS 5 gimbal', 'DJI', 'RS 5', '{"payload_kg":3}', 45000, 950000, 1, 1, 'Carries cinema bodies like the FX3 with a zoom.'),
  (1253, 'gimbal', 'DJI RS 3 Mini gimbal', 'DJI', 'RS 3 Mini', '{"payload_kg":2}', 25000, 600000, 1, 1, 'Light gimbal for mirrorless bodies and primes.'),

  -- Lighting
  (1236, 'light', 'Amaran F22c 2×2 ft LED mat', 'Amaran', 'F22c (V-Mount)', '{"kind":"mat","watts":200,"rgb":true,"battery":true}', 25000, 1425000, 1, 1, 'Big soft colour light; runs on V-mount batteries.'),
  (1232, 'light', 'Amaran COB 200x S', 'Amaran', 'COB 200x S', '{"kind":"cob","watts":200,"rgb":false,"battery":false}', 25000, 635000, 2, 1, 'Bi-colour key light. Use with a softbox.'),
  (1238, 'light', 'Godox SL100W LED light', 'Godox', 'SL100W', '{"kind":"cob","watts":100,"rgb":false,"battery":false}', 15000, 440000, 1, 1, 'Daylight key or fill light.'),
  (1243, 'light', 'Aputure MC Pro RGB panel', 'Aputure', 'MC Pro', '{"kind":"panel","watts":8,"rgb":true,"battery":true}', 10000, 315000, 1, 1, 'Pocket colour light for accents and backgrounds.'),
  (1234, 'light', 'Nanlite PavoTube 6C', 'Nanlite', 'PavoTube II 6C', '{"kind":"tube","watts":7,"rgb":true,"battery":true}', 8000, 140000, 1, 1, 'Small RGB tube for background colour.'),

  -- Audio
  (1230, 'mixer', 'RODECaster Pro II', 'RODE', 'RODECaster Pro II', '{"channels":4,"digital":true,"records":true}', 45000, 1200000, 1, 1, 'Podcast studio: 4 mic inputs, records to SD card.'),
  (1222, 'mic', 'RODE PodMic USB', 'RODE', 'PodMic USB', '{"kind":"podcast","wireless":false,"persons":1,"usb":true}', 25000, 350000, 1, 1, 'Broadcast mic that plugs straight into a laptop (USB) or a mixer (XLR).'),
  (1224, 'mic', 'RODE PodMic with stand and cable', 'RODE', 'PodMic', '{"kind":"podcast","wireless":false,"persons":1,"usb":false}', 20000, 400000, 1, 1, 'Broadcast mic with desk stand and XLR cable.'),
  (1218, 'mic', 'RODE Wireless PRO', 'RODE', 'Wireless PRO', '{"kind":"lavalier","wireless":true,"persons":2}', 15000, 690000, 1, 1, 'Two clip-on wireless mics with backup recording.'),
  (1220, 'mic', 'RODE Wireless GO II', 'RODE', 'Wireless GO II', '{"kind":"lavalier","wireless":true,"persons":2}', 10000, 350000, 1, 1, 'Two clip-on wireless mics for interviews and vlogs.'),
  (1226, 'headphones', 'Audio-Technica studio headphones', 'Audio-Technica', 'ATH-M50x', '{}', 5000, 185000, 1, 1, 'Closed-back headphones to check sound while recording.'),
  (1228, 'grip', 'Adjustable mic stand', '', '', '{"kind":"mic_stand"}', 2000, 35000, 1, 1, ''),

  -- Grip and backdrops
  (1251, 'grip', 'C-stand kit (10.75 ft)', 'Impact', 'Turtle Base C-Stand Kit', '{"kind":"c_stand"}', 5000, 270000, 1, 1, 'Stand with arm and grip head, for lights and flags.'),
  (1247, 'grip', 'Backdrop support kit (12.9 ft wide)', 'Impact', 'Pro Backdrop Support Kit', '{"kind":"backdrop_stand"}', 5000, 315000, 1, 1, 'Holds a paper or cloth backdrop.'),
  (1249, 'backdrop', 'Paper backdrop', '', '', '{"kind":"paper"}', 10000, 25000, 1, 1, 'Seamless paper roll. Pair with the backdrop support kit.')
),
ins as (
  insert into public.items (vendor_id, category_key, name, brand, model, description, specs, day_rate_kobo, deposit_kobo,
                            replacement_value_kobo, technician_required, photos, active)
  select 'de100000-0000-4000-8000-000000000001', s.cat, s.name, s.brand, s.model, s.note, s.specs::jsonb,
         s.rate::bigint * 100,
         least(5000000, greatest(1000000, s.rate::bigint * 100)),
         s.replacement::bigint * 100, false,
         array(select 'de100000-0000-4000-8000-000000000001/' || s.site_id || '-' || n || '.jpg' from generate_series(0, s.photos - 1) n),
         true
  from stock s
  returning id, name
)
insert into public.units (item_id, serial, condition)
select ins.id, '', 'Good'
from ins join stock s on s.name = ins.name
cross join generate_series(1, s.qty);

-- Optional: give your staff account the inventory screens (vendor mode) in the app.
-- insert into public.vendor_members (vendor_id, user_id, role)
-- select 'de100000-0000-4000-8000-000000000001', id, 'owner' from auth.users where email = 'YOUR EMAIL'
-- on conflict do nothing;

select i.category_key, i.name, i.day_rate_kobo / 100 as day_rate, i.deposit_kobo / 100 as deposit,
       i.replacement_value_kobo / 100 as replacement, i.risk_tier, count(u.id) as units
from public.items i join public.units u on u.item_id = i.id
where i.vendor_id = 'de100000-0000-4000-8000-000000000001'
group by i.id order by i.category_key, i.day_rate_kobo desc;
