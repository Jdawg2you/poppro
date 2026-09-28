#!/usr/bin/env python3
"""Extend the Optimum Carrier Library (Drive) with every ManhattanLife document the agent
portal lists, per state and product. Source list: data/ml-portal/ml-portal-brochures-*.json.
Client docs: one copy per state -> ManhattanLife/<ST>/<Product>/  (folder shared as link-viewer)
Agent docs (guides, rates, premiums, Facts & Questions): one copy -> _agent-guides|_rates/<Product>/ (private)
Appends manifest rows; never overwrites an existing file. Run check-library.sh afterwards."""
import json, os, re, sys, csv, shutil, collections, pathlib
SRC, LIB, LIST = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
ML = LIB / "ManhattanLife"
PROD = {9:("Cancer Care Plus","CCP"),10:("Critical Protection and Recovery","CPR"),137:("24-Hour Accident","EAEP"),
 138:("Accident Insurance (PAID Enhanced)","PAID"),150:("Dental Vision Hearing (7016)","DVH7016"),
 158:("Out-of-Pocket Protection (Gap)","GAP"),167:("Affordable Choice","AFC"),301:("Dental Vision Hearing Select","DVHS"),
 304:("Home Health Care Select","HHCS"),305:("Home Health Care Select","HHCS"),306:("Home Health Care Enhanced","HHC"),
 400:("Cancer Heart Attack and Stroke","CHAS"),700:("Short Term Care (OmniFlex)","STC"),703:("Hospital Indemnity Select","HIS")}
FIX = {"Affordabble":"Affordable","Critcal":"Critical","Prtoction":"Protection","Out-of-Pockets":"Out-of-Pocket","DVH7106":"DVH7016"}
def clean(s):
    for a,b in FIX.items(): s=s.replace(a,b)
    return re.sub(r"\s+"," ",s.replace("/","-")).strip()
def doctype(desc):
    d=desc.lower()
    if "agent guide" in d: return "agent-guide"
    if "rate" in d or "premium" in d: return "rates"
    if "facts & questions" in d: return "faq"
    return "brochure"
rows = json.load(open(LIST))["rows"]
states_for = collections.defaultdict(set)
for st,pid,prod,f,desc,u in rows: states_for[(pid,f)].add(st)
man_path = LIB/"manifest.csv"
man = list(csv.DictReader(open(man_path)))
have = {(r["folder"], r["filename"]) for r in man}
cols = list(man[0].keys())
new = []; copied = 0; seen_agent=set()
for st,pid,prod,f,desc,u in sorted(rows):
    pname, code = PROD.get(pid,(prod,str(pid)))
    dt = doctype(desc); stem, ext = os.path.splitext(f)
    form, _, ver = stem.rpartition("_") if "_" in stem else (stem,"","")
    if dt in ("agent-guide","rates","faq"):
        if (pid,f) in seen_agent: continue
        seen_agent.add((pid,f)); sts = sorted(states_for[(pid,f)])
        scope = sts[0] if len(sts)==1 else f"{len(sts)} states"
        folder = f"{'_rates' if dt=='rates' else '_agent-guides'}/{pname}"
        label = f"{scope} {pname} - {clean(desc)}" + ("" if dt=="rates" else " - AGENT ONLY")
        state, also, aud = ("ALL" if len(sts)>1 else sts[0]), (" ".join(sts) if len(sts)>1 else ""), "agent"
    else:
        folder = f"{st}/{pname}"; label = f"{st} {pname} - {clean(desc)}"; state, also, aud = st, "", "client"
    name = f"{stem} ({label}){ext.lower()}"
    if (folder, name) in have: continue
    dest = ML/folder/name; dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists(): shutil.copy2(os.path.join(SRC,f), dest); copied += 1
    r = dict.fromkeys(cols,""); r.update(carrier="ManhattanLife", product=pname, product_code=code, doc_type=dt, audience=aud,
        state=state, also_applies_to=also, form_number=form, version=ver, folder=folder, filename=name,
        notes=f"from agent portal 2026-09-28: {clean(desc)}")
    new.append(r); have.add((folder,name))
with open(man_path,"a",newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=cols); [w.writerow(r) for r in new]
print(f"copied {copied} files, added {len(new)} manifest rows")
print(collections.Counter(r['audience'] for r in new))
