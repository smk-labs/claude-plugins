#!/bin/sh
# readable connect | disconnect | status
#
# The ONE place that touches a Claude desktop config, and only when a human
# asks. Before 6.0.0 a SessionStart hook did this silently, knew a single
# profile path, and left a backup file behind every time; see refresh.sh for
# what that cost. The card server is opt-in now, and opting in covers every
# profile on the machine at once, because a per-profile install is exactly how
# one machine ends up with three different answers.
#
#   connect     copy the server to the version-free stable path, then register
#               it in every Claude profile found here
#   disconnect  remove the entry from every profile, then delete the stable dir
#   status      per profile: registered or not, and whether the path resolves
#
# Usage: sh hooks/connect.sh [connect|disconnect|status]
set -e
ACTION="${1:-status}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STABLE="$HOME/.claude/plugins/data/readable/server"

NODE="$(command -v node || command -v node.exe || true)"
if [ -z "$NODE" ]; then
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
  echo "readable: no Claude desktop profile found on this machine; nothing to $ACTION."
  exit 0
fi

case "$ACTION" in
  connect)
    mkdir -p "$STABLE"
    for f in server/server.js assets/rc.css assets/menu.js assets/email.js; do
      cp "$ROOT/$f" "$STABLE/$(basename "$f")"
    done
    ;;
  disconnect|status) ;;
  *) echo "readable: unknown action '$ACTION' (connect | disconnect | status)"; exit 2 ;;
esac

ACTION="$ACTION" PROFILES="$PROFILES" NODE="$NODE" SRV="$STABLE/server.js" "$NODE" -e '
const fs = require("fs");
const path = require("path");
const { ACTION, PROFILES, NODE, SRV } = process.env;
const dirs = PROFILES.split("\n").filter(Boolean);
let changed = 0;

for (const dir of dirs) {
  const cfg = path.join(dir, "claude_desktop_config.json");
  const label = dir.replace(process.env.HOME, "~");
  let d = {};
  if (fs.existsSync(cfg)) {
    try { d = JSON.parse(fs.readFileSync(cfg, "utf8")); }
    catch (e) { console.log("  !! " + label + ": config is not valid JSON, left untouched"); continue; }
  } else if (ACTION !== "connect") {
    console.log("  -- " + label + ": no desktop config");
    continue;
  }
  const ms = d.mcpServers || (d.mcpServers = {});
  const cur = ms["readable-card"];

  if (ACTION === "status") {
    if (!cur) console.log("  -- " + label + ": not registered");
    else {
      const p = cur.args && cur.args[0];
      console.log("  " + (p && fs.existsSync(p) ? "ok" : "!!") + " " + label + ": " + p +
        (p && fs.existsSync(p) ? "" : "  <-- path does not exist"));
    }
    continue;
  }

  if (ACTION === "disconnect") {
    if (cur) { delete ms["readable-card"]; changed++; console.log("  removed from " + label); }
    else console.log("  -- " + label + ": nothing to remove");
  } else {
    // A hand-made dev override pointing at a real file is left alone: someone
    // set it deliberately and knows where it points.
    const p = cur && cur.args && cur.args[0];
    if (p && fs.existsSync(p) && p !== SRV) { console.log("  -- " + label + ": kept your override -> " + p); continue; }
    ms["readable-card"] = { command: NODE, args: [SRV], env: {} };
    changed++;
    console.log("  registered in " + label);
  }
  fs.writeFileSync(cfg, JSON.stringify(d, null, 2) + "\n");
}

if (ACTION !== "status") {
  console.log(changed === 0
    ? "readable: nothing to change."
    : "readable: " + changed + " profile(s) updated. Quit and reopen the Claude app once for it to take effect (a running window keeps its old server list).");
}
'

# disconnect removes the copy last, so a failed config edit never leaves a
# registered entry pointing at a deleted file.
if [ "$ACTION" = "disconnect" ] && [ -d "$STABLE" ]; then
  rm -rf "$STABLE"
  echo "readable: removed the stable copy at $STABLE"
fi
