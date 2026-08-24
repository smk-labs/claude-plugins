#!/bin/sh
# SessionStart: housekeeping, then the delivery rule.
#
# This hook runs with the project cwd (unlike the card server, which is spawned
# with neither cwd nor roots), so it is the one reliable place to tell the model
# where this project's brand lives and where the widget kit sits on disk.
HERE="$(dirname "$0")"
ROOT="$(cd "$HERE/.." && pwd)"

sh "$ROOT/hooks/reap.sh" 2>/dev/null
# Plug and play: register the card server the first time, everywhere, then
# never touch a config again. Obeys a previous disconnect. Never fails a session.
sh "$ROOT/hooks/connect.sh" auto 2>/dev/null || true

cat "$HERE/rule.md"

# The kit is a PATH, not an injection. Tier 2 needs 10KB of skeleton and most
# sessions never reach tier 2, so pointing at the file costs one line and the
# model pays for the rest only when it actually renders a widget.
printf '\n<readable-kit>Tier 2 widget kit: %s/hooks/kit.md (its component CSS loads from a CDN; if the card paints unstyled, use %s/hooks/kit-inline.md instead, which needs no network). Read one of these ONLY when you are actually in tier 2.</readable-kit>\n' "$ROOT" "$ROOT"

PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -f "$PROJ/.readable/brand.css" ]; then
  printf '\n<project-brand>This project has a readable brand layer. On EVERY `card` tool call, also pass `brand: "%s/.readable"` alongside `html`/`htmlFile` — the card then renders in the project palette. The /report skill and its build.py pick the same dir up automatically; never inline the brand css yourself.</project-brand>\n' "$PROJ"
fi
