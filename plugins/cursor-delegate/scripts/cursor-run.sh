#!/bin/bash
# cursor-run.sh: delegate one self-contained task to a Cursor account via the
# `cursor-agent` CLI, and print its result. This is the single primitive that
# the cursor-delegate skill, the cursor-worker subagent, and the optional
# cursor-mcp server all shell out to, so the "how do we actually invoke Cursor"
# logic lives in exactly one place.
#
# QUICK TASKS ONLY (under ~4 minutes of agent work): flaky networks/VPNs kill
# any single stream older than ~5 minutes. Anything longer goes through
# legged-run.sh (same directory), which chains short legs of THIS script on one
# resumed session and survives connection drops.
#
# Why this exists: a company often has idle Cursor seats. Claude Code can put
# them to work as delegated agents ("agent calling") without leaving Claude:
# Claude stays the orchestrator (it holds the context, the plan, CLAUDE.md), and
# hands heavy, self-contained slices to cursor-agent, which runs on the Cursor
# subscription's quota instead of Claude's.
#
# Auth, in order of precedence for --account <label>:
#   1. A stable Cursor API key from ~/.claude-deck/cursor/agent-keys.json
#      ({ "label": "key_...", ... }, chmod 600).
#   2. A login slot: a browser login made with
#        HOME="$HOME/CursorProfiles/<label>/cli-home" cursor-agent login
#      cursor-agent keeps its credential in $HOME/.cursor/cli-config.json (a
#      verified fact: CURSOR_CONFIG_DIR does NOT move it, HOME does), so giving
#      each account its own tiny HOME folder gives each its own login.
# With no --account: the keys file's "default" entry decides (its value is
# either another label in the file or a raw key) — this is THE normal path, it
# never depends on a browser login. Only if the keys file has no default:
# CURSOR_API_KEY from the environment, then the machine's ambient
# `cursor-agent login` as the very last resort.
#
# Termination: cursor-agent sometimes never exits after its work is done (the
# stream just stays open). So this script does not exec it raw: a tiny node
# supervisor pipes the output through, and in --json mode kills the process
# ~1.5s after the final result object appears, plus a hard --timeout cap
# (default 900s, 0 = off) for runs that hang BEFORE producing a result. A run
# that printed its result always exits 0, even if the process had to be shot.
#
# macOS Bash 3.2 compatible. No associative arrays, no GNU-only flags. The one
# non-builtin used for JSON is `node`, which claude-deck already depends on.
set -euo pipefail

ACCOUNT=""
MODEL=""
FORMAT="text"
CWD=""
DRYRUN="${CURSOR_RUN_DRYRUN:-}"
TIMEOUT="${CURSOR_RUN_TIMEOUT:-900}"   # hard cap in seconds; 0 disables
TASK=""
EXTRA=()            # everything after `--` goes to cursor-agent verbatim
KEYS_FILE="${CURSOR_DECK_KEYS_FILE:-$HOME/.claude-deck/cursor/agent-keys.json}"

usage() {
  cat >&2 <<'EOF'
Usage: cursor-run.sh [options] "task text"
       echo "task text" | cursor-run.sh [options]

Options:
  --account LABEL   Resolve CURSOR_API_KEY for LABEL from agent-keys.json
  --model MODEL     Model for cursor-agent (e.g. sonnet-4.5, auto). Omit = Cursor default.
  --json            Ask cursor-agent for --output-format json (default: text)
  --cwd DIR         Run in DIR (default: current directory)
  --timeout SECS    Hard kill a run that hangs (default: 900; 0 = no cap)
  --dry-run         Print the exact command (API key redacted) and exit
  -p, --print       Accepted for symmetry; print/headless mode is always on
  -- ARGS...        Pass ARGS straight through to cursor-agent

Auth: --account LABEL first looks up the key file
(~/.claude-deck/cursor/agent-keys.json), then a login slot at
~/CursorProfiles/LABEL/cli-home (created via: HOME=<that dir> cursor-agent login).
No --account: the key file's "default" entry (a label or a raw key) — the
normal path; else CURSOR_API_KEY if set, else the machine's ambient
cursor-agent login as last resort. Note: Cursor "Auto" model usage is unlimited
on paid plans, while named models draw down the plan's monthly usage pool.

Termination: in --json mode the run is killed ~1.5s after the final result
object appears (cursor-agent sometimes never exits on its own); a result seen
means exit 0. --timeout caps runs that hang before any result.
EOF
}

die() { echo "cursor-run: $1" >&2; exit "${2:-1}"; }

