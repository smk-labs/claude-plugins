# cursor-delegate

Delegate self-contained tasks to the **Cursor CLI** (`cursor-agent`) from inside Claude Code, so they run on your **Cursor subscription's quota** instead of Claude's. Claude stays the orchestrator; Cursor runs the slice.

Works with your single Cursor login out of the box. An optional account input targets a specific seat when you keep several.

> This is **agent calling, not a model-backend swap.** Cursor sells no Anthropic-shaped API for its subscription, and the Claude Desktop Code tab always uses your claude.ai account, so you can't point Claude's engine at Cursor. This runs the two side by side.

## What's inside

| Component | Role |
|-----------|------|
| `cursor_run` MCP tool | Structured call: `task` (required), `account`, `model`, `extraArgs`, `dryRun`. The interface for one **quick** task (< ~4 min). |
| `cursor-delegate` skill | Teaches Claude when/how to delegate one task, quick-vs-legged routing, and that `account` is optional. |
| `cursor-orchestrate` skill | Scales it up: Claude plans and reviews, a **fleet** of Cursor workers executes in parallel. Auto-picks the approach by size; say **"sub"** to force one worker or **"workflow"**/**"w"** to force the JS harness. |
| `cursor-worker` subagent | Owns one delegation end-to-end and reports back. |
| `scripts/cursor-run.sh` | The shared auth/invocation primitive everything calls: one cursor-agent run. Quick tasks only. |
| `scripts/legged-run.sh` | **The canonical runner for anything longer**: chains ~4-minute legs of `cursor-run.sh` on ONE resumed session until the worker prints `DONE-ALL`. Survives connection drops; rerun the same command to continue. |
| `scripts/orchestrator.js` | Zero-dep fleet runner (Mode B): a concurrency pool that runs **every task legged** from a `tasks.json` and writes `results.json` (each with `ok`, `result`, `session_id`, `legs`, summed token `usage`). Perseveres: tasks that stop without `DONE-ALL` are automatically resumed for extra passes (`--rounds`, default 2); rerunning the same command later continues from the saved sessions. |

## Two ways to use it

- **One task** — ask "delegate X to cursor" (or call `cursor_run`). Best for a single self-contained slice.
- **A whole job** — ask "orchestrate X with a cursor fleet" (the `cursor-orchestrate` skill). Claude decomposes into vertical slices, fans them out across parallel Cursor workers, reviews each, iterates by resuming worker sessions, and integrates. Good for building a feature (or a whole app) fast on Cursor's quota while Claude keeps the architecture and design decisions.

## Long tasks run legged — never one long stream

Measured on a real multi-hour build: flaky network paths (VPNs especially) kill any single cursor-agent stream that lives past **~5 minutes** — long workers died at minute ~6 with "Connection lost", three for three, while sub-3-minute tasks and plain HTTPS requests to the same server kept succeeding. Turning the VPN off wasn't an option (Cursor is unreachable without it).

So the plugin's canonical long-task runner is `legged-run.sh`: the task runs as **short ~4-minute legs on ONE cursor-agent session**. Each leg checkpoints (`PROGRESS:`/`NEXT:`) and exits before the network can kill it; the loop `--resume`s the same session (context preserved) until the worker prints `DONE-ALL`. A drop costs one leg, never the job.

```bash
# runs in legs until DONE-ALL; exit 1 = leg budget spent, rerun to continue
"$CLAUDE_PLUGIN_ROOT/scripts/legged-run.sh" --cwd /path/to/repo --model auto "…self-contained task…"
```

Leg state (per-leg JSON, `session_id`, `last_result.txt`) lives in `~/.claude-deck/cursor/legs/<id>`, so the run is resumable even after a crash. `--worktree` gives the worker a persistent git worktree (branch `legs/<id>`) for parallel-safe edits; `--json` prints a machine-readable summary; `--force` is always passed. The fleet runner (`orchestrator.js`) uses this for every task automatically.

## Setup

1. Install the Cursor CLI and sign in your default account:
   ```bash
   curl https://cursor.com/install -fsS | bash
   cursor-agent login
   ```
2. Install this plugin from the `smk` marketplace. Done — for a single account, no other config.

### Multiple accounts (optional)

Give each named account a Cursor API key (Cursor dashboard → Integrations → API Keys), then store them in `~/.claude-deck/cursor/agent-keys.json` (chmod 600):

```json
{ "work": "key_...", "personal": "key_..." }
```

Now `account: "work"` (tool) or `--account work` (script) uses that key. A key overrides the default login; with no account, the default login is used.

## Usage

Just ask: **"delegate the parser tests to cursor"** — Claude calls `cursor_run` with your default account.

Or drive the script directly:

```bash
# dry-run prints the exact command with the key redacted
"$CLAUDE_PLUGIN_ROOT/scripts/cursor-run.sh" --model auto --dry-run "…self-contained task…"

# real run; -- passes flags straight to cursor-agent (--force lets it edit files)
"$CLAUDE_PLUGIN_ROOT/scripts/cursor-run.sh" --account work --model auto "…task…" -- --force
```

## Notes

- **Billing:** Cursor **Auto** (`model: auto`) is unlimited on paid plans (no quota drawn); named models draw the monthly pool. To rule out surprise charges, turn off on-demand spending in Cursor's billing settings.
- **Self-contained tasks only:** `cursor-agent` starts with a blank context, so include file paths, the goal, and acceptance criteria in the task.
- **No secrets in task text:** it leaves your machine for Cursor's servers.
