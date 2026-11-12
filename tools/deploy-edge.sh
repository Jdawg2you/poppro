#!/bin/zsh
# Deploy MyPopPro to Cloudflare. live = the main branch (only on Jesse's "ship"); sandbox = the present branch.
#   zsh tools/deploy-edge.sh sandbox
#   zsh tools/deploy-edge.sh live
# Only what the site serves goes up: the landing page, assets/, signin/, tool/, favicon, robots. Never data/, tools/, edge/ or notes.
set -e
TARGET=${1:-sandbox}
REPO=${0:A:h:h}
case $TARGET in
  live)    BRANCH=main;    ENVFLAG=();;
  sandbox) BRANCH=present; ENVFLAG=(--env sandbox);;
  *) echo "usage: deploy-edge.sh live|sandbox"; exit 1;;
esac
OUT=$REPO/.edge-build/site
rm -rf $OUT && mkdir -p $OUT
SRC=$REPO
[ $TARGET = live ] && SRC=$HOME/Documents/poppro
git -C $SRC archive --format=tar $BRANCH index.html favicon.ico assets tool signin $( git -C $SRC ls-tree --name-only $BRANCH robots.txt ) | tar -x -C $OUT
[ -f $OUT/robots.txt ] || printf 'User-agent: *\nAllow: /$\nDisallow: /tool/\nDisallow: /signin/\n' > $OUT/robots.txt
SHA=$(git -C $SRC rev-parse --short $BRANCH)
echo "Deploying $TARGET @ $SHA ($(find $OUT -type f | wc -l | tr -d ' ') files)"
cd $REPO/edge && npx --yes wrangler@4 deploy $ENVFLAG --message "$TARGET $SHA"
