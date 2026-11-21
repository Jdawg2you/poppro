#!/bin/zsh
# Ship gate for AI for the assist (Health ZONE, 20 Nov). Run AFTER shipping live, with NO cookie and NO audit key.
# If version.json isn't public, every agent's Claude quietly says "version not checked" forever - so this must be loud.
H="${1:-https://mypoppro.com}"; F=0
c=$(curl -s -o /dev/null -w "%{http_code}" "$H/tool/ai/version.json?cb=$RANDOM"); [ "$c" = 200 ] || { echo "AI GATE FAIL - version.json is $c without login (want 200)"; F=1; }
curl -s "$H/tool/ai/version.json?cb=$RANDOM" | /usr/bin/python3 -c "import json,sys;v=json.load(sys.stdin);assert 'promptVersion' in v" 2>/dev/null || { echo "AI GATE FAIL - version.json is not the version JSON"; F=1; }
c=$(curl -s -o /dev/null -w "%{http_code}" "$H/tool/ai/prompt.txt?cb=$RANDOM"); [ "$c" = 401 ] || { echo "AI GATE FAIL - prompt.txt is $c without login (want 401)"; F=1; }
curl -s "$H/tool/ai/?cb=$RANDOM" | grep -q "Copy the prompt" && { echo "AI GATE FAIL - the page shows without login"; F=1; }
[ $F = 0 ] && echo "AI GATE ok - $H: version.json public, prompt and page behind sign-in"; exit $F
