#!/bin/zsh
# Move ManhattanLife portal pull files from ~/Downloads into the repo and rebuild POP Pro's rate file.
set -e
REPO="$HOME/Documents/poppro"; DEST="$REPO/data/ml-portal"
setopt null_glob
files=(~/Downloads/ml-portal-full-*.json)
for f in $files; do
  b=$(basename "$f" | sed -E 's/ \([0-9]+\)\.json$/.json/')
  if [ -e "$DEST/$b" ] && cmp -s "$f" "$DEST/$b"; then rm "$f"; continue; fi
  [ -e "$DEST/$b" ] && b="${b%.json}-$(date +%H%M%S).json"
  mv "$f" "$DEST/$b"; echo "filed $b"
done
python3 "$REPO/tools/build-portal-rates.py"
