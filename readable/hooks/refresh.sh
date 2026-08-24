#!/bin/sh
# SessionStart: keep an OPTED-IN stable copy in step with the installed
# version. Writes nothing otherwise, and never touches a Claude config.
#
# Until 6.0.0 this file was setup.sh, and it did two things every single
# session whether anyone had asked or not: copy the server into a stable dir,
# and write an mcpServers.readable-card entry into the desktop config. That is
# how readable spread. It knew exactly one config path, so the default profile
# got the entry and the others never did; the entry then travelled to other
# profiles inside hand-copied configs, secrets and all; and each write left a
# .readable-bak beside it. Meanwhile a host that cannot paint an MCP Apps
# widget still got the card tool, because registration and capability were
# never the same question.
#
# So the direction is inverted. The stable dir is created by ONE explicit
# command (hooks/connect.sh, the /readable:connect skill). No dir means nobody
# opted in, and this hook exits without writing a byte. A dir means someone did
# opt in, and this hook is what makes an update land: the config keeps pointing
# at the same version-free path while the files under it move forward.
STABLE="$HOME/.claude/plugins/data/readable/server"
[ -d "$STABLE" ] || exit 0

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# The stable dir is FLAT: server.js resolves rc.css, menu.js and email.js from
# its own dir. email.js is not optional; server.js require()s it at module load,
# so a stable dir missing it does not degrade, it refuses to start. test.js
# reads this list and boots the result, so a file added to the server's requires
# and forgotten here fails there and not on someone's machine.
for f in server/server.js assets/rc.css assets/menu.js assets/email.js; do
  b="$(basename "$f")"
  cmp -s "$ROOT/$f" "$STABLE/$b" 2>/dev/null || cp "$ROOT/$f" "$STABLE/$b" 2>/dev/null
done

# Silent on purpose: a SessionStart hook's stdout is spent context, and this
# one has nothing a model needs to know.
exit 0
