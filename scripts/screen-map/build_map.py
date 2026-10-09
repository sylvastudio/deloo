"""Builds the Deloo screen map page from docs/ux/*.md so the page and the docs can't drift."""
import html, json, re, pathlib

UX = pathlib.Path('/Users/chokomilo/Desktop/deloo/docs/ux')
flows_md = (UX / 'user-flows.md').read_text()
specs_md = (UX / 'screen-specs.md').read_text()
OUT = pathlib.Path(__file__).with_name('deloo-screen-map.html')  # published as the 'Deloo Screen Map' artifact

# ---- screens from the states table (user-flows §5) --------------------------------------------
sec5 = flows_md.split('## 5. Screen inventory with states', 1)[1].split('\n## 6.', 1)[0]
screens = {}
for line in sec5.splitlines():
    if not line.startswith('| ') or line.startswith('| ID') or line.startswith('|---'):
        continue
    cells = [c.strip() for c in line.strip('|').split('|')]
    if len(cells) < 7:
        continue
    sid, name, typ, frm, to, states, notes = cells[:7]
    if sid == 'R3a–R3i':
        sid = 'R3'
    screens[sid] = dict(id=sid, name=name, type=typ.split(' ')[0].replace('(', ''), typeFull=typ, frm=frm, to=to,
                        states=states, notes=notes, built='Built' in notes, new=False)

# ---- added screens (docs/ux/inventory.md) ------------------------------------------------------
added = [
    ('A7', 'Permission primer', 'sheet', 'Explains why we need the mic, camera, location or notifications just before the system asks.', 'pilot'),
    ('R30', 'Add to plan sheet', 'sheet', 'From an item: add it to an existing plan, start a quick plan, or book just this.', 'pilot'),
    ('R31', 'Cancel booking sheet', 'sheet', 'Shows exactly what is refunded under the policy before a slide to cancel.', 'pilot'),
    ('R32', 'Replacement offer', 'screen', 'Rescue guarantee: when a vendor declines or cancels, offer the replacement or a full refund plus credit.', 'pilot'),
    ('R33', 'Your plans', 'screen', 'Every saved plan, for when R1 shows only the latest three.', 'pilot'),
    ('R34', 'Something’s wrong sheet', 'sheet', 'Event-day problems (vendor late, gear failing, no-show) routed to priority WhatsApp support and rescue.', 'pilot'),
    ('R35', 'Activity inbox', 'screen', 'Recent updates for people who keep data off and miss notifications.', 'later'),
    ('R36', 'Hold expired', 'sheet', 'The 30-minute hold ran out mid-payment: check it is still free and hold again.', 'pilot'),
    ('V19', 'Rate renter', 'sheet', 'Two-way ratings: the vendor rates the renter after the return.', 'pilot'),
    ('V20', 'Decline reason sheet', 'sheet', 'Why a vendor declined a request, so the rescue can find a better match.', 'pilot'),
    ('S1', 'Mode switch transition', 'system', 'The short “Switching to your gear” moment, and vendor mode with no gear yet.', 'demo'),
    ('S2', 'Update required', 'system', 'Forced update or maintenance when rules change beyond an over-the-air fix.', 'pilot'),
    ('S3', 'Notification landing', 'system', 'Routing rules: every notification opens the exact screen and the right mode.', 'pilot'),
]
for sid, name, typ, purpose, phase in added:
    screens[sid] = dict(id=sid, name=name, type=typ, typeFull=typ, frm='', to='', states='', notes='', built=False,
                        new=True, purpose=purpose, phase=phase)

# ---- purposes from the UI specs ----------------------------------------------------------------
for m in re.finditer(r'^#### ([ARV]\d+) · (.+?)\n(.*?)(?=^#{3,4} |\Z)', specs_md, re.S | re.M):
    sid, body = m.group(1), m.group(3)
    if sid not in screens:
        continue
    pm = re.search(r'\*\*Purpose:\*\*\s*(.+)', body)
    if pm:
        screens[sid].setdefault('purpose', pm.group(1).strip())
    else:
        lm = re.search(r'\*\*Layout:\*\*\s*(.+)', body)
        if lm:
            screens[sid].setdefault('purpose', re.split(r'(?<=[.!?])\s', lm.group(1).strip())[0])
for s in screens.values():
    s.setdefault('purpose', s['notes'])

# ---- phases from prioritisation (user-flows §6) -----------------------------------------------
sec6 = flows_md.split('## 6. Prioritisation', 1)[1].split('\n## 7.', 1)[0]
ID_RE = re.compile(r'\b([ARVS])(\d{1,2})([a-z])?\b')
def norm(m):
    letter, num, sub = m.group(1), m.group(2), m.group(3)
    sid = f'{letter}{num}'
    if letter == 'R' and num == '3':
        return 'R3'
    return sid
order = [('Demo (must)', 'demo'), ('Demo (if time)', 'demo+'), ('Pilot launch', 'pilot'), ('Later', 'later')]
for line in sec6.splitlines():
    for label, phase in order:
        if line.startswith(f'| **{label}'):
            cell = line.split('|')[2]
            if 'A1–A6' in cell:
                for i in range(1, 7):
                    screens[f'A{i}'].setdefault('phase', phase)
            if 'R3a–R3i' in cell:
                screens['R3'].setdefault('phase', phase)
            for m in ID_RE.finditer(cell):
                sid = norm(m)
                if sid in screens:
                    screens[sid].setdefault('phase', phase)
