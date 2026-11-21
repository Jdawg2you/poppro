#!/bin/zsh
# AI for the assist (Health ZONE's kit, 20 Nov 2026): copies the prompt and the PUBLIC version file into tool/ai/.
# Only version.json and prompt.txt are published - never schema.md, schema-paths.json, observed-keys.json (the data model).
# Run Health ZONE's regen first ("Refresh POP Pro template.command"); this then checks and copies. Exit 1 = don't ship.
set -u
KIT="$HOME/Documents/Claude/Projects/Agent Onboarding and Coaching/Claude outputs/optimum-planning-tools/poppro-json-kit"
OUT="$(cd "$(dirname "$0")/.." && pwd)/tool/ai"
[ -f "$KIT/PASTE-INTO-CLAUDE.txt" ] && [ -f "$KIT/reference/version.json" ] || { echo "AI SYNC FAIL - kit not found at $KIT"; exit 1; }
# Both published files can agree with each other and still be stale against the tool: check regen saw THIS blankState()
# (Health ZONE's fingerprint, kept in the unpublished schema-paths.json). ${1:-} lets a test point it at another index.html.
SRC="${1:-$(dirname "$OUT")/index.html}"
WANT=$(awk '/^function blankState\(\)\{/,/^}/' "$SRC" | shasum -a 256 | cut -c1-12)
HAVE=$(/usr/bin/python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('blankStateSourceHash',''))" "$KIT/reference/schema-paths.json" 2>/dev/null)
[ -n "$WANT" ] && [ "$WANT" = "$HAVE" ] || { echo "AI SYNC FAIL - STALE: blankState changed since regen ran (${HAVE:-none} -> $WANT). Run 'Refresh POP Pro template' (regen.mjs) first."; exit 1; }
/usr/bin/python3 - "$KIT" "$OUT" <<'PY'
import json,sys,re,shutil
kit,out=sys.argv[1],sys.argv[2]
v=json.load(open(kit+'/reference/version.json'))
allowed={'promptVersion','toolRelease','generated','schemaHash','topKeys','fields','addedCount','removedCount','promptUrl'}
extra=set(v)-allowed
if extra: sys.exit('AI SYNC FAIL - version.json has keys that could leak the data model: %s'%sorted(extra))
p=open(kit+'/PASTE-INTO-CLAUDE.txt',encoding='utf-8').read()
m=re.search(r'PROMPT VERSION:\s*(\d{4}-\d\d-\d\d)',p)
if not m or m.group(1)!=v['promptVersion']: sys.exit('AI SYNC FAIL - prompt stamp %s != version.json %s (run regen)'%(m and m.group(1),v['promptVersion']))
if re.search(r'\b\d{3}-\d\d-\d{4}\b',p): sys.exit('AI SYNC FAIL - something shaped like an SSN in the prompt')
shutil.copy(kit+'/PASTE-INTO-CLAUDE.txt',out+'/prompt.txt'); json.dump(v,open(out+'/version.json','w'),indent=1)
print('AI SYNC ok - prompt version %s, %s fields'%(v['promptVersion'],v['fields']))
PY
