#!/bin/zsh
# Publish the MyPopPro REDESIGN preview (branch `redesign`) to http://sandbox.mypoppro.com/redesign/tool/
# Jesse, 7 Nov 2026: "We have our regular sandbox and then the redesign sandbox ... we live and breathe in that
# redesign sandbox for this." The new look is built here, checked against the live site with tools/parity-check.mjs,
# and only reaches mypoppro.com when Jesse says ship.
#
# It shares the sandbox's GitHub Pages site (Jdawg2you/poppro-sandbox) but writes ONLY the redesign/ folder:
# the regular sandbox at /tool/ is untouched, and tools/publish-sandbox.sh on `present` leaves redesign/ alone.
# Nothing here can touch mypoppro.com (repository Jdawg2you/poppro). Only COMMITTED work on `redesign` is published.
set -e
SRC="/Users/jessestamm/Documents/poppro-redesign"
OUT="/Users/jessestamm/Documents/poppro-sandbox-site"
REPO="Jdawg2you/poppro-sandbox"
HOST="sandbox.mypoppro.com"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$SRC"
[ "$(git branch --show-current)" = "redesign" ] || { echo "poppro-redesign is not on the redesign branch - stopping."; exit 1; }
[ -d "$OUT/.git" ] || { echo "No sandbox site checkout at $OUT - run tools/publish-sandbox.sh from poppro-present once first."; exit 1; }
SHA=$(git rev-parse --short HEAD)
echo "Publishing redesign @ $SHA to http://$HOST/redesign/tool/"

cd "$OUT"
# The site folder is build output. Start from exactly what is published, so the regular sandbox's files are kept as they are.
git fetch -q origin main && git reset -q --hard origin/main
rm -rf "$OUT/redesign"; mkdir -p "$OUT/redesign"
git -C "$SRC" archive HEAD index.html tool assets favicon.ico | tar -x -C "$OUT/redesign"
git add -A redesign
if git diff --cached --quiet; then echo "Nothing new since the last redesign publish."; else git commit -q -m "Redesign preview from redesign $SHA"; fi
git push -q origin main

echo ""
echo "Done. http://$HOST/redesign/tool/ updates in a minute or two."
