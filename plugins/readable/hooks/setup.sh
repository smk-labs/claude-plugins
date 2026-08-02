#!/bin/sh
# SessionStart: register the card server ONCE, directly in the Claude desktop
# config. The plugin deliberately bundles no plugin-scoped MCP (that variant
# cannot render MCP Apps widgets); the desktop-registered server is the single
# source of truth on every machine. Idempotent: healthy config entries are
# never touched, so a dev override pointing at a checkout survives.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Stable copy: the config must never point into the plugin cache (its path
# embeds the version and dies on every update). server.js resolves rc.css and
# menu.js from its own dir (bundled layout), so one flat dir is enough.
STABLE="$HOME/.claude/plugins/data/readable/server"
mkdir -p "$STABLE" || exit 0
for f in server/server.js assets/rc.css assets/menu.js; do
  b="$(basename "$f")"
  cmp -s "$ROOT/$f" "$STABLE/$b" 2>/dev/null || cp "$ROOT/$f" "$STABLE/$b"
done

case "$(uname -s)" in
  Darwin) CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json" ;;
  MINGW*|MSYS*|CYGWIN*) CFG="$APPDATA/Claude/claude_desktop_config.json" ;;
  *) CFG="${XDG_CONFIG_HOME:-$HOME/.config}/Claude/claude_desktop_config.json" ;;
esac
# No desktop app on this machine (e.g. terminal-only CLI): nothing to register;
# the rule's no-tool fallback covers these sessions.
[ -d "$(dirname "$CFG")" ] || exit 0

NODE="$(command -v node || command -v node.exe)"
if [ -z "$NODE" ]; then
  echo '<readable-setup>The card server needs Node.js and none was found on PATH. Cards fall back to plain text until Node is installed.</readable-setup>'
  exit 0
fi

CFG="$CFG" NODE="$NODE" SRV="$STABLE/server.js" "$NODE" -e '
const fs = require("fs");
const { CFG, NODE, SRV } = process.env;
let cfg = {};
if (fs.existsSync(CFG)) {
  try { cfg = JSON.parse(fs.readFileSync(CFG, "utf8")); }
  catch (e) {
    console.log("<readable-setup>Could not parse the Claude desktop config; left it untouched. Fix the JSON, then restart.</readable-setup>");
    process.exit(0);
  }
}
cfg.mcpServers = cfg.mcpServers || {};
const cur = cfg.mcpServers["readable-card"];
// A working entry (including a manual dev override) is never rewritten.
if (cur && cur.args && cur.args[0] && fs.existsSync(cur.args[0])) process.exit(0);
cfg.mcpServers["readable-card"] = { command: NODE, args: [SRV], env: {} };
if (fs.existsSync(CFG)) fs.copyFileSync(CFG, CFG + ".readable-bak");
fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2) + "\n");
console.log("<readable-setup>Card server registered in the Claude desktop config (a .readable-bak backup sits next to it). Restart the app once to activate widget cards.</readable-setup>");
'