# --- parse args ---
while [ $# -gt 0 ]; do
  case "$1" in
    --account) ACCOUNT="${2:-}"; shift 2 ;;
    --account=*) ACCOUNT="${1#*=}"; shift ;;
    --model) MODEL="${2:-}"; shift 2 ;;
    --model=*) MODEL="${1#*=}"; shift ;;
    --json) FORMAT="json"; shift ;;
    --cwd) CWD="${2:-}"; shift 2 ;;
    --cwd=*) CWD="${1#*=}"; shift ;;
    --timeout) TIMEOUT="${2:-}"; shift 2 ;;
    --timeout=*) TIMEOUT="${1#*=}"; shift ;;
    --dry-run) DRYRUN=1; shift ;;
    -p|--print) shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; while [ $# -gt 0 ]; do EXTRA+=("$1"); shift; done ;;
    -*) die "unknown option: $1 (use -- to pass flags to cursor-agent)" ;;
    *) if [ -z "$TASK" ]; then TASK="$1"; else TASK="$TASK $1"; fi; shift ;;
  esac
done

# Task text can also arrive on stdin (handy for long prompts / piping).
if [ -z "$TASK" ] && [ ! -t 0 ]; then
  TASK="$(cat)"
fi
[ -n "$TASK" ] || { usage; die "no task text given"; }

# --- resolve auth: API key, else login slot, else ambient login ---
# key_for LABEL: print LABEL's key from the keys file. "default" is special:
# its value may name another label (alias) or hold a raw key directly.
key_for() {
  [ -f "$KEYS_FILE" ] || return 0
  node -e '
    const fs = require("fs");
    const [file, label] = process.argv.slice(1);
    try {
      const d = JSON.parse(fs.readFileSync(file, "utf8"));
      const map = d && d.accounts && typeof d.accounts === "object" ? d.accounts : d;
      const raw = (v) => typeof v === "string" ? v : (v && typeof v.apiKey === "string" ? v.apiKey : "");
      let v = raw(map && map[label]);
      if (v && map && map[v] !== undefined && label === "default") v = raw(map[v]); // alias
      process.stdout.write(v || "");
    } catch (e) {}
  ' "$KEYS_FILE" "$1"
}

API_KEY=""
SLOT_HOME=""
AUTH_DESC=""
SLOTS_ROOT="${CURSOR_DECK_SLOTS_DIR:-$HOME/CursorProfiles}"
if [ -n "$ACCOUNT" ]; then
  API_KEY="$(key_for "$ACCOUNT")"
  if [ -n "$API_KEY" ]; then
    AUTH_DESC="API key for account '$ACCOUNT'"
  else
    SLOT_HOME="$SLOTS_ROOT/$ACCOUNT/cli-home"
    [ -f "$SLOT_HOME/.cursor/cli-config.json" ] || die "account '$ACCOUNT': no API key in $KEYS_FILE and no login slot at $SLOT_HOME. Create one with: HOME=\"$SLOT_HOME\" cursor-agent login"
    AUTH_DESC="login slot $SLOT_HOME"
  fi
else
  # No account named. The keys file's "default" entry is the normal path: it
  # makes auth deterministic (no dependence on a browser login that may be
  # absent or expired). Env var and ambient login are fallbacks only.
  API_KEY="$(key_for default)"
  if [ -n "$API_KEY" ]; then
    AUTH_DESC="API key (keys-file default)"
  elif [ -n "${CURSOR_API_KEY:-}" ]; then
    API_KEY="$CURSOR_API_KEY"
    AUTH_DESC="API key (CURSOR_API_KEY env)"
  else
    AUTH_DESC="ambient cursor-agent login (last resort)"
  fi
fi

