#!/usr/bin/env python3
"""Americo Term 125 (HMS plus 125), 20-year, monthly bank draft: rebuild LB_RATES.americo in tool/index.html.

Input: data/lb/americo-t125-20yr.json - rows [age, "No"|"Yes" (tobacco), face, monthly], pulled 2026-10-09 from
Americo's agent illustration engine (tools.americoagent.com, Instant Decision Term Series, product 359, Texas).
Unisex: male and female premiums are identical (re-confirmed on the pull). Issue ages 20-65 for the 20-year (Jesse, 2026-10-09; the July notes said 64) - the engine itself
will price outside that range, so the range is set here, not taken from it. Not sold in New York.
Slots per row: [nonTob25, nonTob50, nonTob75, nonTob100, nonTob250, tob25, tob50, tob75, tob100, tob250].

    python3 tools/build-americo-t125.py
"""
import json, os, sys
ROOT = os.path.join(os.path.dirname(__file__), '..')
rows = json.load(open(os.path.join(ROOT, 'data/lb/americo-t125-20yr.json')))['rows']
FACES = [25000, 50000, 75000, 100000, 250000]
r = {}
for a, t, f, m in rows:
    slot = (5 if t == 'Yes' else 0) + FACES.index(int(f))
    r.setdefault(int(a), [None] * 10)[slot] = (round(float(m), 2) if m not in (None, '') else None)
missing = [(a, i) for a in range(20, 66) for i, v in enumerate(r.get(a, [None] * 10)) if v is None]
if missing: sys.exit('missing %d rates, e.g. %s - re-pull before building' % (len(missing), missing[:5]))
body = ','.join('%d:{"20":%s}' % (a, json.dumps(r[a]).replace(' ', '')) for a in range(20, 66))
entry = " americo:{label:'Americo Term 125',unisex:true,min:20,max:65,max30:null,r:{" + body + "}},"
p = os.path.join(ROOT, 'tool/index.html'); s = open(p).read()
a = s.index(" americo:{label:'Americo Term 125'"); b = s.index('\n', a)
s = s[:a] + entry + s[b:]
open(p, 'w').write(s)
print('americo rebuilt: ages 20-65, tobacco Y/N, $25K/$50K/$75K/$100K/$250K -', len(rows), 'quotes')
