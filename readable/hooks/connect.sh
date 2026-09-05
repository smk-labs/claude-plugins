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
# The data dir follows the install, it is not $HOME/.claude by decree. A
# relocated install sets CLAUDE_CONFIG_DIR and everything else of Claude's lives
# under it; hardcoding $HOME/.claude there scatters a second, stray tree beside
# the one the user deliberately moved, and the stable server path written into
# the config then names a dir that install has no other reason to hold.
DATA="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/data/readable"
STABLE="$DATA/server"
MARK="$DATA/.disconnected"
LOG="$DATA/connect.log"

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

# Where the profiles are. ASKED first, guessed second.
#
# A dir counts as a profile when it holds either config file; a profile with no
# claude_desktop_config.json yet gets one written on connect.
#
# running_profile is the one that cannot be missed, because it does not guess:
# Claude Code Desktop bundles its CLI at <profile>/claude-code/<version>/claude
# and puts that path in CLAUDE_CODE_EXECPATH, so the profile of the app hosting
# THIS session is three levels up. Everything below it is still a guess.
#
# The guess list has now failed three times for the same reason. 6.1.0 covered
# five profile shapes on the machine it was written on and missed three, because
# a relay setup keeps its data in ~/.claude-<name>/desktop. 6.7.x then missed a
# desktop install relocated wholesale (profile under ~/desktop-trial/profile,
# XDG_CONFIG_HOME moved with it), so the only glob that could still have matched
# pointed at an empty dir and the hook registered nothing, silently, every
# session. A list of known shapes can only find profiles someone thought of; the
# running app knows where it lives. Ask it.
#
# 6.11.1 is that same relocated install again, because 6.8.0 asked only ONE
# thing. CLAUDE_CODE_EXECPATH is set inside a Bash tool and not in the
# SessionStart hook's own environment, so the route added to fix this shape was
# never running when it mattered, and the shape stayed broken for three more
# releases while its test passed. There are now three routes, and each one is a
# thing the environment states rather than a name to guess: the running CLI, the
# config dir, and the globs. Two of them can be absent and the profile is still
# found. When a shape turns up that none of the three reaches, prefer a fourth
# fact over a wider glob — and when auto still finds nothing, it now says so in
# $DATA/connect.log rather than exiting 0 in silence.
running_profile() {
  # Only the bundled-CLI layout, so a plain `claude` on PATH cannot resolve to
  # some unrelated dir three levels up.
  case "${CLAUDE_CODE_EXECPATH:-}" in
    */claude-code/*/*) ;;
    *) return 0 ;;
  esac
  (cd "$(dirname "$CLAUDE_CODE_EXECPATH")/../.." 2>/dev/null && pwd)
}

# 6.8.0 asked the running app where it lives and stopped there, so the answer was
# only ever as good as CLAUDE_CODE_EXECPATH — which a Bash tool has and the
# SessionStart hook, on the very install this was written for, does not. The
# second thing that knows the install tree is CLAUDE_CONFIG_DIR, which a
# relocated install sets and a default one does not. It names a sibling of the
# profile (here .../desktop-trial/claude-config beside .../desktop-trial/profile),
# so the tree is one dirname away and needs no name to be guessed.
config_dir_profiles() {
  [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ -d "${CLAUDE_CONFIG_DIR:-}" ] || return 0
  base="$(cd "$CLAUDE_CONFIG_DIR" && pwd)" || return 0
  parent="$(dirname "$base")"
  printf '%s\n' "$parent"
  for d in "$parent"/*; do
    [ -d "$d" ] && printf '%s\n' "$d"
  done
}

# The bundled CLI at <profile>/claude-code/<version>/claude marks a profile as
# surely as either config file does, and it is what separates the real profile
# from the decoy: on a relocated install $XDG_CONFIG_HOME/Claude can exist and be
# EMPTY, so the config-file test alone rejected the one dir a glob still reached
# and the hook found nothing at all.
bundled_cli() {
  for c in "$1"/claude-code/*/claude; do
    [ -f "$c" ] && return 0
  done
  return 1
}

is_profile() {
  [ -f "$1/claude_desktop_config.json" ] || [ -f "$1/config.json" ] || bundled_cli "$1"
}

# The named-dir routes may take config.json as proof because the name already
# said Claude. The config-dir scan has no name to go on — it walks whatever
# happens to sit beside the install — so it wants a marker that cannot belong to
# anything else: a file called claude_desktop_config.json, or the bundled CLI.
# A bare config.json is far too common a filename to nominate a stranger's dir.
is_profile_named() {
  [ -f "$1/claude_desktop_config.json" ] || bundled_cli "$1"
}

list_profiles() {
  {
    running_profile
    for d in \
      "$HOME/Library/Application Support/Claude" \
      "$HOME/Library/Application Support/Claude-"* \
      "$HOME/Library/Application Support/Claude Profiles/"* \
      "$HOME/claude-"* \
      "$HOME/.claude-"*/desktop \
      "$HOME/Library/Application Support/Claude Profiles/"*/desktop \
      "$APPDATA/Claude" \
      "${XDG_CONFIG_HOME:-$HOME/.config}/Claude"
    do
      printf '%s\n' "$d"
    done
  } | while IFS= read -r d; do
    [ -n "$d" ] && [ -d "$d" ] || continue
    is_profile "$d" && printf '%s\n' "$d"
  done
  config_dir_profiles | while IFS= read -r d; do
    [ -n "$d" ] && [ -d "$d" ] || continue
    is_profile_named "$d" && printf '%s\n' "$d"
  done
}

