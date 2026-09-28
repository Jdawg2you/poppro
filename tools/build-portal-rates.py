#!/usr/bin/env python3
"""Build tool/rates/portal-rates.json from the ManhattanLife agent-portal pulls in data/ml-portal/.

Input
  ml-portal-full-TX-*.json            {pid: {name, plans[], riders[]}}  (Texas, every product)
  ml-portal-full-<pid>-groups-*.json   [{pid, name, st, states[], plans[], riders[]}]  (one rep state per rate group)
  rate-groups-*.json                   which states share Texas's rates, per product

Output (compact; one price per age, male non-tobacco, applicant and spouse the same age)
  {v, products: {pid: {name, groups: [{states, rep, plans: {key: {hh: [firstAge, [p, p, ...]]}},
                                                  riders: {key: {hh: [firstAge, [...]]}}}]}}}
  plan key  = "<plan> | <unit>"      e.g. "Inpatient Hospital | $100 / Day"
  rider key = "<rider> | <unit>"     e.g. "First Hospital Admission | First Hospital Admissions $2,500"
Female probes are compared, not stored: 'sexRated' is set on a group if any female price differed.
"""
import json, glob, os, collections, sys
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "ml-portal")
OUT = os.path.join(HERE, "..", "tool", "rates", "portal-rates.json")

def series(rows, keyf):
    t = collections.defaultdict(lambda: collections.defaultdict(dict))
    for r in rows:
        if r.get("sex", "Male") != "Male": continue
        if not r.get("n"): continue                       # portal returned nothing for this case
        t[keyf(r)][r["hh"]][r["a"]] = r["premium"]
    out = {}
    for k, byhh in t.items():
        out[k] = {}
        for hh, ages in byhh.items():
            a0, a1 = min(ages), max(ages)
            out[k][hh] = [a0, [ages.get(a) for a in range(a0, a1 + 1)]]
    return out

def sex_rated(rows):
    male = {(r["plan"], r["unit"], r["a"]): r["premium"] for r in rows if r.get("sex") == "Male" and r["hh"] == "I"}
    return any(abs(r["premium"] - male.get((r["plan"], r["unit"], r["a"]), r["premium"])) > 0.005
               for r in rows if r.get("sex") == "Female")

def group(R, states):
    return {"states": sorted(states), "rep": R.get("st", "TX"),
            "sexRated": sex_rated(R["plans"]),
            "plans": series(R["plans"], lambda r: f'{r["plan"]} | {r["unit"].strip()}'),
            "riders": series(R["riders"], lambda r: f'{r["rider"]} | {str(r["unit"]).strip()}')}

products = {}
def add(pid, name, g):
    products.setdefault(str(pid), {"name": name, "groups": []})["groups"].append(g)

gfile = sorted(glob.glob(os.path.join(DATA, "rate-groups-*.json")))[-1]
tx_states = {str(g["pid"]): g["states"] for g in json.load(open(gfile)) if g["rep"] == "TX"}
for f in sorted(glob.glob(os.path.join(DATA, "ml-portal-full-TX-*.json"))):
    for pid, R in json.load(open(f)).items():
        add(pid, R["name"], group(R, tx_states.get(pid, ["TX"])))
for f in sorted(glob.glob(os.path.join(DATA, "ml-portal-full-*-groups-*.json"))):
    for R in json.load(open(f)):
        add(R["pid"], R["name"], group(R, R["states"]))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"v": "ManhattanLife agent portal, pulled 2026-09-28", "products": products}, open(OUT, "w"), separators=(",", ":"))
n = sum(len(p["groups"]) for p in products.values())
print(f"{OUT}: {len(products)} products, {n} state groups, {os.path.getsize(OUT)//1024} KB")
for pid, p in sorted(products.items(), key=lambda x: int(x[0])):
    sts = sorted({s for g in p["groups"] for s in g["states"]})
    print(f"  {pid:>4} {p['name']:40s} {len(p['groups']):2d} groups, {len(sts):2d} states{'  (sex-rated)' if any(g['sexRated'] for g in p['groups']) else ''}")
