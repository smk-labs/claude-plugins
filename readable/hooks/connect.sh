#!/bin/sh
# readable connect | disconnect | status | auto
#
# The ONE place that touches a Claude desktop config, and the only copy of the
# profile list and the copy list. `auto` runs from the SessionStart hook so the
# plugin works the moment it is installed; the other three are for a human.
#
#   auto        connect, but silent unless something changed, and a no-op once
#               the user has disconnected. This is the plug-and-play path.
#   connect     copy the server to the version-free stable path, register it in
#               every Claude profile found here, and clear the opt-out.
#   disconnect  remove the entry from every profile, delete the stable copy, and
#               leave an opt-out marker so `auto` never puts it back.
#   status      per profile: registered or not, and whether the path resolves
#
# Why the desktop config at all: only a server listed there renders MCP Apps
# widgets. The chat host does not load ~/.claude/plugins, so a plugin-scoped
# server is invisible to it. There is no third option.
#
# 5.x also wrote this file automatically and it went badly, so the four things
# that actually went wrong are each fixed here rather than the writing itself:
#
#   it knew ONE profile path       -> every profile found is registered, and a
#                                     profile added later is picked up next
#                                     session. This also removes the reason
#                                     people hand-copied configs between
#                                     profiles, which is how live API tokens
#                                     spread across four of them.
#   it wrote a .readable-bak every
#     time it wrote                -> at most one backup, and only the first
#                                     time a given config is touched.
#   it wrote in silence            -> the session that writes says so once, with
#                                     the undo, because the app must be
#                                     restarted before anything happens.
#   removing the entry did not
#     stick, the next session put
#     it straight back             -> disconnect leaves a marker and auto obeys
#                                     it, forever, until connect clears it.
#
# The fifth failure, a host with no renderer still being handed the card tool,
# is not a registration problem and is fixed in the server: it does not offer
# `card` to a client that did not negotiate MCP Apps. Registering everywhere is
# safe precisely because being registered no longer implies being able to paint.
ACTION="${1:-status}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$HOME/.claude/plugins/data/readable"
STABLE="$DATA/server"
MARK="$DATA/.disconnected"

AUTO=0
case "$ACTION" in
  auto) AUTO=1; ACTION=connect ;;
  connect|disconnect|status) ;;
  *) echo "readable: unknown action '$ACTION' (auto | connect | disconnect | status)"; exit 2 ;;
esac

# The opt-out is checked before anything else, so a disconnected machine costs
# one stat per session and nothing more.
[ "$AUTO" = 1 ] && [ -f "$MARK" ] && exit 0

NODE="$(command -v node || command -v node.exe || true)"
if [ -z "$NODE" ]; then
  [ "$AUTO" = 1 ] && exit 0
  echo "readable: no Node.js on PATH, so the card server cannot run. Install Node, then try again."
  exit 1
fi

# Every profile shape this app is known to use. A dir counts as a profile when
# it holds either config file; a profile with no claude_desktop_config.json yet
# gets one written on connect.
list_profiles() {
  for d in \
    "$HOME/Library/Application Support/Claude" \
    "$HOME/Library/Application Support/Claude-"* \
    "$HOME/Library/Application Support/Claude Profiles/"* \
    "$HOME/claude-"* \
    "$APPDATA/Claude" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/Claude"
  do
    [ -d "$d" ] || continue
    if [ -f "$d/config.json" ] || [ -f "$d/claude_desktop_config.json" ]; then
      printf '%s\n' "$d"
    fi
  done
}

PROFILES="$(list_profiles)"
if [ -z "$PROFILES" ]; then
  # No desktop app on this machine (terminal-only CLI): nothing to register, and
  # the rule's tier 3 covers those sessions.
  [ "$AUTO" = 1 ] && exit 0
  echo "readable: no Claude desktop profile found on this machine; nothing to $ACTION."
  exit 0
fi

if [ "$ACTION" = connect ]; then
  # The stable dir is FLAT: server.js resolves rc.css, menu.js and email.js from
  # its own dir. email.js is not optional; server.js require()s it at module
  # load, so a stable dir missing it does not degrade, it refuses to start.
  # test.js reads this list and boots the result, so a file added to the
  # server's requires and forgotten here fails there, not on someone's machine.
  # cmp before cp so a steady-state session writes nothing at all: this is also
  # what makes an update land, since the config keeps naming a version-free path
  # while the files under it move forward.
  mkdir -p "$STABLE" || exit 0
  for f in server/server.js assets/rc.css assets/menu.js assets/email.js; do
    b="$(basename "$f")"
    cmp -s "$ROOT/$f" "$STABLE/$b" 2>/dev/null || cp "$ROOT/$f" "$STABLE/$b" 2>/dev/null
  done
  rm -f "$MARK"
