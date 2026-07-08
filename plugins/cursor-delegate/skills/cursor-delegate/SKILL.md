---
name: cursor-delegate
description: Delegate a coding or research task to the Cursor CLI (cursor-agent) so it runs on the Cursor subscription's quota instead of Claude's, with Claude still orchestrating. Use when the user says "delegate to cursor", "run this with cursor-agent", "offload to cursor", "spend the cursor quota", "have cursor do it", or wants to hand a heavy self-contained slice of a larger job to a second agent. Works with the user's default Cursor login; an optional account name targets a specific seat.
---

# Delegate to Cursor (agent calling)

Hand a self-contained slice to `cursor-agent`; it runs on the Cursor plan's quota while Claude keeps the context and the plan. This is agent calling, not a model swap: Cursor sells no Anthropic-shaped API for its subscription, so Claude's own engine can't point at it, but the two run side by side.

## Pick the runner first

**One measured fact drives this choice: flaky networks (VPNs especially) kill any single cursor-agent stream older than ~5 minutes.** Long runs die at minute ~6 with "Connection lost" while short requests keep succeeding.

- **Quick task** — the worker will plausibly finish in **under ~4 minutes** (one focused edit, a lookup, a small test fix): call `cursor_run`.
- **Anything else** — multi-file work, builds, test loops, refactors, research that reads a lot: use the **legged runner**. Never start a long single stream.

## Quick tasks: the `cursor_run` MCP tool

Call **`cursor_run`** (from this plugin) with the task:

- `task` (required) — the self-contained instruction.
- `account` (optional) — **omit it in the normal case.** A default user has one Cursor login, and leaving `account` empty uses it. Pass an account name only when the user keeps several Cursor seats and names one.
- `model` (optional) — `auto` is unlimited on paid Cursor plans (draws no quota); a named model draws the monthly pool. Prefer `auto` unless the user asks for a specific model, and say which you used.
- `extraArgs` (optional) — flags passed straight to cursor-agent; for tasks that edit files add `["--force"]` (headless runs don't prompt for approval).
- `dryRun: true` — print the exact command (key redacted) without running, to show the user first.

If the MCP tool is unavailable, the same logic is a script at `${CLAUDE_PLUGIN_ROOT}/scripts/cursor-run.sh` (`--account`, `--model`, `--dry-run`, `-- <flags>`).

## Long tasks: the legged runner (canonical)

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/legged-run.sh" --cwd /path/to/repo "…self-contained task…"
```

It runs the task as **~4-minute legs on ONE cursor-agent session**: each leg checkpoints (`PROGRESS:`/`NEXT:`) and exits before the network can kill the stream, then the loop `--resume`s the same session (context preserved) until the worker prints `DONE-ALL`. A connection drop costs one leg, never the job.

- stdout = the worker's final result. Exit `1` = leg budget spent; **rerun the exact same command to continue** (state: `~/.claude-deck/cursor/legs/<id>`).
- Options: `--account`, `--model` (default `auto`), `--worktree` (parallel-safe edits: persistent git worktree + branch `legs/<id>` beside the repo), `--id`, `--leg-minutes`, `--max-legs`, `--json` (summary with `ok`, `legs`, `session_id`, `result`, summed `usage`), `-- <extra cursor-agent flags>`. `--force` is always passed.
- Run it with Bash `run_in_background` and follow progress in the state dir; don't block a turn waiting on many legs.

## Rules that make it work

1. **Self-contained tasks only.** cursor-agent starts with a blank context. Put file paths, the goal, and acceptance criteria inside the task text. "Fix the bug we discussed" fails; "In `src/auth.js`, `verify()` treats expired tokens as valid because it compares `exp` (seconds) to `Date.now()` (ms) — fix it and add a test" works.
2. **Account is optional.** Default = the one Cursor login. Only reach for `account` in a multi-seat setup.
3. **Mind the meter.** `auto` = unlimited; named models draw the pool. There's no per-run bill surprise if the account's on-demand spend limit is off in Cursor's billing settings.
4. **No secrets in the task text.** It leaves this machine for Cursor's servers.
5. **Report back honestly.** Return the worker's output plus one line: what ran, which account (or "default"), which model. If cursor-agent is missing, unauthenticated, or out of quota, say so and stop — don't silently redo the work on Claude's quota unless asked.

## How cursor-agent behaves (proven facts, use these)

- **Long streams die:** the transport, not the model, is the limit — ~5 minutes per stream on flaky/VPN paths (measured). The legged runner exists for exactly this; single-stream runs are for quick tasks only.
- **Editing files:** a headless run won't touch files unless it can bypass the approval prompt — pass `extraArgs: ["--force"]` for any task that writes (the legged runner passes it automatically).
- **Structured output:** `json: true` returns one object `{ result, session_id, request_id, usage: {inputTokens, outputTokens, cacheReadTokens, ...}, duration_ms }`. Use `result` for the answer, `usage` to track cost.
- **Iterate, don't restart:** capture `session_id`, then continue that same worker with `extraArgs: ["--resume", "<session_id>"]` (or `legged-run.sh --resume <id>`). It keeps its full prior context (verified), so corrections and follow-ups are cheap. This same fact is what makes legs work.
- **Concurrency:** several cursor-agent runs on one account run in parallel fine — fan out independent slices at once. For parallel edits in one repo, give each legged run `--worktree`, or use disjoint dirs.
- **Project context:** cursor-agent reads `CLAUDE.md` and `AGENTS.md` at the repo root, so workers follow the project's conventions automatically. Global `~/.cursor/rules` do NOT reach headless runs. Project `.cursor/mcp.json` MCP servers are available if a task needs one.
- **Models:** `model: "auto"` is unlimited on paid plans (no quota); named models (e.g. `composer-2.5`, a `gpt-5.x-codex` tier, Opus, Fable) draw the pool. `cursor-agent --list-models` (needs auth) lists them.
- **Big or multi-part jobs:** don't cram them into one task — use the **cursor-orchestrate** skill (fleet fan-out, review loop, JS harness).

## Setup (once)

- Install the CLI: `curl https://cursor.com/install -fsS | bash`, then `cursor-agent login` for the default account.
- Multi-account (optional): give each named account a Cursor API key in `~/.claude-deck/cursor/agent-keys.json` (`{ "label": "key_..." }`, chmod 600). Then `account: "label"` uses it. See the plugin README.