# --- build the cursor-agent command ---
# --trust is always passed: headless (-p) runs cannot answer the interactive
# "trust this directory?" prompt, they just die on it, and whoever invoked this
# wrapper already chose the working directory deliberately.
# --force and --approve-mcps are always passed too: workers are trusted exactly
# like Claude Code subagents (full file/shell/MCP access, deploy-with-keys
# included), so no run should ever stall on an approval it cannot answer. The
# machine-level switch is approvalMode:"unrestricted" in ~/.cursor/cli-config.json;
# these flags keep headless runs autonomous even where that config is absent.
CMD=(cursor-agent -p --trust --force --approve-mcps --output-format "$FORMAT")
[ -n "$MODEL" ] && CMD+=(--model "$MODEL")
CMD+=("$TASK")
[ ${#EXTRA[@]} -gt 0 ] && CMD+=("${EXTRA[@]}")

if [ -n "$DRYRUN" ]; then
  # Redact the key; show exactly what would run, where, and as whom.
  echo "cursor-run (dry run)"
  echo "  cwd:     ${CWD:-$(pwd)}"
  echo "  account: ${ACCOUNT:-<default>}"
  echo "  timeout: ${TIMEOUT}s"
  if [ -n "$API_KEY" ]; then
    echo "  auth:    $AUTH_DESC ${API_KEY:0:4}***(${#API_KEY} chars)"
    ENV_PREFIX='CURSOR_API_KEY=***'
  elif [ -n "$SLOT_HOME" ]; then
    echo "  auth:    $AUTH_DESC"
    ENV_PREFIX="HOME=$SLOT_HOME"
  else
    echo "  auth:    $AUTH_DESC"
    ENV_PREFIX=''
  fi
  printf '  cmd:     %s ' "$ENV_PREFIX"
  # Print the argv safely quoted so it is copy-pasteable.
  for a in "${CMD[@]}"; do
    case "$a" in *[!A-Za-z0-9_./-]*) printf "'%s' " "$(printf '%s' "$a" | sed "s/'/'\\\\''/g")" ;; *) printf '%s ' "$a" ;; esac
  done
  echo
  exit 0
fi

# Global rules bridge: cursor-agent applies ~/AGENTS.md from its parent-dir
# walk as an always-on rule (verified live, git repos included) but never reads
# ~/.claude/CLAUDE.md, ~/.cursor/rules, or ~/.cursor/AGENTS.md. One symlink
# makes the manual and the rule the same file, so every worker inherits the
# user's global operating manual with zero drift. Recreate it if missing.
if [ ! -e "$HOME/AGENTS.md" ] && [ ! -L "$HOME/AGENTS.md" ] && [ -f "$HOME/.claude/CLAUDE.md" ]; then
  ln -s "$HOME/.claude/CLAUDE.md" "$HOME/AGENTS.md" 2>/dev/null || true
fi

CURSOR_AGENT_BIN="$(command -v cursor-agent || true)"
[ -n "$CURSOR_AGENT_BIN" ] || die "cursor-agent not found on PATH. Install it: curl https://cursor.com/install -fsS | bash  (then restart your shell)"

echo "cursor-run: auth = $AUTH_DESC" >&2

[ -n "$CWD" ] && cd "$CWD"
CMD[0]="$CURSOR_AGENT_BIN"
[ -n "$API_KEY" ] && export CURSOR_API_KEY="$API_KEY"
[ -n "$SLOT_HOME" ] && export HOME="$SLOT_HOME"

# Supervise instead of exec: cursor-agent sometimes never exits after printing
# its result, which used to leave delegations hanging open forever. The node
# supervisor pipes output through and (a) in json mode kills the child ~1.5s
# after the final result object, treating the run as a success (exit 0), and
# (b) hard-kills anything still running at --timeout. Signals are forwarded so
# killing this wrapper kills cursor-agent too.
exec node -e '
  const { spawn } = require("child_process");
  const format = process.argv[1];
  const timeoutS = Number(process.argv[2]) || 0;
  const cmd = process.argv.slice(3);
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ["ignore", "pipe", "inherit"] });
  let buf = "", sawResult = false, killTimer = null, hardTimer = null;
  function shoot() {
    try { child.kill("SIGTERM"); } catch (e) {}
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch (e) {} }, 3000);
    if (t.unref) t.unref();
  }
  child.stdout.on("data", (d) => {
    process.stdout.write(d);
    if (format !== "json" || sawResult) return;
    buf += d.toString();
    if (buf.length > 8 * 1024 * 1024) buf = buf.slice(-8 * 1024 * 1024);
    // The result is the last JSON object printed; check the tail lines only.
    const lines = buf.trim().split("\n");
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 3; i--) {
      const t = lines[i].trim();
      if (!t || t[0] !== "{") continue;
      try {
        const o = JSON.parse(t);
        if (o && (o.type === "result" || o.result !== undefined)) { sawResult = true; break; }
      } catch (e) { /* partial line still streaming */ }
    }
    if (sawResult) killTimer = setTimeout(shoot, 1500);
  });
  if (timeoutS > 0) hardTimer = setTimeout(shoot, timeoutS * 1000);
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, shoot);
  child.on("error", (e) => { process.stderr.write("cursor-run: spawn failed: " + e.message + "\n"); process.exit(127); });
  child.on("exit", (code) => {
    if (killTimer) clearTimeout(killTimer);
    if (hardTimer) clearTimeout(hardTimer);
    // A run that produced its result is a success even if the process had to
    // be shot or died on a late stream error.
    process.exit(sawResult ? 0 : (code === null ? 1 : code));
  });
' "$FORMAT" "$TIMEOUT" "${CMD[@]}"
