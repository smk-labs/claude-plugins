#!/bin/bash
# legged-run.sh: run ONE long cursor-agent task as a chain of short "legs" on a
# single resumed session. Root cause this exists for (measured, not guessed):
# flaky network paths — VPNs especially — kill any single stream that lives past
# ~5 minutes. Long workers died at minute ~6 with "Connection lost" while short
# requests to the same server kept returning 200. So no leg streams longer than
# ~LEG_MINUTES: the worker checkpoints (PROGRESS:/NEXT:) and exits, and the loop
# resumes the SAME session (full context preserved) until the worker prints
# DONE-ALL. A dropped connection costs one leg, never the job.
#
# This is the plugin's canonical runner for ANY task that might exceed one leg.
# The cursor-delegate skill, the cursor-worker subagent, and orchestrator.js all
# route long tasks through here. cursor-run.sh stays the single auth/invocation
# primitive underneath (and the direct path for quick sub-leg tasks).
#
# State lives in --state (default ~/.claude-deck/cursor/legs/<id>): leg-N.json,
# leg-N.err, session_id, last_result.txt. Rerunning the same command resumes
# where it stopped. macOS Bash 3.2 compatible; node used for JSON.
set -uo pipefail

ACCOUNT=""; MODEL="auto"; CWD=""; WORKTREE=""; ID=""; STATE=""
LEG_MINUTES=4; MAX_LEGS=15; SESSION=""; JSON_OUT=""
TASK=""; EXTRA=()

usage() {
  cat >&2 <<'EOF'
Usage: legged-run.sh [options] "self-contained task text"
       echo "task text" | legged-run.sh [options]

Runs the task as short legs (~4 min each) on ONE cursor-agent session,
resuming between legs, so flaky networks/VPNs cannot kill the run.

Options:
  --account LABEL   Forwarded to cursor-run.sh (omit = default Cursor login)
  --model MODEL     Model for cursor-agent (default: auto — unlimited on paid plans)
  --cwd DIR         Worker's working directory
  --worktree        Isolate edits: git worktree + branch legs/<id> beside the repo at --cwd
  --id NAME         Stable job id for logs + state dir (default: checksum of the task)
  --state DIR       Leg outputs + session id (default: ~/.claude-deck/cursor/legs/<id>)
  --leg-minutes N   Focused work per leg before the checkpoint (default: 4)
  --max-legs N      Legs to attempt in THIS invocation (default: 15)
  --resume ID       Adopt an existing cursor-agent session instead of starting fresh
  --json            Print one summary line on stdout: {ok, legs, session_id, result, usage}
  -- ARGS...        Extra cursor-agent flags for every leg (--force is always passed)

stdout: the worker's final result text (or the --json summary). Progress lines
go to stderr. Exit 0 = worker printed DONE-ALL. Exit 1 = leg cap reached —
rerun the SAME command to continue from the saved session.
EOF
}

die() { echo "legged-run: $1" >&2; exit "${2:-1}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --account) ACCOUNT="${2:-}"; shift 2 ;;
    --account=*) ACCOUNT="${1#*=}"; shift ;;
    --model) MODEL="${2:-}"; shift 2 ;;
    --model=*) MODEL="${1#*=}"; shift ;;
    --cwd) CWD="${2:-}"; shift 2 ;;
    --cwd=*) CWD="${1#*=}"; shift ;;
    --worktree) WORKTREE=1; shift ;;
    --id) ID="${2:-}"; shift 2 ;;
    --state) STATE="${2:-}"; shift 2 ;;
    --leg-minutes) LEG_MINUTES="${2:-}"; shift 2 ;;
    --max-legs) MAX_LEGS="${2:-}"; shift 2 ;;
    --resume) SESSION="${2:-}"; shift 2 ;;
    --json) JSON_OUT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; while [ $# -gt 0 ]; do EXTRA+=("$1"); shift; done ;;
    -*) die "unknown option: $1 (use -- to pass flags to cursor-agent)" ;;
    *) if [ -z "$TASK" ]; then TASK="$1"; else TASK="$TASK $1"; fi; shift ;;
  esac
done
if [ -z "$TASK" ] && [ ! -t 0 ]; then TASK="$(cat)"; fi
[ -n "$TASK" ] || { usage; die "no task text given"; }

