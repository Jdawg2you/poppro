#!/bin/zsh
# The redesign's gate: every stage must pass ALL of this before the next stage starts, and again before any ship.
#   1. parity against the LIVE site (tools/parity-check.mjs) - same totals, files, emails, texts, step content, no client-view leaks
#   2. the tool's own checks, run against the redesign preview
#   3. the feature audit
# Needs the redesign preview on 8795 (launch config "poppro-redesign") and the Script Navigator on 8777 ("script-navigator"),
# because Discovery inside MyPopPro IS the navigator in a frame.
# print-check and portable-check are left out: both fail on present/live too (stale since before the redesign).
cd /Users/jessestamm/Documents/poppro-redesign || exit 1
PORT=${1:-8795}
curl -s -o /dev/null "http://127.0.0.1:$PORT/tool/" || { echo "The redesign preview is not running on $PORT."; exit 1; }
curl -s -o /dev/null "http://127.0.0.1:8777/" || { echo "The Script Navigator is not running on 8777."; exit 1; }
fail=0
run(){ echo "\n== $*"; "$@" 2>&1 | tail -6; [ ${pipestatus[1]} -eq 0 ] || { fail=$((fail+1)); echo "   ^ FAILED"; }; }
run node tools/parity-check.mjs https://mypoppro.com/tool/ "http://127.0.0.1:$PORT/tool/"
for c in present-check event-check review-check total-check intake-check why-check med-check care-check clean-check; do
  [ -f tools/$c.mjs ] && run node tools/$c.mjs $PORT
done
for m in embed init live save; do run node tools/discovery-check.mjs $m $PORT 8777; done   # the Discovery step = the navigator in a frame
run node tools/cond-roundtrip-check.mjs 8777
run node tools/benefits-check.mjs
for m in structure pop events; do run node tools/aca-check.mjs $m $PORT; done
run node tools/live-audit.mjs features "http://127.0.0.1:$PORT"
echo ""
[ $fail -eq 0 ] && echo "REDESIGN GATE ok - every check passed" || echo "REDESIGN GATE FAILED - $fail check(s)"
exit $fail
