#!/bin/zsh
# Opens the in-progress POP Pro (this Mac's working copy) in your browser.
# The live site, mypoppro.com, is NOT changed by anything here.
REPO="$HOME/Documents/poppro"; PORT=8765; URL="http://127.0.0.1:$PORT/tool/"
cd "$REPO" || { echo "Can't find $REPO"; read -k1; exit 1; }
echo "POP Pro — local preview"
echo "========================"
echo
echo "What's in this preview that is NOT live yet:"
git log --format='  • %s' origin/main..HEAD 2>/dev/null
git status --porcelain | grep -q . && echo "  • plus changes not yet committed:" && git status --porcelain | sed 's/^/      /'
echo
if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "Preview server already running."
else
  echo "Starting the preview server…"
  nohup python3 -m http.server $PORT --bind 127.0.0.1 --directory "$REPO" >/dev/null 2>&1 &
  sleep 1
fi
open "$URL"
echo
echo "Opened $URL"
echo "Play freely — nothing you do here reaches mypoppro.com."
echo "When you're happy, tell Claude \"ship POP Pro\" and it will push."
