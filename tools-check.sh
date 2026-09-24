#!/bin/bash
# Syntax-check every inline <script> in the POP Pro page with JavaScriptCore.
#
# jsc reports a SyntaxError on STDOUT and exits 3. An earlier version of this check
# looked only at stderr and therefore passed a file with an unclosed IIFE in it.
# Trust the exit code.
set -u
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
FILE="${1:-$(cd "$(dirname "$0")" && pwd)/tool/index.html}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
FAIL=0

/usr/bin/python3 - "$FILE" "$TMP" <<'PY'
import re, sys
src=open(sys.argv[1],encoding='utf-8').read()
out=sys.argv[2]
for i,b in enumerate(re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.S)):
    open("%s/b%d.js"%(out,i),'w',encoding='utf-8').write(b)
PY

for f in "$TMP"/b*.js; do
  [ -e "$f" ] || continue
  OUT=$("$JSC" "$f" 2>&1)
  # Only SyntaxError counts. jsc also exits 3 for RUNTIME errors, and running a page
  # script with no DOM always throws ReferenceError on `document` - that is expected,
  # not a defect. The wizard's check.sh stubs a DOM when it needs to go further.
  if echo "$OUT" | grep -q "SyntaxError"; then
    echo "SYNTAX ERROR in $(basename "$f"):"
    echo "$OUT" | head -3 | sed 's/^/    /'
    FAIL=1
  fi
done
[ "$FAIL" -eq 0 ] && echo "syntax OK ($(ls "$TMP"/b*.js 2>/dev/null | wc -l | tr -d ' ') script block(s))"
# ---------------------------------------------------------------------------
# Parity with the Script Navigator.
#
# MEDS and MED_FOR are ported verbatim from ~/script-navigator/index.html, which is the
# source of truth. The Product Wizard carries the same port and its tools/check.sh
# already guards it. This file is the THIRD copy, so it needs the same guard - otherwise
# a medication added to the navigator silently stops lifting a condition here, and
# nobody finds out until a client's diabetes never makes it onto the case.
NAV="${NAV_FILE:-$HOME/script-navigator/index.html}"
if [ ! -f "$NAV" ]; then
  echo "parity: SKIPPED - navigator not found at $NAV (set NAV_FILE)" >&2
else
  /usr/bin/python3 "$(dirname "$0")/tools-parity.py" "$NAV" "$FILE" || FAIL=1
fi

exit $FAIL