# cursor-run.sh: env override, then sibling of this script, then claude-deck.
RUNNER="${CURSOR_RUN_BIN:-}"
if [ -z "$RUNNER" ]; then
  HERE="$(cd "$(dirname "$0")" && pwd)"
  for c in "$HERE/cursor-run.sh" "$HOME/.claude-deck/bin/cursor-run.sh"; do
    if [ -f "$c" ]; then RUNNER="$c"; break; fi
  done
fi
[ -n "$RUNNER" ] && [ -f "$RUNNER" ] || die "cursor-run.sh not found (set CURSOR_RUN_BIN)"

[ -n "$ID" ] || ID="task-$(printf '%s' "$TASK" | cksum | awk '{print $1}')"
[ -n "$STATE" ] || STATE="$HOME/.claude-deck/cursor/legs/$ID"
mkdir -p "$STATE"

if [ -n "$WORKTREE" ]; then
  REPO="$(git -C "${CWD:-.}" rev-parse --show-toplevel 2>/dev/null)" \
    || die "--worktree needs --cwd inside a git repo"
  WT="$(dirname "$REPO")/$(basename "$REPO")-legs-$ID"
  if [ ! -d "$WT" ]; then
    git -C "$REPO" worktree add -b "legs/$ID" "$WT" HEAD >&2 || die "git worktree add failed"
  fi
  CWD="$WT"
fi

PROTO="IMPORTANT session protocol: the network here drops long-lived streams, so you work in short legs. Work focused for about $LEG_MINUTES minutes, then STOP: print a line 'PROGRESS: <what is done so far>' and a line 'NEXT: <the immediate next step>' and end your turn. You will be resumed in the same session to continue. Only when the ENTIRE task, including every acceptance criterion, is genuinely complete: print a final summary of what you did, then print the single line DONE-ALL."
FIRST_PROMPT="$TASK

$PROTO"
RESUME_PROMPT="Continue exactly where you left off on the same task (see your PROGRESS:/NEXT: notes). Same protocol: about $LEG_MINUTES minutes of focused work, then stop with PROGRESS:/NEXT: lines. Only when the whole task including its acceptance criteria is done: print the final summary, then print the single line DONE-ALL."

# Read one string field out of a leg's JSON (last parseable line wins).
leg_field() {
  node -e '
    const fs = require("fs");
    let d = null;
    try {
      const lines = fs.readFileSync(process.argv[1], "utf8").trim().split("\n");
      for (let i = lines.length - 1; i >= 0; i--) { try { d = JSON.parse(lines[i]); break; } catch (e) {} }
    } catch (e) {}
    const v = d && d[process.argv[2]];
    process.stdout.write(typeof v === "string" ? v : "");
  ' "$1" "$2"
}

[ -z "$SESSION" ] && [ -f "$STATE/session_id" ] && SESSION="$(cat "$STATE/session_id")"
LEGBASE=0
while [ -f "$STATE/leg-$((LEGBASE+1)).json" ]; do LEGBASE=$((LEGBASE+1)); done
LEG_TIMEOUT=$(( (LEG_MINUTES + 4) * 60 ))   # hard cap for a hung (not dropped) stream
RESULT=""; DONE=""; KILLED=""

# Already finished in a previous invocation: return the saved result instead of
# burning a leg to make the worker say DONE-ALL again. This makes "rerun the
# same command" free for completed tasks (the fleet runner relies on it).
if [ -f "$STATE/done" ]; then
  RESULT="$(cat "$STATE/last_result.txt" 2>/dev/null || true)"
  DONE=1
  echo "[legged $ID] already complete (done marker in state); returning saved result" >&2
fi

