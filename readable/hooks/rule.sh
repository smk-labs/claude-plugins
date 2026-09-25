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

# The kit is a PATH: tier 2 is a rare host and its skeleton is 10KB.
printf '<readable-kit>%s/hooks/kit.md, or %s/hooks/kit-inline.md if that paints unstyled.</readable-kit>\n' "$ROOT" "$ROOT"

# The voice is INJECTED, both languages (7.0.0). Naming the files cost every
# session a Read turn before its first reply, for 14KB of Persian of which the
# model needed the rules and not the essay. The core blocks are what is left:
# about 1.3K characters each, bullets only, so the generated-file notes stay out.
printf '<readable-voice lang="fa">\n'; grep '^- ' "$HERE/voice-fa.md"; printf '</readable-voice>\n'
printf '<readable-voice lang="en">\n'; grep '^- ' "$HERE/voice-en.md"; printf '</readable-voice>\n'

PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -f "$PROJ/.readable/brand.css" ]; then
  printf '<project-brand>Pass brand: "%s/.readable" on every card call.</project-brand>\n' "$PROJ"
fi
