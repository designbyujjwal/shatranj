#!/bin/sh
# Builds the game for GitHub Pages and publishes it on the gh-pages branch of this repository.
# Pages serves it at https://<owner>.github.io/<repo>/; duels go to the duel server on Render.
set -e
cd "$(dirname "$0")/.."
REMOTE_URL="$(git remote get-url origin)"
REPO="$(basename "$REMOTE_URL" .git)"
DUEL_SERVER="${DUEL_SERVER:-https://playshatranj.onrender.com}"

VITE_DUEL_SERVER="$DUEL_SERVER" npx vite build --base="/$REPO/" --outDir dist-pages --emptyOutDir
touch dist-pages/.nojekyll   # serve every file as it is

cd dist-pages
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" \
  commit -q -m "Publish the game ($(git -C .. rev-parse --short HEAD))"
git push -q -f "$REMOTE_URL" gh-pages
rm -rf .git
echo "Published to the gh-pages branch of $REPO"
