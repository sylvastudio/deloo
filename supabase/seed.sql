-- TEST DATA. Fictional organisations and people only (IMPLEMENTATION_PLAN rules).
-- Runs after migrations on `supabase db reset`, or paste into the hosted SQL Editor.
-- Safe to run more than once: existing rows are left alone.
--
-- Sign in locally with any of these (password: deloo-test-123):
--   admin@grace.test       Grace Harbour Chapel, Org Admin (HQ)
--   volunteer@grace.test   Grace Harbour Chapel, Volunteer in "Youth Department"
--   admin@northgate.test   Northgate Alumni Association, Org Admin (second org, for isolation checks)

-- Catalogue: generated from prototype/index.html TYPES / STYLES (Phase 1 scope: 7 types, 9 styles).
insert into public.categories (key, label, description, slot_schema, sort) values
  ($j$event$j$, $j$Event flyer$j$, $j$Services, conferences, programmes.$j$, $j${"fields":[{"key":"title","label":"Event name","required":true,"placeholder":"Youth Conference"},{"key":"date","label":"Date","required":true,"placeholder":"3 October"},{"key":"time","label":"Time","required":false,"placeholder":"4pm"},{"key":"venue","label":"Venue","required":false,"placeholder":"Main Auditorium"},{"key":"theme","label":"Theme","required":false,"placeholder":"Rise and Shine"},{"key":"speaker","label":"Ministering","required":false,"placeholder":"Pastor Tolu Adeyemi","hint":"Keep honorifics as written: Pastor, Evang., Chief, Alhaji, HRM."},{"key":"host","label":"Host","required":false},{"key":"cta","label":"Closing line","required":false,"placeholder":"Invite a friend"}],"example":"Youth conference, 3 Oct, guest speaker Pastor Tolu Adeyemi, theme Rise and Shine, 4pm at the Main Auditorium"}$j$::jsonb, 0),
  ($j$invite$j$, $j$Invitation$j$, $j$“You're invited” for dinners, launches, special days.$j$, $j${"fields":[{"key":"occasion","label":"What's the occasion?","required":true,"placeholder":"Choir Anniversary Dinner"},{"key":"date","label":"Date","required":true,"placeholder":"14 November"},{"key":"time","label":"Time","required":false,"placeholder":"6pm"},{"key":"venue","label":"Venue","required":false,"placeholder":"Fellowship Hall"},{"key":"host","label":"Hosted by","required":false,"placeholder":"The Choir"},{"key":"dress","label":"Dress code","required":false,"placeholder":"All white"},{"key":"rsvp","label":"RSVP to","required":false,"placeholder":"Sister Bola"}],"example":"Choir anniversary dinner, 14 Nov, 6pm at the Fellowship Hall, dress code all white, RSVP Sister Bola"}$j$::jsonb, 1),
  ($j$announce$j$, $j$Announcement$j$, $j$Notices, “we've moved”, updates.$j$, $j${"fields":[{"key":"headline","label":"Headline","required":true,"placeholder":"We've moved"},{"key":"message","label":"Message","required":true,"long":true,"placeholder":"From Sunday 5 October, all services hold at our new hall."},{"key":"date","label":"Date","required":false,"placeholder":"5 October"},{"key":"contact","label":"Contact","required":false,"placeholder":"Church office"}],"example":"We've moved, from Sunday 5 Oct all services hold at our new hall on Unity Road, contact the church office"}$j$::jsonb, 2),
  ($j$quote$j$, $j$Quote or scripture card$j$, $j$Verses, sermon quotes, thoughts.$j$, $j${"fields":[{"key":"quote","label":"Quote or verse","required":true,"long":true,"placeholder":"Let your light so shine before men."},{"key":"reference","label":"Reference or speaker","required":false,"placeholder":"Matthew 5:16"},{"key":"occasion","label":"Small heading","required":false,"placeholder":"Sunday thought"}],"example":"\"Let your light so shine before men\" Matthew 5:16, Sunday thought"}$j$::jsonb, 3),
  ($j$birthday$j$, $j$Birthday or celebration$j$, $j$Birthdays, anniversaries, milestones.$j$, $j${"fields":[{"key":"name","label":"Who's celebrating?","required":true,"placeholder":"Mama Grace"},{"key":"milestone","label":"Milestone","required":false,"placeholder":"turns 70"},{"key":"date","label":"Date","required":false,"placeholder":"12 December"},{"key":"message","label":"Message","required":false,"long":true,"placeholder":"Join us to celebrate seventy years of grace."},{"key":"from","label":"From","required":false,"placeholder":"The family"}],"example":"Mama Grace turns 70, 12 Dec, join us to celebrate seventy years of grace, from the family"}$j$::jsonb, 4),
  ($j$service$j$, $j$Service times$j$, $j$“See you Sunday”, weekly services.$j$, $j${"fields":[{"key":"day","label":"Day","required":true,"placeholder":"Sunday"},{"key":"time","label":"Time","required":true,"placeholder":"10:30am"},{"key":"headline","label":"Headline","required":false,"placeholder":"Empty = “See you Sunday at 10:30am”"},{"key":"venue","label":"Venue","required":false,"placeholder":"Main Auditorium"},{"key":"tagline","label":"Tagline","required":false,"placeholder":"Come as you are"}],"example":"See you Sunday, 10:30am at the Main Auditorium, tagline come as you are"}$j$::jsonb, 5),
  ($j$thanks$j$, $j$Thank-you$j$, $j$Appreciation after events and giving.$j$, $j${"fields":[{"key":"for_what","label":"Thank you for…","required":true,"placeholder":"Harvest Thanksgiving 2026"},{"key":"headline","label":"Headline","required":false,"placeholder":"Empty = “Thank you”"},{"key":"items","label":"Who or what to thank (one per line)","required":false,"long":true,"placeholder":"Ushers\nChoir\nMedia team"},{"key":"from","label":"From","required":false,"placeholder":"The Pastorate"}],"example":"Thank you for Harvest Thanksgiving 2026, ushers, choir, media team, from the Pastorate"}$j$::jsonb, 6)
on conflict (key) do update set label = excluded.label, description = excluded.description, slot_schema = excluded.slot_schema, sort = excluded.sort;

insert into public.templates (key, name, description, component_key, sort) values
  ($j$badge$j$, $j$Badge$j$, $j$Title in a bold oval, date up top.$j$, $j$BadgeStyle$j$, 0),
  ($j$receipt$j$, $j$Receipt$j$, $j$Till receipt, dotted lines, script sign-off.$j$, $j$ReceiptStyle$j$, 1),
  ($j$ticket$j$, $j$Ticket roll$j$, $j$A ticket printing out of a slot.$j$, $j$TicketStyle$j$, 2),
  ($j$form$j$, $j$Form card$j$, $j$Tilted card with labelled tabs over giant type.$j$, $j$FormStyle$j$, 3),
  ($j$editorial$j$, $j$Editorial serif$j$, $j$Elegant serif on a colour panel.$j$, $j$EditorialStyle$j$, 4),
  ($j$note$j$, $j$Pinned note$j$, $j$Pinned note, bold caps with script.$j$, $j$NoteStyle$j$, 5),
  ($j$sticker$j$, $j$Sticker title$j$, $j$Cut-out sticker title, script details.$j$, $j$StickerStyle$j$, 6),
  ($j$billboard$j$, $j$Billboard$j$, $j$A short friendly line on a billboard.$j$, $j$BillboardStyle$j$, 7),
  ($j$block$j$, $j$Poster block$j$, $j$Huge headline, framed card, mono details.$j$, $j$BlockStyle$j$, 8)
on conflict (key) do update set name = excluded.name, description = excluded.description, component_key = excluded.component_key, sort = excluded.sort;

-- Users -----------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in select * from (values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'admin@grace.test',     'Ada Okafor (TEST)'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'volunteer@grace.test', 'Tobi Bello (TEST)'),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'admin@northgate.test', 'Chidi Eze (TEST)')
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

-- Organisations ------------------------------------------------------------------
insert into public.organisations (id, name, org_type, structure, plan) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Grace Harbour Chapel',         'church',      'units',    'free'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Northgate Alumni Association', 'association', 'branches', 'free')
on conflict do nothing;

