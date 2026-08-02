#!/usr/bin/env bash
# Install (or update) the Open Design content library as a sparse clone.
#
#   ./install.sh [target-dir]
#
# Only the content directories are fetched: skills, design-systems,
# design-templates, prompt-templates. No app code, no build, no daemon,
# no `od` binary. Roughly 124 MB instead of 308 MB.
#
# Re-running updates an existing clone in place.
set -euo pipefail

REPO="https://github.com/nexu-io/open-design.git"
CONTENT_DIRS=(skills design-systems design-templates prompt-templates)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$HOME/.claude/open-design-guide.local.md"

TARGET="${1:-${OPEN_DESIGN_HOME:-$HOME/open-design-library}}"

die() { echo "error: $*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required"
PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then PYTHON="$candidate"; break; fi
done
[ -n "$PYTHON" ] || die "python3 is required (used only to build the catalogue)"

# git 2.25+ ships sparse-checkout; blob filtering needs a server that allows it
git sparse-checkout --help >/dev/null 2>&1 || die "your git is too old for sparse-checkout (need 2.25+)"

if [ -d "$TARGET/.git" ]; then
  echo "updating existing library at $TARGET"
  git -C "$TARGET" pull --ff-only
else
  [ -e "$TARGET" ] && die "$TARGET exists and is not a git clone; pick another path"
  echo "cloning content only into $TARGET"
  mkdir -p "$(dirname "$TARGET")"
  # Some files in this repo sit ~200 characters deep. On Windows that blows past
  # the 260-character MAX_PATH and the checkout fails halfway. Set per-clone, so
  # the user's global git config is left alone.
  git clone -c core.longpaths=true \
    --filter=blob:none --sparse --depth 1 "$REPO" "$TARGET"
fi

git -C "$TARGET" config core.longpaths true
git -C "$TARGET" sparse-checkout set "${CONTENT_DIRS[@]}"

# CATALOGUE.md is generated, so keep it out of the clone's git status forever
EXCLUDE="$TARGET/.git/info/exclude"
mkdir -p "$(dirname "$EXCLUDE")"
grep -qxF "CATALOGUE.md" "$EXCLUDE" 2>/dev/null || echo "CATALOGUE.md" >> "$EXCLUDE"

"$PYTHON" "$SCRIPT_DIR/build-catalogue.py" "$TARGET"

# Record the path so the skill can find the library on any machine.
# `pwd -W` gives the native path under Git Bash, where a /c/... path is
# meaningless to anything outside the MSYS shell. It fails elsewhere, and
# plain pwd is already correct there.
ABS_TARGET="$(cd "$TARGET" && { pwd -W 2>/dev/null || pwd; })"
mkdir -p "$(dirname "$CONFIG")"
cat > "$CONFIG" <<EOF
---
library: $ABS_TARGET
catalogue: $ABS_TARGET/CATALOGUE.md
source: $REPO
---

Written by \`open-design-guide/scripts/install.sh\`. Rerun that script to update
the library and rebuild the catalogue. Delete this file to unlink the library.
EOF

echo
echo "library:   $ABS_TARGET"
echo "catalogue: $ABS_TARGET/CATALOGUE.md"
echo "config:    $CONFIG"
echo "done. the open-design-guide skill will pick it up from here."