PROFILES="$(list_profiles)"
if [ -z "$PROFILES" ]; then
  # Usually this is a terminal-only CLI with no desktop app: nothing to
  # register, and the rule's tier 3 covers those sessions. But it is also
  # exactly what a profile the routes above cannot see looks like, and for two
  # releases running that case exited 0 without a word — the user saw no cards,
  # and there was nothing anywhere to diagnose from. So `auto` still says
  # nothing to the session, and writes one line here instead. This file is the
  # first thing to read when cards never appear.
  if [ "$AUTO" = 1 ]; then
    if mkdir -p "$DATA" 2>/dev/null; then
      printf '%s no profile found  HOME=%s CLAUDE_CONFIG_DIR=%s XDG_CONFIG_HOME=%s CLAUDE_CODE_EXECPATH=%s\n' \
        "$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo '?')" \
        "$HOME" "${CLAUDE_CONFIG_DIR:-unset}" "${XDG_CONFIG_HOME:-unset}" "${CLAUDE_CODE_EXECPATH:-unset}" \
        >> "$LOG" 2>/dev/null
      # Bounded: one line per session on a machine that will never have a
      # profile is a file that grows forever otherwise.
      if [ -f "$LOG" ]; then
        tail -n 50 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" 2>/dev/null || rm -f "$LOG.tmp"
      fi
    fi
    exit 0
  fi
  echo "readable: no Claude desktop profile found on this machine; nothing to $ACTION."
  echo "readable: every session that found none is logged at $LOG"
  exit 0
fi

if [ "$ACTION" = connect ]; then
  # The stable dir is FLAT: every server module and every asset lands as a
  # sibling, and paths.js resolves them from the server's own dir. The set is a
  # GLOB, not a list: the list was four names typed out here, so the module graph
  # really lived in this shell loop, and splitting server.js into modules broke a
  # desktop install on a require the moment one name was missed. Two globs cannot
  # miss one. Nothing here is optional either — assets/email.js is require()d at
  # module load, so a stable dir missing a file does not degrade, it refuses to
  # start. test.js boots this exact dir, so a gap fails there and not on
  # someone's machine.
  # cmp before cp so a steady-state session writes nothing at all: this is also
  # what makes an update land, since the config keeps naming a version-free path
  # while the files under it move forward.
  mkdir -p "$STABLE" || exit 0
  for f in "$ROOT"/server/*.js "$ROOT"/assets/*; do
    [ -f "$f" ] || continue
    b="$(basename "$f")"
    # test.js is the suite, not a runtime dependency, and it spawns servers.
    [ "$b" = test.js ] && continue
    cmp -s "$f" "$STABLE/$b" 2>/dev/null || cp "$f" "$STABLE/$b" 2>/dev/null
  done
  # The one file copied under a different name, and the one exception to the
  # glob. paths.js reads the build version off ../.claude-plugin/plugin.json or
  # ./manifest.json, and the flat dir has neither, so the desktop server's first
  # log line read `build unknown` — the line whose entire job is to say which
  # build the host loaded. It is a diagnostic and not a dependency: if this copy
  # is ever missing the server still boots and only the banner degrades.
  cmp -s "$ROOT/.claude-plugin/plugin.json" "$STABLE/manifest.json" 2>/dev/null ||
    cp "$ROOT/.claude-plugin/plugin.json" "$STABLE/manifest.json" 2>/dev/null
  rm -f "$MARK"
fi

ACTION="$ACTION" AUTO="$AUTO" PROFILES="$PROFILES" NODE="$NODE" SRV="$STABLE/server.js" "$NODE" -e '
const fs = require("fs");
const path = require("path");
const { ACTION, AUTO, PROFILES, NODE, SRV } = process.env;
const auto = AUTO === "1";
// Deduped here rather than in the shell: the running profile can also match one
// of the globs, and registering the same dir twice would write it twice and, on
// the second pass, mistake its own fresh entry for a hand-made override.
const dirs = [...new Set(PROFILES.split("\n").filter(Boolean))];
const out = [];
let changed = 0;

for (const dir of dirs) {
  const cfg = path.join(dir, "claude_desktop_config.json");
  const label = dir.replace(process.env.HOME, "~");
  // A profile can opt itself out with a .readable-skip file, for every action.
  // The case this exists for: a managed (3p) deployment takes its local servers
  // from managedMcpServers in its own deployment config, which is the sanctioned
  // route there, and a user-added entry in claude_desktop_config.json is both
  // redundant and gated by an admin toggle. Without this marker the session hook
  // would keep restoring that redundant entry and the profile would carry two
  // registrations of the same server. The file may hold a one-line reason.
  const skipFile = path.join(dir, ".readable-skip");
  if (fs.existsSync(skipFile)) {
    if (!auto) {
      let why = "";
      try { why = fs.readFileSync(skipFile, "utf8").trim().split("\n")[0].slice(0, 90); } catch (e) {}
      out.push("  skip " + label + ": " + (why || ".readable-skip"));
    }
    continue;
  }
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
