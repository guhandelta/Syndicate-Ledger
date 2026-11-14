#!/usr/bin/env bash
# Builds the full website into site/: the latest game at / and the original v1 at /v1/.
# Used by GitHub Pages, Netlify and Vercel, so every host serves the same files.
# The game is one self-contained HTML file with hash routes (#...), so it works at any base path.
set -euo pipefail

# v1 (the pre-Svelte game) is always built from this exact commit, plus the case notebook (below).
V1_COMMIT=7c7e0e0aadb24fe06ece3cd86459af6cdb0e6056
V1_TARBALL="https://codeload.github.com/guhandelta/Syndicate-Ledger/tar.gz/$V1_COMMIT"

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

npm run build
rm -rf site
mkdir -p site/v1
cp dist/syndicate-ledger.html site/index.html
cp dist/syndicate-ledger.html site/syndicate-ledger.html

v1src="$(mktemp -d)"
trap 'rm -rf "$v1src"' EXIT
# Hosts clone shallowly (or not at all), so use local git history when present, else GitHub's tarball.
if git cat-file -e "$V1_COMMIT^{commit}" 2>/dev/null; then
  git archive "$V1_COMMIT" | tar -x -C "$v1src"
else
  curl -fsSL "$V1_TARBALL" | tar -xz -C "$v1src" --strip-components=1
fi
# The one addition to v1: the same case notebook as the latest game (src/ui/notepad.ts has no imports).
cp src/ui/notepad.ts "$v1src/src/ui/notepad.ts"
printf "\nimport { mountNotepad } from './ui/notepad';\nmountNotepad({ storageKey: 'syndicate-ledger:v1:notes:case-01-harbor-ledger' });\n" >> "$v1src/src/main.ts"
(cd "$v1src" && npm ci --no-audit --no-fund && npm run build)
cp "$v1src/dist/syndicate-ledger.html" site/v1/index.html

echo "Site ready in site/: $(ls -R site | tr '\n' ' ')"
