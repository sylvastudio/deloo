-- DEMO DATA: a fictional Lagos catalogue to build and demo with until real vendors list their gear.
-- Every vendor name ends in "(DEMO)". Prices are rough 2026 Lagos day rates, for demos only.
-- Run in the Supabase SQL Editor after 0007_rental_core.sql. Safe to re-run: it replaces the demo
-- vendors each time (and their items, units and blocks). Remove it all with demo_catalogue_remove.sql.
--
-- What it creates:
--   4 approved vendors (2 rental companies, a church media team, an individual videographer)
--   55 listings across sound, screens, cameras, lights and power, 264 units
--   Blocks on upcoming dates so the planner shows "limited" and "not available":
--     the church's gear is busy every Sunday morning for the next 8 weeks,
--     next Saturday both outdoor LED walls are taken and most Mainland speakers are out.
--
-- To manage a demo vendor's gear from your own account, uncomment and fill in the last statement.

delete from public.vendors where id in (
  'dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002',
  'dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000004');

insert into public.vendors (id, name, vendor_type, city, areas, phone, offers_delivery, offers_technician, approved_at) values
  ('dddddddd-0000-4000-8000-000000000001', 'Lekki Sound & Stage (DEMO)',         'company',    'Lagos', '{Lekki,Ajah,Victoria Island,Ikoyi}',          '08000000001', true,  true,  now()),
  ('dddddddd-0000-4000-8000-000000000002', 'Mainland AV Hire (DEMO)',            'company',    'Lagos', '{Ikeja,Maryland,Yaba,Surulere,Ogba,Gbagada}', '08000000002', true,  true,  now()),
  ('dddddddd-0000-4000-8000-000000000003', 'Living Waters Church Media (DEMO)', 'church',     'Lagos', '{Gbagada,Maryland,Magodo}',                   '08000000003', false, true,  now()),
  ('dddddddd-0000-4000-8000-000000000004', 'Kunle Visuals (DEMO)',               'individual', 'Lagos', '{Yaba,Surulere,Ikeja}',                       '08000000004', true,  true,  now());

-- v: 1 Lekki Sound & Stage, 2 Mainland AV Hire, 3 Living Waters Church Media, 4 Kunle Visuals.
-- Amounts in naira here; converted to kobo on insert.
drop table if exists demo_gear;
create temporary table demo_gear (
  v int, cat text, name text, brand text, model text, specs jsonb,
  rate int, deposit int, replacement int, tech boolean, qty int, note text
);

