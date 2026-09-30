#!/usr/bin/env python3
"""DVH Select rates for states the ManhattanLife portal pull does not cover, read from each state's own
consumer brochure in the Optimum Carrier Library. Output matches rates/portal-rates.json groups exactly
(per-age arrays 18..99 for I/S/C/F; Vision and Hearing riders), so pDVH() prices them the same way.

    python3 tools/build-dvh-brochure-rates.py        -> tool/rates/dvh-brochure-rates.json

Never borrows: a state is added only from its own brochure. Needs macOS `swift` (PDFKit) for the text.
"""
import json, os, re, subprocess, sys, datetime

LIB = os.path.expanduser('~/Library/CloudStorage/GoogleDrive-jessestamm@gmail.com/My Drive/Optimum Carrier Library/ManhattanLife/States')
STATES = ['MS', 'NV', 'NJ', 'NC', 'PA']          # sold (brochure on file) but not in the portal pull
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'tool', 'rates', 'dvh-brochure-rates.json')
BANDS = [(18, 39), (40, 54), (55, 64), (65, 74), (75, 99)]
TIERS = ['I', 'S', 'C', 'F']
MONEY = re.compile(r'\$([\d,]+\.\d\d)')

def text(pdf):
    return subprocess.run(['swift', os.path.join(HERE, 'pdftext.swift'), pdf], capture_output=True, text=True, check=True).stdout

def expand(rows):
    """rows: 5 lists of 4 values (one per band) -> {tier: [18, [82 per-age values]]}"""
    out = {}
    for ti, t in enumerate(TIERS):
        arr = []
        for (lo, hi), vals in zip(BANDS, rows):
            arr += [vals[ti]] * (hi - lo + 1)
        assert len(arr) == 82, len(arr)
        out[t] = [18, arr]
    return out

def dental(page):
    """The dental page: four '$N Maximum Benefit' blocks, each with a $0 and a $100 deductible table side by side."""
    plans, child = {}, {}
    blocks = re.split(r'\$([\d,]+) Maximum Benefit', page)[1:]
    assert len(blocks) == 8, f'expected 4 benefit blocks, got {len(blocks)//2}'
    for i in range(0, 8, 2):
        mx = blocks[i].replace(',', ''); body = blocks[i + 1]
        left, right, kid = [], [], {}
        for line in body.splitlines():
            m = re.findall(r'(\d+) - (\d+)((?: \$[\d,]+\.\d\d)+)', line)
            if not m: continue
            for side, (lo, hi, vals) in enumerate(m):
                v = [float(x.replace(',', '')) for x in MONEY.findall(vals)]
                if (int(lo), int(hi)) == (3, 17): kid[side] = v[0]; continue
                assert len(v) == 4, (line, v)
                (left if side == 0 else right).append(v)
        assert len(left) == 5 and len(right) == 5, (mx, len(left), len(right))
        for side, ded, rows in ((0, '0', left), (1, '100', right)):
            key = f'${mx} Benefit - ${ded} Deductible | ${ded} Deductible'
            plans[key] = expand(rows); child[key] = kid[side]
    return plans, child

def rider(page, name):
    """A rider table: a 3-17 child rate, then five band rows of 4 values (with or without band labels)."""
    seg = page.split(name, 1)[1]
    vals = []
    for line in seg.splitlines():
        v = [float(x.replace(',', '')) for x in MONEY.findall(line)]
        if v: vals.append(v)
        if len(vals) == 6: break
    assert len(vals[0]) == 1 and all(len(r) == 4 for r in vals[1:6]), (name, vals)
    return expand(vals[1:6]), vals[0][0]

groups, sources = [], {}
for st in STATES:
    folder = os.path.join(LIB, st, 'Dental Vision Hearing Select')
    pdfs = [f for f in os.listdir(folder) if f.lower().endswith('.pdf') and not re.search(r'BRSP|spanish', f, re.I)]
    assert len(pdfs) == 1, (st, pdfs)
    t = text(os.path.join(folder, pdfs[0]))
    rates_at = t.index('Monthly Rates')
    page = t[rates_at:]
    dpage = page.split('VISION RIDER')[0]
    plans, child = dental(dpage)
    vis, vis_child = rider(page, 'VISION RIDER')
    hear, hear_child = rider(page, 'HEARING RIDER')
    code = pdfs[0].split(' (')[0]
    sources[st] = code
    groups.append({'states': [st], 'rep': st, 'sexRated': False, 'src': f'{code} consumer brochure, Optimum Carrier Library',
                   'plans': plans, 'riders': {'Vision Rider | Lenses/Frames $200': vis, 'Hearing Rider | $1,000': hear},
                   'child': {'plans': child, 'Vision Rider | Lenses/Frames $200': vis_child, 'Hearing Rider | $1,000': hear_child},
                   'notes': ['Rate based off the age of the eldest/oldest applicant; pricing based off issue age.',
                             'Family rates include up to three children; additional children are charged the age 3-17 rate per person.']})
    print(f'{st}: {code} — {len(plans)} plans, 2 riders')

json.dump({'v': f'DVH Select brochure rates, built {datetime.date.today().isoformat()}', 'product': 301, 'sources': sources, 'groups': groups},
          open(OUT, 'w'), indent=1)
print('wrote', os.path.relpath(OUT))
