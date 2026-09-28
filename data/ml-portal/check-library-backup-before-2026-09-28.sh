#!/bin/zsh
# Guard for the Optimum Carrier Library.
# Run after ANY upload. Enforces the invariant that makes folder-level
# public sharing safe: the four shared folders hold client-audience files only.
LIB="$("$HOME/Documents/Claude/Projects/Health Insurance/drive-path.sh")/Optimum Carrier Library"
python3 - "$LIB" <<'PY'
import csv, sys, pathlib, collections
LIB = pathlib.Path(sys.argv[1])
SHARED = {"AZ","FL","GA","TX","_all-states"}          # public: anyone with the link
PRIVATE = {"_rates","_agent-guides","_archive"}   # never shared
rows = list(csv.DictReader(open(LIB/"manifest.csv")))
fail = False

# 1. manifest <-> disk
disk = {p.name for p in LIB.rglob("*") if p.is_file() and p.name not in ("manifest.csv","README.md","SHARING-SOP.md") and not p.name.endswith(".sh")}
man  = {r["filename"] for r in rows}
if disk - man:
    fail = True; print("FAIL  on disk but NOT in manifest (add a row, incl. audience):")
    for n in sorted(disk-man): print("        ", n)
if man - disk:
    fail = True; print("FAIL  in manifest but NOT on disk:")
    for n in sorted(man-disk): print("        ", n)

# 2. the sharing invariant
leaks = [r for r in rows if r["folder"].split("/")[0] in SHARED and r["audience"] != "client"]
if leaks:
    fail = True
    print("FAIL  agent-audience file inside a PUBLICLY SHARED folder — move it to _rates/ or _agent-guides/:")
    for r in leaks: print(f"         {r['folder']}/{r['filename']}  (audience={r['audience']})")

# 3. anything unfiled
strays = [r for r in rows if r["folder"].split("/")[0] not in SHARED | PRIVATE]
if strays:
    fail = True; print("FAIL  file in an unrecognised folder:")
    for r in strays: print(f"         {r['folder']}/{r['filename']}")

if not fail:
    n_pub = sum(1 for r in rows if r["folder"].split("/")[0] in SHARED)
    print(f"PASS  {len(rows)} files indexed · {n_pub} client-safe in shared folders · "
          f"{len(rows)-n_pub} agent-only, private")
    print("      Shared folders hold client-audience files only. Safe to send any link from FL/GA/TX/_all-states.")
sys.exit(1 if fail else 0)
PY