insert into demo_gear values
  -- Lekki Sound & Stage: big outdoor events, weddings on the Island
  (1, 'speaker',   '15" powered speaker',           'JBL',          'EON715',           '{"watts":1300,"size_in":15,"powered":true}',  25000,  50000,   950000,  false, 8, 'Comes with a stand and power cable.'),
  (1, 'speaker',   '12" powered speaker',           'JBL',          'EON712',           '{"watts":1300,"size_in":12,"powered":true}',  18000,  40000,   800000,  false, 6, 'Comes with a stand.'),
  (1, 'speaker',   'Line array box',                'RCF',          'HDL 30-A',         '{"watts":2200,"size_in":10,"powered":true}',  60000, 200000,  4500000,  true,  8, 'Flown or ground-stacked by our crew. Rented in pairs.'),
  (1, 'subwoofer', '18" powered subwoofer',         'RCF',          'SUB 8006-AS',      '{"watts":2500,"size_in":18}',                 35000,  80000,  1800000,  false, 6, ''),
  (1, 'monitor',   'Stage monitor',                 'Yamaha',       'DXR12',            '{"watts":1100}',                              15000,  30000,   700000,  false, 6, ''),
  (1, 'mic',       'Wireless handheld mic',         'Shure',        'SLXD24/SM58',      '{"kind":"handheld","wireless":true}',         10000,  25000,   450000,  false, 12, 'Batteries included.'),
  (1, 'mic',       'Wireless headset mic',          'Shure',        'SLXD14/SM35',      '{"kind":"headset","wireless":true}',          12000,  30000,   500000,  false, 4, ''),
  (1, 'mic',       'Wireless lapel mic',            'Sennheiser',   'EW 112P G4',       '{"kind":"lavalier","wireless":true}',         10000,  25000,   420000,  false, 4, ''),
  (1, 'mixer',     '32-channel digital mixer',      'Behringer',    'X32',              '{"channels":32,"digital":true}',              70000,      0,  4800000,  true,  2, 'Comes with our sound engineer.'),
  (1, 'mixer',     '16-channel mixer',              'Yamaha',       'MG16XU',           '{"channels":16,"digital":false}',             20000,  50000,   650000,  false, 3, ''),
  (1, 'led_wall',  'Outdoor LED wall 16×9 ft',      'Absen',        'P3.9 outdoor',     '{"width_ft":16,"height_ft":9,"pitch_mm":3.9,"outdoor":true}', 450000, 0, 22000000, true, 1, 'Daylight-bright. Includes rigging, processor and two technicians.'),
  (1, 'led_wall',  'Indoor LED wall 12×7 ft',       'Absen',        'P2.6 indoor',      '{"width_ft":12,"height_ft":7,"pitch_mm":2.6,"outdoor":false}', 280000, 0, 14000000, true, 1, 'Includes processor and technician.'),
  (1, 'light',     'Moving head light',             'Chauvet',      'Intimidator Spot 375', '{"kind":"moving_head","watts":150}',      15000,  40000,   750000,  false, 8, ''),
  (1, 'light',     'LED par light',                 'Chauvet',      'SlimPAR 64',       '{"kind":"par","watts":40}',                    3000,   5000,    90000,  false, 24, 'Uplighting for halls and receptions.'),
  (1, 'generator', '40 kVA soundproof generator',   'Perkins',      '40 kVA',           '{"kva":40,"silent":true}',                   150000,      0, 14000000,  true,  1, 'Diesel not included. Comes with an operator.'),
  (1, 'avr',       '20 kVA stabiliser',             'Sollatek',     '20 kVA',           '{"kva":20}',                                  15000,  30000,   450000,  false, 3, ''),

  -- Mainland AV Hire: conferences, churches and corporate events on the Mainland
  (2, 'speaker',   '15" powered speaker',           'Yamaha',       'DBR15',            '{"watts":1000,"size_in":15,"powered":true}',  20000,  40000,   750000,  false, 10, 'Comes with a stand.'),
  (2, 'speaker',   '10" powered speaker',           'Yamaha',       'DBR10',            '{"watts":700,"size_in":10,"powered":true}',   12000,  25000,   450000,  false, 6, 'Good for small halls and rooms.'),
  (2, 'subwoofer', '18" powered subwoofer',         'Yamaha',       'DXS18',            '{"watts":1020,"size_in":18}',                 28000,  60000,  1300000,  false, 4, ''),
  (2, 'monitor',   'Stage monitor',                 'Behringer',    'B212D',            '{"watts":550}',                               10000,  20000,   300000,  false, 4, ''),
  (2, 'mic',       'Wireless handheld mic',         'Sennheiser',   'EW 135 G4',        '{"kind":"handheld","wireless":true}',          9000,  20000,   400000,  false, 10, ''),
  (2, 'mic',       'Wired vocal mic',               'Shure',        'SM58',             '{"kind":"handheld","wireless":false}',         3000,   8000,   150000,  false, 10, 'With cable and stand.'),
  (2, 'mic',       'Conference gooseneck mic',      'Shure',        'MX418',            '{"kind":"handheld","wireless":false}',         5000,  10000,   250000,  false, 8, 'For panels and lecterns.'),
  (2, 'mixer',     '16-channel digital mixer',      'Behringer',    'X Air XR18',       '{"channels":16,"digital":true}',              35000,  80000,  1200000,  false, 2, 'Controlled from a tablet.'),
  (2, 'mixer',     '12-channel mixer',              'Yamaha',       'MG12XU',           '{"channels":12,"digital":false}',             15000,  30000,   450000,  false, 3, ''),
  (2, 'led_wall',  'Outdoor LED wall 12×8 ft',      'Unilumin',     'P4.8 outdoor',     '{"width_ft":12,"height_ft":8,"pitch_mm":4.8,"outdoor":true}', 350000, 0, 16000000, true, 1, 'Includes processor and technician.'),
  (2, 'projector', 'Projector 5,000 lumens',        'Epson',        'EB-L520U',         '{"lumens":5000}',                             35000,  80000,  2200000,  false, 4, 'For indoor halls. HDMI cable included.'),
  (2, 'projector', 'Projector 3,500 lumens',        'Epson',        'EB-X49',           '{"lumens":3500}',                             20000,  50000,   700000,  false, 4, 'For small rooms.'),
  (2, 'projector', 'Projector 10,000 lumens',       'Panasonic',    'PT-RZ120',         '{"lumens":10000}',                           90000,      0,  9000000,  true,  1, 'Large auditoriums. Comes with a technician.'),
  (2, 'projection_screen', 'Projection screen 10×7.5 ft', 'Da-Lite', 'Fast-Fold',       '{"width_ft":10,"height_ft":7.5}',             12000,  20000,   350000,  false, 4, ''),
  (2, 'projection_screen', 'Tripod screen 8×6 ft',  'Elite',        'Tripod 120"',      '{"width_ft":8,"height_ft":6}',                 6000,  10000,   120000,  false, 6, ''),
  (2, 'tv',        '75" TV on stand',               'Samsung',      'QE75Q60',          '{"size_in":75}',                              35000,  80000,  1600000,  false, 4, 'For stage confidence monitors and side screens.'),
  (2, 'tv',        '55" TV on stand',               'LG',           '55UR8050',         '{"size_in":55}',                              20000,  50000,   600000,  false, 6, ''),
  (2, 'light',     'LED wash light',                'ADJ',          'Mega Hex Par',     '{"kind":"wash","watts":90}',                   5000,  10000,   180000,  false, 16, ''),
  (2, 'light',     'Follow spot',                   'Chauvet',      'LED Followspot 120ST', '{"kind":"follow_spot","watts":120}',      20000,  50000,   900000,  false, 2, ''),
  (2, 'generator', '20 kVA soundproof generator',   'Mikano',       '20 kVA',           '{"kva":20,"silent":true}',                    80000,      0,  9500000,  true,  2, 'Diesel not included. Comes with an operator.'),
  (2, 'generator', '7.5 kVA generator',             'Firman',       'SPG9500E',         '{"kva":7.5,"silent":false}',                  30000,  60000,  1200000,  false, 3, 'Diesel not included.'),
  (2, 'avr',       '10 kVA stabiliser',             'Sollatek',     '10 kVA',           '{"kva":10}',                                  10000,  20000,   280000,  false, 6, ''),

  -- Living Waters Church Media: idle Monday to Saturday, busy on Sunday mornings
  (3, 'speaker',   '12" powered speaker',           'QSC',          'K12.2',            '{"watts":2000,"size_in":12,"powered":true}',  18000,  40000,  1100000,  false, 4, 'Church gear: not available Sunday mornings.'),
  (3, 'subwoofer', '18" powered subwoofer',         'QSC',          'KS118',            '{"watts":3600,"size_in":18}',                 25000,  60000,  1700000,  false, 2, ''),
  (3, 'mic',       'Wireless handheld mic',         'Shure',        'BLX24/PG58',       '{"kind":"handheld","wireless":true}',          7000,  15000,   300000,  false, 8, ''),
  (3, 'mixer',     '24-channel digital mixer',      'Allen & Heath','SQ-5',             '{"channels":24,"digital":true}',              50000,      0,  5500000,  true,  1, 'Comes with our media team volunteer-technician.'),
  (3, 'projector', 'Projector 6,000 lumens',        'Epson',        'EB-PU1006',        '{"lumens":6000}',                             40000,  90000,  2800000,  false, 2, ''),
  (3, 'projection_screen', 'Projection screen 12×9 ft', 'Da-Lite',  'Fast-Fold',        '{"width_ft":12,"height_ft":9}',               15000,  25000,   500000,  false, 2, ''),
  (3, 'camera',    'PTZ camera',                    'PTZOptics',    'Move 4K 20x',      '{"kind":"ptz","resolution":"4k"}',            30000,  80000,  2000000,  false, 3, ''),
  (3, 'switcher',  'Livestream switcher',           'Blackmagic',   'ATEM Mini Extreme ISO', '{"inputs":8,"streams":true}',            30000,  80000,  1500000,  false, 1, 'Streams straight to YouTube or Facebook.'),
  (3, 'light',     'LED par light',                 'Chauvet',      'SlimPAR Pro H',    '{"kind":"par","watts":60}',                    4000,   8000,   150000,  false, 12, ''),
  (3, 'avr',       '10 kVA stabiliser',             'Sollatek',     '10 kVA',           '{"kva":10}',                                   8000,  15000,   280000,  false, 2, ''),

  -- Kunle Visuals: cameras and livestreaming
  (4, 'camera',    'Pro camcorder 4K',              'Sony',         'PXW-Z190',         '{"kind":"camcorder","resolution":"4k"}',      60000,      0,  5500000,  true,  2, 'Comes with Kunle or one of his camera operators.'),
  (4, 'camera',    'Camcorder HD',                  'Sony',         'HXR-NX100',        '{"kind":"camcorder","resolution":"1080p"}',   30000,  70000,  1800000,  false, 2, ''),
  (4, 'camera',    'Mirrorless camera kit',         'Sony',         'A7 IV + 24-70mm',  '{"kind":"dslr","resolution":"4k"}',           35000, 100000,  2600000,  false, 2, 'Body, lens, two batteries, card.'),
  (4, 'switcher',  'Livestream switcher',           'Blackmagic',   'ATEM Mini Pro',    '{"inputs":4,"streams":true}',                 20000,  50000,   700000,  false, 2, ''),
  (4, 'streaming_kit', 'Bonded internet kit',       'LiveU',        'Solo Pro',         '{"bonded":true}',                             50000, 150000,  2400000,  false, 1, 'Combines 4 SIMs (MTN, Airtel, Glo, 9mobile) so the stream stays up.'),
  (4, 'streaming_kit', '4G router kit',             'Huawei',       'B535 + 2 SIMs',    '{"bonded":false}',                            10000,  20000,   120000,  false, 3, 'For small streams with good signal.'),
  (4, 'light',     'Interview light kit',           'Godox',        'SL60W ×2',         '{"kind":"flood","watts":120}',                12000,  30000,   300000,  false, 2, 'Two lights, stands and softboxes.');

