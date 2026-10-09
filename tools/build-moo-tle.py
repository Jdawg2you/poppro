#!/usr/bin/env python3
"""Mutual of Omaha Term Life Express, 20-year, monthly bank draft: rebuild LB_RATES.moo in tool/index.html.

Input: data/lb/moo-tle-20yr.json - rows [age, "MALE"|"FEMALE", "NO"|"YES" (tobacco), face, "monthly"], pulled from
Mutual of Omaha's public sales-professional quoter (www3.mutualofomaha.com/mobile-quotes/#/tle), Texas. Rates are
the same in every state; the product is not sold in New York. Issue ages for the 20-year term are 18-60.
Slots per row: [nonTob25, nonTob50, nonTob75, nonTob100, nonTob250, tob25, tob50, tob75, tob100, tob250].

    python3 tools/build-moo-tle.py
"""
import json, os, re, sys
ROOT = os.path.join(os.path.dirname(__file__), '..')
rows = json.load(open(os.path.join(ROOT, 'data/lb/moo-tle-20yr.json')))['rows']
FACES = [25000, 50000, 75000, 100000, 250000]
r, missing = {}, []
for a, g, t, f, m in rows:
    sx = 'M' if g == 'MALE' else 'F'
    slot = (5 if t == 'YES' else 0) + FACES.index(int(f))
    r.setdefault(int(a), {}).setdefault(sx, {'20': [None] * 10})['20'][slot] = (round(float(m), 2) if m not in (None, '') else None)
for a in range(18, 61):
    for sx in 'MF':
        for i, v in enumerate(r.get(a, {}).get(sx, {'20': [None] * 10})['20']):
            if v is None: missing.append((a, sx, i))
if missing:
    sys.exit('missing %d rates, e.g. %s - re-pull before building' % (len(missing), missing[:5]))
body = ','.join('%d:{M:{"20":%s},F:{"20":%s}}' % (a, json.dumps(r[a]['M']['20']).replace(' ', ''), json.dumps(r[a]['F']['20']).replace(' ', '')) for a in range(18, 61))
entry = " moo:{label:'Mutual of Omaha TLE',unisex:false,min:18,max:60,max30:50,r:{" + body + "}},"
p = os.path.join(ROOT, 'tool/index.html'); s = open(p).read()
a = s.index(" moo:{label:'Mutual of Omaha TLE'"); b = s.index('\n', a)
s = s[:a] + entry + s[b:]
open(p, 'w').write(s)
print('moo rebuilt: ages 18-60, M/F, tobacco Y/N, $25K/$50K/$75K/$100K/$250K -', len(rows), 'quotes')