for n in $(seq 1 "$MAX_LEGS"); do
  [ -n "$DONE" ] && break
  i=$((LEGBASE + n))
  LEGOUT="$STATE/leg-$i.json"
  # cursor-run supervises the leg itself: it kills cursor-agent ~1.5s after the
  # result object appears (the CLI sometimes never exits on its own) and
  # hard-kills at --timeout. No watchdog needed here.
  ARGS=(--json --model "$MODEL" --timeout "$LEG_TIMEOUT")
  [ -n "$ACCOUNT" ] && ARGS+=(--account "$ACCOUNT")
  [ -n "$CWD" ] && ARGS+=(--cwd "$CWD")
  if [ -z "$SESSION" ]; then
    ARGS+=("$FIRST_PROMPT" -- --force)
  else
    ARGS+=("$RESUME_PROMPT" -- --force --resume "$SESSION")
  fi
  [ ${#EXTRA[@]} -gt 0 ] && ARGS+=("${EXTRA[@]}")

  # Background + wait so a SIGTERM/SIGINT to this script reaches the leg: the
  # cursor-run supervisor forwards it to cursor-agent, so the whole chain dies
  # together and the saved session stays resumable.
  "$RUNNER" "${ARGS[@]}" > "$LEGOUT" 2>"$STATE/leg-$i.err" &
  LEG_PID=$!
  trap 'KILLED=1; kill -TERM "$LEG_PID" 2>/dev/null' TERM INT
  wait "$LEG_PID" 2>/dev/null
  trap - TERM INT

  NEWSESSION="$(leg_field "$LEGOUT" session_id)"
  RESULT="$(leg_field "$LEGOUT" result)"
  if [ -n "$NEWSESSION" ]; then
    SESSION="$NEWSESSION"
    printf '%s\n' "$SESSION" > "$STATE/session_id"   # persist every leg: a killed run stays resumable
  fi
  echo "[legged $ID leg $i] session=${SESSION:0:8} chars=${#RESULT}" >&2

  if [ -n "$KILLED" ]; then
    echo "[legged $ID leg $i] terminated by signal; session ${SESSION:-none} saved — rerun the same command to resume" >&2
    break
  fi

  if printf '%s' "$RESULT" | grep -q "DONE-ALL"; then
    DONE=1
    : > "$STATE/done"   # marker: reruns return the saved result, no extra leg
    break
  fi
  if [ -z "$RESULT" ] && [ -z "$NEWSESSION" ]; then
    echo "[legged $ID leg $i] hard failure (no result, no session); err tail:" >&2
    tail -3 "$STATE/leg-$i.err" >&2 || true
    if grep -Eq 'Security command failed|Password not found|code: 45' "$STATE/leg-$i.err" 2>/dev/null; then
      # Transient: concurrent cursor-agent STARTUPS race on the macOS keychain
      # (measured: 1 in 4 simultaneous starts dies with "Password not found"
      # even with CURSOR_API_KEY set; sandboxed shells die the same way every
      # time). Decorrelate with a random pause and retry — it costs a leg from
      # the budget, never the job.
      PAUSE=$(( 5 + (RANDOM % 15) ))
      echo "[legged $ID leg $i] keychain race at startup; retrying in ${PAUSE}s" >&2
      sleep "$PAUSE"
    elif [ -z "$SESSION" ] && [ "$n" -ge 3 ]; then
      # No session ever and not the keychain signature: a real setup error
      # (auth/CLI). Three fresh attempts, then stop instead of burning legs.
      break
    fi
  fi
done

printf '%s' "$RESULT" > "$STATE/last_result.txt"
if [ -n "$DONE" ]; then
  echo "[legged $ID] DONE-ALL (session ${SESSION:0:8})" >&2
else
  echo "[legged $ID] stopped without DONE-ALL — rerun the same command to continue (session ${SESSION:-none})" >&2
fi

if [ -n "$JSON_OUT" ]; then
  node -e '
    const fs = require("fs"), path = require("path");
    const [state, ok, session] = process.argv.slice(1);
    let result = ""; try { result = fs.readFileSync(path.join(state, "last_result.txt"), "utf8"); } catch (e) {}
    const usage = {};
    let legs = 0;
    for (const f of fs.readdirSync(state)) {
      const m = /^leg-(\d+)\.json$/.exec(f);
      if (!m) continue;
      legs = Math.max(legs, Number(m[1]));
      try {
        const lines = fs.readFileSync(path.join(state, f), "utf8").trim().split("\n");
        let d = null;
        for (let i = lines.length - 1; i >= 0; i--) { try { d = JSON.parse(lines[i]); break; } catch (e) {} }
        if (d && d.usage) for (const k of Object.keys(d.usage)) {
          if (typeof d.usage[k] === "number") usage[k] = (usage[k] || 0) + d.usage[k];
        }
      } catch (e) {}
    }
    process.stdout.write(JSON.stringify({ ok: ok === "1", legs, session_id: session || null, result, usage }) + "\n");
  ' "$STATE" "${DONE:-0}" "$SESSION"
elif [ -n "$DONE" ]; then
  printf '%s\n' "$RESULT"
fi

if [ -n "$DONE" ]; then exit 0; else exit 1; fi
