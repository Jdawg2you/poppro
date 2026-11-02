#!/bin/zsh
# Publish the MyPopPro sandbox (branch `present`) to https://sandbox.mypoppro.com/tool/
# Jesse, 1 Nov 2026: "others can see the updates too, but it doesn't affect the current users."
#
# The sandbox is its OWN GitHub repository (Jdawg2you/poppro-sandbox) with its own Pages site, so nothing here can
# touch mypoppro.com (repository Jdawg2you/poppro). Only COMMITTED work on `present` is published.
# First run creates the repository and turns on Pages; every run after that just updates it.
set -e
SRC="/Users/jessestamm/Documents/poppro-present"
OUT="/Users/jessestamm/Documents/poppro-sandbox-site"
REPO="Jdawg2you/poppro-sandbox"
HOST="sandbox.mypoppro.com"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$SRC"
[ "$(git branch --show-current)" = "present" ] || { echo "poppro-present is not on the present branch - stopping."; exit 1; }
SHA=$(git rev-parse --short HEAD)
echo "Publishing present @ $SHA to https://$HOST/tool/"

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  echo "Creating $REPO (first run)..."
  gh repo create "$REPO" --public --description "MyPopPro sandbox - $HOST (preview builds; the live tool is mypoppro.com)"
fi

if [ ! -d "$OUT/.git" ]; then
  mkdir -p "$OUT"; git -C "$OUT" init -q -b main
  git -C "$OUT" remote add origin "https://github.com/$REPO.git"
fi

# the site files only - the same set mypoppro.com serves (data/ and tools/ stay out, as _config.yml excludes them there)
find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git archive HEAD index.html tool assets favicon.ico _config.yml | tar -x -C "$OUT"
echo "$HOST" > "$OUT/CNAME"
printf 'User-agent: *\nDisallow: /\n' > "$OUT/robots.txt"

cd "$OUT"
git add -A
if git diff --cached --quiet; then echo "Nothing new since the last publish."; else git commit -q -m "Sandbox from present $SHA"; fi
git push -q -u origin main

# Pages on, served from main, at the sandbox address (no-ops once set)
gh api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true
gh api -X PUT "repos/$REPO/pages" -f "cname=$HOST" >/dev/null 2>&1 || true

echo ""
echo "Done. https://$HOST/tool/ updates in a minute or two."
echo "(First time only: GoDaddy needs a CNAME record  sandbox -> jdawg2you.github.io)"
