#!/bin/zsh
# AI for the assist (Health ZONE's kit, 20 Nov 2026): copies the prompt and the PUBLIC version file into tool/ai/.
# Only version.json and prompt.txt are published - never schema.md, schema-paths.json, observed-keys.json (the data model).
# Run Health ZONE's regen first ("Refresh POP Pro template.command"); this then checks and copies. Exit 1 = don't ship.
set -u
# --check: change nothing, exit 1 if tool/ai/ is behind the kit (Health ZONE 21 Nov: a same-day prompt edit keeps the same
# date stamp and byte count, so only a content compare can see it).
CHECK=0; [ "${1:-}" = "--check" ] && { CHECK=1; shift; }
KIT="${AI_KIT:-$HOME/Documents/Claude/Projects/Agent Onboarding and Coaching/Claude outputs/optimum-planning-tools/poppro-json-kit}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/tool/ai"
[ -f "$KIT/PASTE-INTO-CLAUDE.txt" ] && [ -f "$KIT/reference/version.json" ] || { echo "AI SYNC FAIL - kit not found at $KIT"; exit 1; }
# Both published files can agree with each other and still be stale against the tool: check regen saw THIS blankState()
# (Health ZONE's fingerprint, kept in the unpublished schema-paths.json). ${1:-} lets a test point it at another index.html.
SRC="${1:-$(dirname "$OUT")/index.html}"
WANT=$(awk '/^function blankState\(\)\{/,/^}/' "$SRC" | shasum -a 256 | cut -c1-12)
HAVE=$(/usr/bin/python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('blankStateSourceHash',''))" "$KIT/reference/schema-paths.json" 2>/dev/null)
[ -n "$WANT" ] && [ "$WANT" = "$HAVE" ] || { echo "AI SYNC FAIL - STALE: blankState changed since regen ran (${HAVE:-none} -> $WANT). Run 'Refresh POP Pro template' (regen.mjs) first."; exit 1; }
# The prompt's wording, same recipe as regen (sha256 minus the stamp line): an edit made after regen ran has no new stamp yet.
HAVE_P=$(/usr/bin/python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('promptHash',''))" "$KIT/reference/schema-paths.json" 2>/dev/null)
/usr/bin/python3 - "$KIT" "$OUT" "$HAVE_P" "$CHECK" <<'PY'
import json,sys,re,shutil
kit,out,want_p,check=sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]=='1'
import hashlib,os
v=json.load(open(kit+'/reference/version.json'))
allowed={'promptVersion','toolRelease','generated','schemaHash','topKeys','fields','addedCount','removedCount','promptUrl'}
extra=set(v)-allowed
if extra: sys.exit('AI SYNC FAIL - version.json has keys that could leak the data model: %s'%sorted(extra))
p=open(kit+'/PASTE-INTO-CLAUDE.txt',encoding='utf-8').read()
m=re.search(r'PROMPT VERSION:\s*(\d{4}-\d\d-\d\d[a-z]*)',p)
if not m or m.group(1)!=v['promptVersion']: sys.exit('AI SYNC FAIL - prompt stamp %s != version.json %s (run regen)'%(m and m.group(1),v['promptVersion']))
if re.search(r'\b\d{3}-\d\d-\d{4}\b',p): sys.exit('AI SYNC FAIL - something shaped like an SSN in the prompt')
# Every key this build strips from client files must be on the prompt's never-write list (word-bounded: agentMeet is a prefix of agentMeetText).
src=open(os.path.join(os.path.dirname(out),'index.html'),encoding='utf-8').read()
km=re.search(r"var AGENT_KEYS=\[([^\]]*)\]",src); keys=re.findall(r"'([A-Za-z]+)'",km.group(1)) if km else []
# The block runs to the next ALL-CAPS section heading, not the first blank line. Stopping at a blank line inside the block raised FALSE ALARMS (keys below it reported missing); it never hid a real gap.
nv=re.search(r'^NEVER PUT MY DETAILS IN THE FILE[ \t]*$(.*?)(?=^[A-Z][A-Z ,\'’-]{3,}$)',p,re.S|re.M)
if not nv: sys.exit('AI SYNC FAIL - the NEVER PUT MY DETAILS IN THE FILE block is not where this check expects it')
block=nv.group(1)
miss=[k for k in keys if not re.search(r'(?<![A-Za-z])'+k+r'(?![A-Za-z])',block)]
if not keys: sys.exit('AI SYNC FAIL - could not read AGENT_KEYS from the tool')
if miss: sys.exit('AI SYNC FAIL - the prompt does not forbid agent keys this build strips: %s (ask Health ZONE)'%', '.join(miss))
got_p=hashlib.sha256(re.sub(r'^PROMPT VERSION: .*$','',p,count=1,flags=re.M).encode('utf-8')).hexdigest()[:12]
if got_p!=want_p: sys.exit('AI SYNC FAIL - STALE: the prompt was edited after regen ran (%s -> %s). Run regen first so promptVersion moves.'%(want_p or 'none',got_p))
vtxt=json.dumps(v,indent=1)+'\n'
if check:
    cur_p=open(out+'/prompt.txt',encoding='utf-8').read() if os.path.exists(out+'/prompt.txt') else ''
    cur_v=open(out+'/version.json',encoding='utf-8').read() if os.path.exists(out+'/version.json') else ''
    same=cur_p==p and json.loads(cur_v or 'null')==v
    print('AI SYNC current - tool/ai matches the kit (%s)'%v['promptVersion'] if same else 'AI SYNC BEHIND - tool/ai differs from the kit; run zsh tools/ai-sync.sh'); sys.exit(0 if same else 1)
shutil.copy(kit+'/PASTE-INTO-CLAUDE.txt',out+'/prompt.txt'); open(out+'/version.json','w').write(vtxt)
print('AI SYNC ok - prompt version %s, %s fields'%(v['promptVersion'],v['fields']))
PY
