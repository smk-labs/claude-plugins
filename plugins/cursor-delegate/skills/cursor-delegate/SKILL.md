---
name: cursor-delegate
description: Delegate a coding or research task to the Cursor CLI (cursor-agent) so it runs on the Cursor subscription's quota instead of Claude's, with Claude still orchestrating. Use when the user says "delegate to cursor", "run this with cursor-agent", "offload to cursor", "spend the cursor quota", "have cursor do it", or wants to hand a heavy self-contained slice of a larger job to a second agent. Works with the user's default Cursor login; an optional account name targets a specific seat.
---

# Delegate to Cursor (agent calling)

Hand a self-contained slice to `cursor-agent`; it runs on the Cursor plan's quota while Claude keeps the context and the plan. This is agent calling, not a model swap: Cursor sells no Anthropic-shaped API for its subscription, so Claude's own engine can't point at it, but the two run side by side.

## How to delegate

Call the **`cursor_run`** MCP tool (from this plugin) with the task:

- `task` (required) — the self-contained instruction.
- `account` (optional) — **omit it in the normal case.** A default user has one Cursor login, and leaving `account` empty uses it. Pass an account name only when the user keeps several Cursor seats and names one.
- `model` (optional) — `auto` is unlimited on paid Cursor plans (draws no quota); a named model draws the monthly pool. Prefer `auto` unless the user asks for a specific model, and say which you used.
- `extraArgs` (optional) — flags passed straight to cursor-agent; for tasks that edit files add `["--force"]` (headless runs don't prompt for approval).
- `dryRun: true` — print the exact command (key redacted) without running, to show the user first.

Prefer `cursor_run`. If the MCP tool is unavailable, the same logic is a script at `${CLAUDE_PLUGIN_ROOT}/scripts/cursor-run.sh` (`--account`, `--model`, `--dry-run`, `-- <flags>`).

## Rules that make it work

1. **Self-contained tasks only.** cursor-agent starts with a blank context. Put file paths, the goal, and acceptance criteria inside the task text. "Fix the bug we discussed" fails; "In `src/auth.js`, `verify()` treats expired tokens as valid because it compares `exp` (seconds) to `Date.now()` (ms) — fix it and add a test" works.
2. **Account is optional.** Default = the one Cursor login. Only reach for `account` in a multi-seat setup.
3. **Mind the meter.** `auto` = unlimited; named models draw the pool. There's no per-run bill surprise if the account's on-demand spend limit is off in Cursor's billing settings.
4. **No secrets in the task text.** It leaves this machine for Cursor's servers.
5. **Report back honestly.** Return the worker's output plus one line: what ran, which account (or "default"), which model. If cursor-agent is missing, unauthenticated, or out of quota, say so and stop — don't silently redo the work on Claude's quota unless asked.

## Setup (once)

- Install the CLI: `curl https://cursor.com/install -fsS | bash`, then `cursor-agent login` for the default account.
- Multi-account (optional): give each named account a Cursor API key in `~/.claude-deck/cursor/agent-keys.json` (`{ "label": "key_..." }`, chmod 600). Then `account: "label"` uses it. See the plugin README.
