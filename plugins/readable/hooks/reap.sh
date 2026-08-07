#!/bin/sh
# SessionStart housekeeping: delete .in_use locks whose process is gone.
#
# Claude Code drops one file per process id into <plugin-version>/.in_use to say
# "a session still needs this version", and nothing ever removes them. They
# accumulate one per session forever: 26 had piled up in readable's dir on the
# machine this was written on, all but a few from processes that had long exited.
#
# Scope is readable's OWN dir and nothing else. A plugin cleans up after itself;
# reaching into a sibling plugin's cache would be a surprise, not a service.
#
# Usage: reap.sh [dir]   (default: the .in_use beside this plugin's root)
DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/.in_use}"
[ -d "$DIR" ] || exit 0

# The live-pid list is built ONCE, and nothing is deleted unless it came back
# non-empty. A half-built list reads as "every pid is dead" and would take the
# running session's own lock with it, the one file that must survive, because
# without it Claude Code may garbage-collect the plugin version mid-session.
# //NH //FO: doubled so MSYS leaves the flags alone instead of expanding /NH
# into a Windows path.
if command -v tasklist >/dev/null 2>&1; then
  LIVE=$(tasklist //NH //FO CSV 2>/dev/null | sed -n 's/^"[^"]*","\([0-9][0-9]*\)".*/\1/p')
else
  LIVE=$(ps -A -o pid= 2>/dev/null | tr -d ' ')
fi
[ -n "$LIVE" ] || exit 0

for f in "$DIR"/*; do
  [ -f "$f" ] || continue
  # <pid> and the <pid>.tmp.<hex> stragglers of an interrupted atomic write.
  pid=$(basename "$f" | sed -n 's/^\([0-9][0-9]*\).*/\1/p')
  [ -n "$pid" ] || continue
  printf '%s\n' "$LIVE" | grep -qx "$pid" || rm -f "$f"
done

# Silent on purpose: this runs every session, and a SessionStart hook's stdout
# is spent context. The regression test is what proves it ran.
exit 0