insert into public.items (vendor_id, category_key, name, brand, model, specs, description,
                          day_rate_kobo, deposit_kobo, replacement_value_kobo, technician_required)
select ('dddddddd-0000-4000-8000-00000000000' || v)::uuid, cat, name || ' (DEMO)', brand, model, specs, note,
       rate::bigint * 100, deposit::bigint * 100, replacement::bigint * 100,
       tech or replacement >= 3000000   -- ₦3m and up is tier 3: technician required (0007 check)
from demo_gear;

insert into public.units (item_id, serial, condition)
select i.id, upper(left(regexp_replace(g.cat, '[^a-z]', '', 'g'), 3)) || '-' || g.v || '-' || lpad(n::text, 2, '0'), 'Good'
from demo_gear g
join public.items i on i.vendor_id = ('dddddddd-0000-4000-8000-00000000000' || g.v)::uuid and i.name = g.name || ' (DEMO)'
cross join lateral generate_series(1, g.qty) n;

-- Blocks (vendor's own use or bookings made elsewhere), all in Lagos time.
-- Church gear: every Sunday 6am–3pm for the next 8 weeks.
insert into public.reservations (unit_id, period, note)
select u.id,
       tstzrange(((d::date + time '06:00') at time zone 'Africa/Lagos'), ((d::date + time '15:00') at time zone 'Africa/Lagos')),
       'Sunday service (DEMO)'
from public.units u
join public.items i on i.id = u.item_id
cross join generate_series(date_trunc('week', now() at time zone 'Africa/Lagos') + interval '6 days',
                           date_trunc('week', now() at time zone 'Africa/Lagos') + interval '6 days' + interval '7 weeks',
                           interval '1 week') d
where i.vendor_id = 'dddddddd-0000-4000-8000-000000000003';

-- Next Saturday (or the one after, if today is Saturday or Sunday): both outdoor LED walls taken,
-- and 8 of Mainland's 10 15" speakers out.
with sat as (
  select (date_trunc('week', now() at time zone 'Africa/Lagos')
          + case when extract(isodow from now() at time zone 'Africa/Lagos') >= 6 then interval '12 days' else interval '5 days' end)::date as d
)
insert into public.reservations (unit_id, period, note)
select u.id, tstzrange(((sat.d + time '07:00') at time zone 'Africa/Lagos'), ((sat.d + 1 + time '02:00') at time zone 'Africa/Lagos')), 'Wedding (DEMO)'
from sat, public.units u
join public.items i on i.id = u.item_id
where i.category_key = 'led_wall' and (i.specs ->> 'outdoor')::boolean
  and i.vendor_id in ('dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002')
union all
select u.id, tstzrange(((sat.d + time '07:00') at time zone 'Africa/Lagos'), ((sat.d + 1 + time '02:00') at time zone 'Africa/Lagos')), 'Conference (DEMO)'
from sat, (
  select u.id from public.units u join public.items i on i.id = u.item_id
  where i.vendor_id = 'dddddddd-0000-4000-8000-000000000002' and i.name = '15" powered speaker (DEMO)'
  order by u.serial limit 8
) u;

drop table demo_gear;

-- Optional: make yourself a staff member of a demo vendor so you can see its Gear tab.
-- insert into public.vendor_members (vendor_id, user_id, role)
-- select 'dddddddd-0000-4000-8000-000000000002', id, 'staff' from auth.users where email = 'YOUR EMAIL'
-- on conflict do nothing;

select v.name, count(distinct i.id) as listings, count(u.id) as units
from public.vendors v join public.items i on i.vendor_id = v.id join public.units u on u.item_id = i.id
where v.id::text like 'dddddddd-%' group by v.name order by v.name;
