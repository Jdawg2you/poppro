#!/usr/bin/env python3
"""Build tool/meds/fda-meds.json — the big medication list behind the POP Pro type-ahead.

Sources: the FDA National Drug Code directory through the public openFDA API (api.fda.gov),
prescription drugs only, joined by NDC code to the latest week of CMS NADAC (data.medicaid.gov),
which records what pharmacies actually buy. Run it again whenever you want a fresher list:

    python3 tools/build-fda-meds.py

What it writes, per name:  [display name, other name, kind]
  * brand names (NDA / BLA) carry their generic ingredient name as the other name;
  * generic names come from every generic (ANDA) product on file;
  * kind is 'g' only when a generic of the same active ingredients is being bought this week
    (its NDC is in NADAC as generic) - an approved-but-unlaunched generic (Eliquis) stays 'b'. Biologics (BLA) are always 'b' — biosimilars price on brand/specialty tiers, the
    same rule MED_RX already follows for Humira and the insulins.

This list never links a medication to a condition; that stays the navigator's MED_FOR table.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

API = 'https://api.fda.gov/drug/ndc.json'
OUT = os.path.join(os.path.dirname(__file__), '..', 'tool', 'meds', 'fda-meds.json')
RX = 'product_type:"HUMAN PRESCRIPTION DRUG"'


def get(url):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r), r.headers.get('Link') or ''
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {'results': []}, ''
            time.sleep(2 + attempt * 3)
        except Exception:
            time.sleep(2 + attempt * 3)
    sys.exit('openFDA did not answer: ' + url)


def records(search):
    url = API + '?' + urllib.parse.urlencode({'search': search, 'limit': 1000})
    while url:
        d, link = get(url)
        for r in d.get('results', []):
            yield r
        m = re.search(r'<([^>]+)>;\s*rel="next"', link)
        url = m.group(1) if m else None
        time.sleep(0.3)


def counts(search, field):
    d, _ = get(API + '?' + urllib.parse.urlencode({'search': search, 'count': field, 'limit': 1000}))
    return [x['term'] for x in d.get('results', [])]


def norm(s):
    return re.sub(r'\s+', ' ', str(s or '').strip().lower())


def title(s):
    s = re.sub(r'\s+', ' ', str(s or '').strip())
    return s if re.search(r'[a-z]', s) and re.search(r'[A-Z]', s) else s.title()


def ndc11(code):
    """FDA package NDC ('0002-1433-80', 4-4-2 / 5-3-2 / 5-4-1) -> NADAC's 11 digits (5-4-2)."""
    a, b, c = (code.split('-') + ['', '', ''])[:3]
    return a.zfill(5) + b.zfill(4) + c.zfill(2)


def ingredients(r):
    """The active ingredients as a set, so 'A, B' and 'B and A' are the same drug."""
    names = [norm(x.get('name')) for x in (r.get('active_ingredients') or []) if x.get('name')]
    return frozenset(names) if names else frozenset([norm(r.get('generic_name'))])


# 1. What pharmacies are actually buying this week: NADAC (CMS), prescription rows of the latest week.
NADAC = 'https://data.medicaid.gov/api/1/datastore/query/fbb83258-11c7-47f5-8b18-5f8e79f7e704/0'
def nadac(body):
    req = urllib.request.Request(NADAC, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    for attempt in range(5):
        try:
            return json.load(urllib.request.urlopen(req, timeout=120))
        except Exception:
            time.sleep(3 + attempt * 3)
    sys.exit('NADAC did not answer')
week = nadac({'limit': 1, 'sorts': [{'property': 'as_of_date', 'order': 'desc'}], 'properties': ['as_of_date'],
              'schema': False, 'count': False})['results'][0]['as_of_date']
cond = [{'property': 'as_of_date', 'value': week, 'operator': '='}, {'property': 'otc', 'value': 'N', 'operator': '='}]
sold_g = set()
off = 0
while True:
    rows = nadac({'limit': 5000, 'offset': off, 'conditions': cond, 'properties': ['ndc', 'classification_for_rate_setting'],
                  'schema': False, 'count': False})['results']
    sold_g.update(r['ndc'] for r in rows if (r.get('classification_for_rate_setting') or '').startswith('G'))
    if len(rows) < 5000:
        break
    off += 5000
print('NADAC week', week, '- generic NDCs bought:', len(sold_g), file=sys.stderr)

# 2. Generic products (ANDA + authorized generics): an ingredient set counts as "generic sold" only
#    when one of its packages is in this week's NADAC generic rows.
generic_sold, generic_names = set(), {}
for cat in ('ANDA', 'NDA AUTHORIZED GENERIC'):
    for r in records(f'{RX} AND marketing_category:"{cat}"'):
        if any(ndc11(p.get('package_ndc', '')) in sold_g for p in (r.get('packaging') or [])):
            ing = ingredients(r)
            generic_sold.add(ing)
            generic_names.setdefault(norm(r.get('generic_name')), r.get('generic_name'))
print('ingredient sets with a generic sold:', len(generic_sold), file=sys.stderr)

# 3. Every brand (NDA / BLA) and its ingredient name.
brands = {}
for cat in ('NDA', 'BLA'):
    for r in records(f'{RX} AND marketing_category:"{cat}"'):
        b, g = (r.get('brand_name') or '').strip(), (r.get('generic_name') or '').strip()
        if not b or not g:
            continue
        key = norm(b)
        kind = 'b' if cat == 'BLA' else ('g' if ingredients(r) in generic_sold else 'b')
        prev = brands.get(key)
        if prev is None or (prev[2] == 'b' and kind == 'g'):
            brands[key] = [title(b), title(g), kind]
print('brands:', len(brands), file=sys.stderr)

# 4. Assemble: brands first, then every sold generic name not already listed.
out, seen = [], set()
for key, row in sorted(brands.items()):
    if norm(row[0]) == norm(row[1]):          # an NDA sold under its own generic name
        row = [row[0], '', row[2]]
    out.append(row); seen.add(key)
idx = {norm(r[0]): r for r in out}
for g, raw in sorted(generic_names.items()):
    if g in idx:
        idx[g][2] = 'g'      # an NDA under its generic name (venlafaxine ER tabs) must not hide the sold generic
    elif len(g) <= 80:
        row = [title(raw), '', 'g']; out.append(row); idx[g] = row
sold_keys = list(generic_names)
for r in out:                # 'Naltrexone' (an NDA) vs the sold generic 'Naltrexone Hydrochloride': same drug, salt named
    if r[2] == 'b' and not r[1] and any(k.startswith(norm(r[0]) + ' ') for k in sold_keys):
        r[2] = 'g'

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'src': 'FDA NDC directory (api.fda.gov) joined to CMS NADAC week ' + week + ', built '
                      + time.strftime('%Y-%m-%d') + ' by tools/build-fda-meds.py',
               'meds': out}, f, separators=(',', ':'))
print('wrote', len(out), 'names ->', os.path.relpath(OUT), file=sys.stderr)
