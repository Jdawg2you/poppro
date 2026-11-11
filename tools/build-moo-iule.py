#!/usr/bin/env python3
"""Mutual of Omaha Indexed Universal Life Express (Easy Solve), monthly bank draft (BSP): rebuild LB_RATES.iule in
tool/index.html.

Input: data/lb/moo-iule.json - rows [state, age, "MALE"|"FEMALE", "NO"|"YES" (tobacco), face, "monthly"], pulled
from Mutual of Omaha's public sales-professional quoter (www3.mutualofomaha.com/mobile-quotes/#/iule, Jesse 10 Nov
2026). Checked 10 Nov at age 46 male non-tobacco $50K in all 50 states + DC: every state is $53.55 except Montana
($52.09, unisex - Montana's own pricing) and New York (not sold, the quoter errors). So two tables: TX for every
state, and MT (unisex). Ages 18-65 (Jesse's range; the quoter goes to 75), the same five faces as the term.
Slots per row: [nonTob25, nonTob50, nonTob75, nonTob100, nonTob250, tob25, tob50, tob75, tob100, tob250].

    python3 tools/build-moo-iule.py
"""
import json, os, sys
ROOT = os.path.join(os.path.dirname(__file__), '..')
rows = json.load(open(os.path.join(ROOT, 'data/lb/moo-iule.json')))['rows']
FACES = [25000, 50000, 75000, 100000, 250000]
AGES = range(18, 66)
gen, mt, missing = {}, {}, []
for st, a, g, t, f, m in rows:
    v = round(float(m), 2) if m not in (None, '') and not str(m).startswith('ERR') else None
    slot = (5 if t == 'YES' else 0) + FACES.index(int(f))
    if st == 'MT':
        mt.setdefault(int(a), [None] * 10)[slot] = v
    else:
        gen.setdefault(int(a), {}).setdefault('M' if g == 'MALE' else 'F', [None] * 10)[slot] = v
for a in AGES:
    for sx in 'MF':
        for i, v in enumerate(gen.get(a, {}).get(sx, [None] * 10)):
            if v is None: missing.append(('TX', a, sx, i))
    for i, v in enumerate(mt.get(a, [None] * 10)):
        if v is None: missing.append(('MT', a, i))
if missing:
    sys.exit('missing %d rates, e.g. %s - re-pull before building' % (len(missing), missing[:5]))
c = lambda x: json.dumps(x).replace(' ', '')
body = ','.join('%d:{M:{p:%s},F:{p:%s}}' % (a, c(gen[a]['M']), c(gen[a]['F'])) for a in AGES)
mtb = ','.join('%d:%s' % (a, c(mt[a])) for a in AGES)
entry = (" iule:{label:'Mutual of Omaha IUL Express',perm:true,unisex:false,min:18,max:65,max30:null,notIn:['NY'],"
         "r:{" + body + "},mt:{" + mtb + "}},")
p = os.path.join(ROOT, 'tool/index.html'); s = open(p).read()
key = " iule:{label:'Mutual of Omaha IUL Express'"
if key in s:
    a = s.index(key); b = s.index('\n', a); s = s[:a] + entry + s[b:]
else:
    a = s.index(" moo:{label:'Mutual of Omaha TLE'"); b = s.index('\n', a); s = s[:b + 1] + entry + '\n' + s[b + 1:]
open(p, 'w').write(s)
print('iule rebuilt: ages 18-65, M/F (+ Montana unisex), tobacco Y/N, $25K-$250K -', len(rows), 'quotes')
