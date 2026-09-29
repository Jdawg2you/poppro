#!/bin/zsh
# Opens POP Pro version A (today's build, frozen) and version B (new work) side by side.
# Neither touches mypoppro.com.
A="$HOME/Documents/poppro";   PA=8765
B="$HOME/Documents/poppro-b"; PB=8766
start(){ if ! curl -s -o /dev/null "http://127.0.0.1:$2/"; then nohup python3 -m http.server $2 --bind 127.0.0.1 --directory "$1" >/dev/null 2>&1 & sleep 1; fi }
echo "POP Pro — compare A and B"; echo "========================="
start "$A" $PA; start "$B" $PB
echo; echo "A (frozen, as of 29 Sep):  http://127.0.0.1:$PA/tool/"
echo "B (in progress):           http://127.0.0.1:$PB/tool/"
echo; echo "What B has that A doesn't:"
git -C "$B" log --format='  • %s' preview-a-2026-09-29..HEAD 2>/dev/null | head -30
git -C "$B" log --oneline preview-a-2026-09-29..HEAD 2>/dev/null | grep -q . || echo "  (nothing yet)"
open "http://127.0.0.1:$PA/tool/"; open "http://127.0.0.1:$PB/tool/"
echo; echo "Tip: each version keeps its own saved client. To try the same client in both,"
echo "use Save quote in one and Load quote in the other."
