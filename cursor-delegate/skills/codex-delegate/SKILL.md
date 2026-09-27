---
name: codex-delegate
description: Delegate a self-contained coding or research task to a ChatGPT account through the Codex CLI, so it runs on that account's Codex allowance instead of Claude's. Use when the user says "delegate to codex", "give it to chatgpt", "use the codex quota", "have codex do it", "بده به کدکس", or wants a heavy self-contained slice done by a second agent and Cursor is not named.
---

# Delegate to Codex

Hand one self-contained task to `codex exec` on one of the user's ChatGPT accounts. Claude keeps the plan and the context; Codex does the slice and returns its final answer.

## Run it

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh" --cwd "<repo>" "<the whole task, self-contained>"
```

- **No `--account`** is the normal case: the account with the most weekly room left is picked.
- `--account <label>` when the user names one. `--list` shows every account with what it has left.
- `--model <m>` only when the user asks for one.
- Anything longer than a couple of minutes: run it with the Bash tool's `run_in_background`, and read the result when it finishes. Only the final answer goes to stdout; progress goes to stderr.

The worker is fully trusted (no approvals, no sandbox) and edits files in `--cwd` directly, so review its diff the way you would a subagent's before saying the work is done. Say which account ran it.

## If it fails

- "no accounts": the accounts are added once on the Mac with `daftar codex add` (one browser login each), and `daftar codex` writes them on every machine.
- "the login has expired" or a 401: the Mac refreshes the logins daily; ask the user to run `daftar codex` on the Mac. Never run `codex login` into `~/.claude-deck/codex/<label>`: those copies must not hold a refresh token.
- Never set `OPENAI_API_KEY`: that bills the API, not the subscription.