fi

ACTION="$ACTION" AUTO="$AUTO" PROFILES="$PROFILES" NODE="$NODE" SRV="$STABLE/server.js" "$NODE" -e '
const fs = require("fs");
const path = require("path");
const { ACTION, AUTO, PROFILES, NODE, SRV } = process.env;
const auto = AUTO === "1";
const dirs = PROFILES.split("\n").filter(Boolean);
const out = [];
let changed = 0;

for (const dir of dirs) {
  const cfg = path.join(dir, "claude_desktop_config.json");
  const label = dir.replace(process.env.HOME, "~");
  let d = {};
  if (fs.existsSync(cfg)) {
    try { d = JSON.parse(fs.readFileSync(cfg, "utf8")); }
    catch (e) { out.push("  !! " + label + ": config is not valid JSON, left untouched"); continue; }
  } else if (ACTION !== "connect") {
    out.push("  -- " + label + ": no desktop config");
    continue;
  }
  const ms = d.mcpServers || (d.mcpServers = {});
  const cur = ms["readable-card"];
  const curPath = cur && cur.args && cur.args[0];

  if (ACTION === "status") {
    if (!cur) out.push("  -- " + label + ": not registered");
    else out.push("  " + (curPath && fs.existsSync(curPath) ? "ok" : "!!") + " " + label + ": " + curPath +
      (curPath && fs.existsSync(curPath) ? "" : "  <-- path does not exist"));
    continue;
  }

  if (ACTION === "disconnect") {
    if (!cur) { out.push("  -- " + label + ": nothing to remove"); continue; }
    delete ms["readable-card"];
  } else {
    // Already pointing at the stable path: the steady state, and the reason
    // this hook can run every session without ever touching the file.
    if (curPath === SRV) continue;
    // A hand-made override pointing at a real file is left alone: someone set
    // it deliberately and knows where it points.
    if (curPath && fs.existsSync(curPath)) { if (!auto) out.push("  -- " + label + ": kept your override -> " + curPath); continue; }
    ms["readable-card"] = { command: NODE, args: [SRV], env: {} };
  }

  // One backup per config, ever. 5.x wrote one on every write, which is how a
  // config full of live tokens ended up duplicated beside itself.
  const bak = cfg + ".readable-bak";
  if (fs.existsSync(cfg) && !fs.existsSync(bak)) fs.copyFileSync(cfg, bak);
  fs.writeFileSync(cfg, JSON.stringify(d, null, 2) + "\n");
  changed++;
  out.push("  " + (ACTION === "connect" ? "registered in " : "removed from ") + label);
}

if (auto) {
  // Silent unless something actually changed. The one line it does print is
  // worth its context: without a restart the entry does nothing, so a user who
  // is not told will see no cards and have no idea why.
  if (changed) {
    console.log("<readable-setup>Registered the readable card server in " + changed +
      " Claude desktop profile(s) so chat replies render as cards. Tell the user to quit and reopen the Claude app once (the app, not just the window) for it to take effect, and that `/readable:connect disconnect` undoes it everywhere.</readable-setup>");
  }
} else {
  if (out.length) console.log(out.join("\n"));
  if (ACTION !== "status") {
    console.log(changed === 0
      ? "readable: nothing to change."
      : "readable: " + changed + " profile(s) updated. Quit and reopen the Claude app once for it to take effect (a running window keeps its old server list).");
  }
}
'

# disconnect removes the copy last, so a failed config edit never leaves a
# registered entry pointing at a deleted file, and leaves the marker so the
# SessionStart hook does not undo the user's decision on the next session.
if [ "$ACTION" = disconnect ]; then
  [ -d "$STABLE" ] && rm -rf "$STABLE" && echo "readable: removed the stable copy at $STABLE"
  mkdir -p "$DATA" && : > "$MARK"
  echo "readable: opted out; sessions will not re-register it. Run /readable:connect to turn it back on."
fi
exit 0