insert into public.units (id, org_id, name, type) values
  ('aaaaaaaa-1000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Youth Department', 'department'),
  ('aaaaaaaa-1000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'Choir',            'department'),
  ('bbbbbbbb-1000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'Lagos Chapter',    'branch')
on conflict do nothing;

insert into public.memberships (user_id, org_id, unit_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', null,                                   'admin'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1000-4000-8000-000000000001', 'volunteer'),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-0000-4000-8000-000000000002', null,                                   'admin')
on conflict do nothing;

-- Master brand kits (same palettes as the prototype's demo + a contrasting one).
insert into public.brand_kits (org_id, colours, colour_source, tone) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '{"primary":"#1B2A4A","accent":"#E8B84A","paper":"#E3E7EF","ink":"#0E141F"}', 'custom',
   'Warm, hopeful and plain-spoken. We say "family" not "members". TEST DATA.'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '{"primary":"#7A1F2B","accent":"#E9D2A8","paper":"#F0E3E4","ink":"#1A0A0C"}', 'custom',
   'Proud, nostalgic, a little formal. TEST DATA.')
on conflict do nothing;

insert into public.org_categories (org_id, category_key) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'event'), ('aaaaaaaa-0000-4000-8000-000000000001', 'invite'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'quote'), ('aaaaaaaa-0000-4000-8000-000000000001', 'service'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'thanks'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'event'), ('bbbbbbbb-0000-4000-8000-000000000002', 'announce'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'birthday')
on conflict do nothing;

insert into public.org_templates (org_id, template_key, position) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'block', 1), ('aaaaaaaa-0000-4000-8000-000000000001', 'badge', 2),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'ticket', 3),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'editorial', 1), ('bbbbbbbb-0000-4000-8000-000000000002', 'form', 2)
on conflict do nothing;

-- One brief per org so isolation checks have rows to (not) see.
insert into public.briefs (id, org_id, unit_id, author_id, category_key, raw_text, fields, status) values
  ('aaaaaaaa-2000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'event',
   'Youth conference, 3 Oct, guest speaker Pastor Tolu Adeyemi, theme Rise and Shine, 4pm at the Main Auditorium',
   '{"title":"Youth Conference","date":"3 October","time":"4pm","venue":"Main Auditorium","theme":"Rise and Shine","speaker":"Pastor Tolu Adeyemi"}', 'draft'),
  ('bbbbbbbb-2000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-1000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'announce',
   'Homecoming moved to 9 Nov, contact the secretariat',
   '{"headline":"Homecoming has moved","message":"Homecoming now holds on 9 November.","date":"9 November","contact":"The secretariat"}', 'draft')
on conflict do nothing;