for s in screens.values():
    s.setdefault('phase', 'pilot')

# ---- groups ------------------------------------------------------------------------------------
GROUPS = [
    ('first', 'First run', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'S1']),
    ('plan', 'Renter · Plan', ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R33']),
    ('explore', 'Renter · Explore', ['R11', 'R12', 'R13', 'R14', 'R30']),
    ('book', 'Renter · Book & pay', ['R15', 'R16', 'R17', 'R36', 'R18']),
    ('bookings', 'Renter · Bookings & handover', ['R19', 'R20', 'R21', 'R22', 'R23', 'R31', 'R32', 'R34']),
    ('me', 'Renter · Me', ['R24', 'R25', 'R26', 'R27', 'R28', 'R29', 'R35']),
    ('vtoday', 'Vendor · Today & requests', ['V1', 'V2', 'V20', 'V19']),
    ('vgear', 'Vendor · Gear & calendar', ['V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V3', 'V4']),
    ('vmoney', 'Vendor · Handover & money', ['V12', 'V13', 'V14', 'V15']),
    ('vaccount', 'Vendor · Account', ['V16', 'V17', 'V18', 'S2', 'S3']),
]
grouped = {i for _, _, ids in GROUPS for i in ids}
missing = set(screens) - grouped
assert not missing, missing
for key, _, ids in GROUPS:
    for i in ids:
        screens[i]['group'] = key
        screens[i]['mode'] = 'first' if key == 'first' else ('vendor' if key.startswith('v') else 'renter')
screens['S2']['mode'] = screens['S3']['mode'] = 'first'

# ---- flows -------------------------------------------------------------------------------------
sec3 = flows_md.split('## 3. Flows', 1)[1].split('\n## 4.', 1)[0]
flows = []
for m in re.finditer(r'^### (F\d+)\. (.+?)\n(.*?)(?=^### F\d+\.|\Z)', sec3, re.S | re.M):
    fid, title, body = m.group(1), m.group(2).strip(), m.group(3)
    goal = re.search(r'\*\*Goal:\*\*\s*(.+)', body)
    mer = re.search(r'```mermaid\n(.*?)```', body, re.S)
    prose = body.split('```mermaid')[0]
    ids = []
    for im in ID_RE.finditer(prose + (mer.group(1) if mer else '')):
        sid = norm(im)
        if sid in screens and sid not in ids:
            ids.append(sid)
    who = 'vendor' if int(fid[1:]) in (10, 11, 12, 13, 14) else 'both' if fid in ('F15', 'F17') else 'renter'
    if fid == 'F1':
        who = 'first'
    flows.append(dict(id=fid, title=title, goal=goal.group(1).strip() if goal else '', mermaid=mer.group(1).strip() if mer else '',
                      ids=ids, who=who))
for s in screens.values():
    s['flows'] = [f['id'] for f in flows if s['id'] in f['ids']]

# ---- page --------------------------------------------------------------------------------------
data = dict(groups=[dict(key=k, label=l, ids=ids) for k, l, ids in GROUPS], screens=screens,
            flows=[{k: v for k, v in f.items() if k != 'mermaid'} for f in flows])
counts = dict(screens=len(screens), flows=len(flows), demo=sum(1 for s in screens.values() if s['phase'] == 'demo'),
              new=sum(1 for s in screens.values() if s['new']), built=sum(1 for s in screens.values() if s['built']))

WHO = {'first': 'Everyone', 'renter': 'Renter', 'vendor': 'Vendor', 'both': 'Both modes'}
flow_blocks = []
for f in flows:
    chips = ''.join(f'<button type="button" class="chip-id" data-id="{i}">{i}</button>' for i in f['ids'])
    flow_blocks.append(f'''
<section class="flow" id="{f['id']}" data-flow="{f['id']}">
  <header class="flow-head">
    <span class="flow-id">{f['id']}</span>
    <div class="flow-titles">
      <h3>{html.escape(f['title'])}</h3>
      <p class="flow-goal">{html.escape(f['goal'])}</p>
    </div>
    <span class="who who-{f['who']}">{WHO[f['who']]}</span>
  </header>
  <div class="flow-uses" hidden></div>
  <div class="chain" aria-label="Screens in {f['id']}">{chips}</div>
  <div class="diagram"><pre class="mermaid">{html.escape(f['mermaid'], quote=False)}</pre></div>
</section>''')

tpl = (pathlib.Path(__file__).with_name('map_template.html')).read_text()
page = (tpl.replace('/*DATA*/', json.dumps(data, ensure_ascii=False))
           .replace('<!--FLOWS-->', '\n'.join(flow_blocks))
           .replace('<!--FLOWNAV-->', ''.join(f'<a href="#{f["id"]}" class="flow-link" data-flow-link="{f["id"]}"><span>{f["id"]}</span> {html.escape(f["title"])}</a>' for f in flows))
           .replace('{{SCREENS}}', str(counts['screens'])).replace('{{FLOWS}}', str(counts['flows']))
           .replace('{{DEMO}}', str(counts['demo'])).replace('{{NEW}}', str(counts['new'])).replace('{{BUILT}}', str(counts['built'])))
OUT.write_text(page)
print(counts, 'flows with ids:', [(f['id'], len(f['ids'])) for f in flows])
print('no purpose:', [s['id'] for s in screens.values() if not s['purpose']])
