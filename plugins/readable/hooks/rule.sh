#!/bin/sh
# SessionStart: emit the card rule, plus the project's brand line when a
# .readable/ layer exists. The hook runs with the project cwd (unlike the
# ccd-spawned card server, which gets neither cwd nor roots), so THIS is the
# one reliable place to tell the model where the brand lives.
HERE="$(dirname "$0")"
cat "$HERE/rule.md"
ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -f "$ROOT/.readable/brand.css" ]; then
  printf '\n<project-brand>This project has a readable brand layer. On EVERY `card` tool call, also pass `brand: "%s/.readable"` alongside `html`/`htmlFile` — the card then renders in the project palette. The /report skill and its build.py pick the same dir up automatically; never inline the brand css yourself.</project-brand>\n' "$ROOT"
fi
