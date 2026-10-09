#!/usr/bin/env python3
"""Build tool/brochures.json - the client brochure link for every ManhattanLife product POP Pro sells, per state.

Joins tool/benefits/<key>.json (which brochure code each state uses - the same mapping the benefits drawer reads)
to the Optimum Carrier Library manifest (where that brochure is filed in Drive, and its link). Rules:
  * client-audience files filed under States/<ST>/ only - that folder is "anyone with the link" (Jesse, 8 Oct 2026);
    _all-states/, _rates/, _agent-guides/ and _archive/ are never linked;
  * English only (Spanish brochures carry SP in the form number);
  * the Drive id must be the file's own: the id is re-read from the file in the mount (Drive for Desktop xattr) and
    must equal the manifest's, and no id may be shared by two files (a copied file inherits its source's id).
Run:  python3 tools/build-brochure-links.py
"""
import csv, json, os, subprocess, sys, collections, glob

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.expanduser('~/Library/CloudStorage/GoogleDrive-jessestamm@gmail.com/My Drive/Optimum Carrier Library')
OUT = os.path.join(HERE, '..', 'tool', 'brochures.json')
KEYS = ['afc', 'his', 'acc', 'gap', 'chas', 'hhc', 'hhcs', 'dvh', 'dvh7016']   # ManhattanLife products in the builder

rows = [r for r in csv.DictReader(open(os.path.join(LIB, 'manifest.csv'))) if r['carrier'] == 'ManhattanLife']
# ids whose file has no Drive-for-Desktop xattr locally, confirmed one by one with the Drive API (title + "anyone" reader)
API_OK = {'1lsoPy2k-fvdkj0mnrofYT5J4PG-CjTg2': 'MO DVHS-BR_0926, checked 2026-10-09'}
by_id = collections.Counter(r['drive_file_id'] for r in rows if r['drive_file_id'])

def own_id(r):
    p = os.path.join(LIB, 'ManhattanLife', r['folder'], r['filename'])
    if not os.path.exists(p):
        p = os.path.join(LIB, r['folder'], r['filename'])
    try:
        return subprocess.run(['xattr', '-p', 'com.google.drivefs.item-id#S', p], capture_output=True, text=True).stdout.strip()
    except Exception:
        return ''

out, gaps, bad = {}, collections.defaultdict(list), []
for key in KEYS:
    b = json.load(open(os.path.join(HERE, '..', 'tool', 'benefits', key + '.json')))
    for br in b['brochures']:
        norm = lambda x: x.replace(' ', '').replace('_', '')
        form, _, ver = br['code'].replace(' ', '_').rpartition('_')
        for st in br['states']:
            cand = [r for r in rows if r['audience'] == 'client' and r['state'] == st and (r['folder'] == 'States/' + st or r['folder'].startswith('States/' + st + '/'))
                    and norm(r['form_number'] + r['version']) == norm(br['code']) and 'SP' not in r['form_number']]
            if not cand:
                gaps[key].append(st); continue
            r = cand[0]; fid = r['drive_file_id']
            if not fid or by_id[fid] > 1 or (own_id(r) != fid and fid not in API_OK):
                bad.append((key, st, r['filename'], fid, by_id[fid])); continue
            out.setdefault(st, {})[key] = {'name': b['name'], 'form': form, 'ver': ver,
                                           'url': 'https://drive.google.com/file/d/' + fid + '/view'}

json.dump({'src': 'Optimum Carrier Library manifest joined to tool/benefits; States/ folders only; built by tools/build-brochure-links.py',
           'states': out}, open(OUT, 'w'), separators=(',', ':'), sort_keys=True)
print('states', len(out), 'links', sum(len(v) for v in out.values()))
for k, v in gaps.items(): print('no States/ file:', k, ' '.join(sorted(v)))
for x in bad: print('id rejected:', x)
