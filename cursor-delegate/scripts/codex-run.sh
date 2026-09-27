#!/bin/bash
# codex-run.sh: hand one self-contained task to a ChatGPT account through the
# Codex CLI (`codex exec`), on that account's Codex allowance, and print its
# final answer.
#
# Accounts are the folders `daftar codex` writes on every machine,
# ~/.claude-deck/codex/<label>/auth.json. Each one is a whole CODEX_HOME, so
# pointing CODEX_HOME at it is the entire account switch. Their refresh token is
# blank on purpose: the vault is its only holder, and a copy that refreshed
# would kill every other copy. So never run `codex login` into these folders.
#
# With no --account, the account with the most room left in its longest window
# is picked, read from the same endpoint Codex's /status uses (costs nothing).
#
# Workers are fully trusted, like Claude subagents: no approvals, no sandbox.
# Never set OPENAI_API_KEY here: that bills the API instead of the subscription.
#
# macOS Bash 3.2 compatible.
set -euo pipefail

FOLDER="${CODEX_DECK_FOLDER:-$HOME/.claude-deck/codex}"
ACCOUNT=""; MODEL=""; CWD="$PWD"; LIST=""; DRYRUN=""; TASK=""

usage() {
  cat >&2 <<'EOF'
Usage: codex-run.sh [--account LABEL] [--model M] [--cwd DIR] [--dry-run] "task"
       codex-run.sh --list          accounts, with what each has left
       echo "task" | codex-run.sh [options]
EOF
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --account) ACCOUNT="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --cwd) CWD="$2"; shift 2 ;;
    --list) LIST=1; shift ;;
    --dry-run) DRYRUN=1; shift ;;
    -h|--help) usage ;;
    *) TASK="$1"; shift ;;
  esac
done

# A Code session's PATH may not carry ~/.local/bin, where the servers keep it.
CODEX="$(command -v codex || echo "$HOME/.local/bin/codex")"
[ -x "$CODEX" ] || { echo "codex is not installed on this machine" >&2; exit 1; }
[ -d "$FOLDER" ] || { echo "no accounts in $FOLDER. On the Mac: daftar codex add" >&2; exit 1; }

# label <tab> percent used of the longest window <tab> reset time, one per account.
room() {
  python3 - "$FOLDER" <<'PY'
import json, os, sys, time, urllib.request
folder = sys.argv[1]
for label in sorted(os.listdir(folder)):
    path = os.path.join(folder, label, "auth.json")
    if not os.path.isfile(path):
        continue
    try:
        tokens = json.load(open(path))["tokens"]
        request = urllib.request.Request("https://chatgpt.com/backend-api/wham/usage", headers={
            "Authorization": "Bearer " + tokens["access_token"], "ChatGPT-Account-Id": tokens["account_id"],
            "User-Agent": "codex_cli_rs", "originator": "codex_cli_rs"})
        usage = json.load(urllib.request.urlopen(request, timeout=20))
        limits = usage.get("rate_limit") or {}
        windows = [w for w in (limits.get("primary_window"), limits.get("secondary_window")) if w]
        main = max(windows, key=lambda w: w["limit_window_seconds"]) if windows else None
        used = 100 if limits.get("limit_reached") else (main["used_percent"] if main else 0)
        resets = time.strftime("%a %H:%M", time.localtime(main["reset_at"])) if main else "-"
        print(f"{label}\t{used}\t{resets}")
    except Exception as e:
        print(f"{label}\t100\tunreadable: {e}")
PY
}

if [ -n "$LIST" ]; then
  room | awk -F'\t' '{ printf "%-32s %3s%% used   resets %s\n", $1, $2, $3 }'
  exit 0
fi

[ -n "$TASK" ] || [ -t 0 ] || TASK="$(cat)"
[ -n "$TASK" ] || usage

if [ -z "$ACCOUNT" ]; then
  ACCOUNT="$(room | sort -t$'\t' -k2,2n | awk -F'\t' '$2 < 100 { print $1; exit }')"
  [ -n "$ACCOUNT" ] || { echo "every account is spent or unreadable; see codex-run.sh --list" >&2; exit 1; }
fi
[ -f "$FOLDER/$ACCOUNT/auth.json" ] || { echo "no account '$ACCOUNT'. Have: $(ls "$FOLDER" | tr '\n' ' ')" >&2; exit 1; }

ARGS=(exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -C "$CWD")
[ -z "$MODEL" ] || ARGS+=(-m "$MODEL")
OUT="$(mktemp)"; trap 'rm -f "$OUT"' EXIT
ARGS+=(-o "$OUT")

echo "codex-run: account $ACCOUNT, in $CWD" >&2
if [ -n "$DRYRUN" ]; then
  echo "CODEX_HOME=$FOLDER/$ACCOUNT $CODEX ${ARGS[*]} <task>"
  exit 0
fi
# Progress goes to stderr; the final answer alone to stdout.
env -u OPENAI_API_KEY -u CODEX_API_KEY CODEX_HOME="$FOLDER/$ACCOUNT" "$CODEX" "${ARGS[@]}" "$TASK" >&2
cat "$OUT"
