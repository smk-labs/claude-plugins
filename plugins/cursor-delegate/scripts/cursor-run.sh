#!/bin/bash
# cursor-run.sh: delegate one self-contained task to a Cursor account via the
# `cursor-agent` CLI, and print its result. This is the single primitive that
# the cursor-delegate skill, the cursor-worker subagent, and the optional
# cursor-mcp server all shell out to, so the "how do we actually invoke Cursor"
# logic lives in exactly one place.
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
# With no --account at all: CURSOR_API_KEY from the environment if set,
# otherwise the machine's ambient `cursor-agent login` (the base account).
#
# macOS Bash 3.2 compatible. No associative arrays, no GNU-only flags. The one
# non-builtin used for JSON is `node`, which claude-deck already depends on.
set -euo pipefail

ACCOUNT=""
MODEL=""
FORMAT="text"
CWD=""
DRYRUN="${CURSOR_RUN_DRYRUN:-}"
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
  --dry-run         Print the exact command (API key redacted) and exit
  -p, --print       Accepted for symmetry; print/headless mode is always on
  -- ARGS...        Pass ARGS straight through to cursor-agent

Auth: --account LABEL first looks up the key file, then a login slot at
~/CursorProfiles/LABEL/cli-home (created via: HOME=<that dir> cursor-agent login).
No --account: CURSOR_API_KEY if set, else the machine's ambient cursor-agent
login. Note: Cursor "Auto" model usage is unlimited on paid plans, while named
models (e.g. a Claude tier) draw down the plan's monthly usage pool.
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
API_KEY=""
SLOT_HOME=""
SLOTS_ROOT="${CURSOR_DECK_SLOTS_DIR:-$HOME/CursorProfiles}"
if [ -n "$ACCOUNT" ]; then
  if [ -f "$KEYS_FILE" ]; then
    API_KEY="$(
      node -e '
        const fs = require("fs");
        const [file, label] = process.argv.slice(1);
        try {
          const d = JSON.parse(fs.readFileSync(file, "utf8"));
          const map = d && d.accounts && typeof d.accounts === "object" ? d.accounts : d;
          const v = map && map[label];
          if (typeof v === "string") process.stdout.write(v);
          else if (v && typeof v.apiKey === "string") process.stdout.write(v.apiKey);
        } catch (e) {}
      ' "$KEYS_FILE" "$ACCOUNT"
    )"
  fi
  if [ -z "$API_KEY" ]; then
    SLOT_HOME="$SLOTS_ROOT/$ACCOUNT/cli-home"
    [ -f "$SLOT_HOME/.cursor/cli-config.json" ] || die "account '$ACCOUNT': no API key in $KEYS_FILE and no login slot at $SLOT_HOME. Create one with: HOME=\"$SLOT_HOME\" cursor-agent login"
  fi
else
  # No account named: a CURSOR_API_KEY in the environment wins; otherwise fall
  # through to the machine's ambient `cursor-agent login` (the base account).
  API_KEY="${CURSOR_API_KEY:-}"
fi

# --- build the cursor-agent command ---
# --trust is always passed: headless (-p) runs cannot answer the interactive
# "trust this directory?" prompt, they just die on it, and whoever invoked this
# wrapper already chose the working directory deliberately.
CMD=(cursor-agent -p --trust --output-format "$FORMAT")
[ -n "$MODEL" ] && CMD+=(--model "$MODEL")
CMD+=("$TASK")
[ ${#EXTRA[@]} -gt 0 ] && CMD+=("${EXTRA[@]}")

if [ -n "$DRYRUN" ]; then
  # Redact the key; show exactly what would run, where, and as whom.
  echo "cursor-run (dry run)"
  echo "  cwd:     ${CWD:-$(pwd)}"
  echo "  account: ${ACCOUNT:-<default>}"
  if [ -n "$API_KEY" ]; then
    echo "  auth:    API key ${API_KEY:0:4}***(${#API_KEY} chars)"
    ENV_PREFIX='CURSOR_API_KEY=***'
  elif [ -n "$SLOT_HOME" ]; then
    echo "  auth:    login slot $SLOT_HOME"
    ENV_PREFIX="HOME=$SLOT_HOME"
  else
    echo "  auth:    ambient cursor-agent login (base account)"
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

CURSOR_AGENT_BIN="$(command -v cursor-agent || true)"
[ -n "$CURSOR_AGENT_BIN" ] || die "cursor-agent not found on PATH. Install it: curl https://cursor.com/install -fsS | bash  (then restart your shell)"

[ -n "$CWD" ] && cd "$CWD"
if [ -n "$API_KEY" ]; then
  export CURSOR_API_KEY="$API_KEY"
  exec "${CMD[@]}"
elif [ -n "$SLOT_HOME" ]; then
  # Resolve the binary BEFORE overriding HOME (PATH may point into real $HOME),
  # then run with the slot as HOME so cursor-agent reads that account's login.
  CMD[0]="$CURSOR_AGENT_BIN"
  HOME="$SLOT_HOME" exec "${CMD[@]}"
else
  exec "${CMD[@]}"
fi
