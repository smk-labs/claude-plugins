---
name: cursor-orchestrate
description: Orchestrate a fleet of Cursor CLI (cursor-agent) workers to execute a large or multi-part job, while Claude does the architecture, UX/UI decisions, decomposition, review, and integration. Use when the user says "orchestrate with cursor", "build this with a cursor fleet", "fan out to cursor agents", "cursor workflow", "have cursor build X", or when a delegation is too big for one worker. Optional mode word: "workflow"/"w" forces the JS harness; "sub"/"subagent" forces a single simple worker. Otherwise auto-detect by size.
---

# Orchestrate a Cursor fleet (Claude plans, Cursor executes)

Claude stays the brain: it owns architecture, UX/UI and design decisions, the plan, task decomposition, review/acceptance, and final integration. `cursor-agent` workers do the execution on the Cursor subscription's quota. This is agent calling at scale, not a model-backend swap.

## Step 1 — pick the mode

Check the user's words first, then fall back to auto-detect by size:

| Signal | Mode |
|--------|------|
| user said **"sub"** / **"subagent"** | **A-simple**: one `cursor-worker` subagent or a single `cursor_run` call |
| user said **"workflow"** / **"w"** | **B**: the JS harness (`orchestrator.js`) |
| **≤ 1** independent slice | A-simple |
| **2–8** independent slices | **A-fan-out**: several `cursor_run` calls in parallel |
| **> 8** slices, or multi-phase build, or needs retries / worktrees / determinism | **B**: the JS harness |

State which mode you chose and why in one line.

## Step 2 — decompose (Claude's job)

Cut the work into **independent vertical slices**. Each slice becomes one worker task. Write every task **fully self-contained** — the worker starts with a blank context and cannot see this conversation:

> **File paths** to touch · **the goal** · **acceptance criteria** (how to know it's done) · **what NOT to change**. Reference the project's conventions by pointing at its `CLAUDE.md`/`AGENTS.md` (see Context below), not by re-explaining them.

Bad: "add the auth we discussed." Good: "In `src/auth/session.ts`, add `refresh(token)` that returns a new JWT; it must reject tokens whose `exp` is in the past; add a Vitest in `src/auth/session.test.ts` covering expired + valid; do not touch `src/auth/login.ts`."

## Step 3 — run it

**One rule overrides everything: no single cursor-agent stream may live past ~4 minutes.** Flaky networks (VPNs especially) kill streams at ~5-6 minutes — measured, not theoretical. Quick slices (< ~4 min) may use `cursor_run`; every longer slice runs **legged**: short legs on one `--resume`d session until the worker prints `DONE-ALL` (see the cursor-delegate skill).

### Mode A-simple
One quick task → the `cursor_run` tool (or the `cursor-worker` subagent). One long task → the legged runner:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/legged-run.sh" --cwd <repo> "…self-contained task…"
```

### Mode A-fan-out
Quick slices: several `cursor_run` calls **in a single turn** so they run concurrently (proven: multiple cursor-agent runs on one account run in parallel fine). Long slices: one `legged-run.sh` per slice via Bash `run_in_background`. For slices that **edit files in the same repo**, give each legged run `--worktree` (persistent git worktree, branch `legs/<id>`) or disjoint directories, so they never collide. Collect all results, then go to Step 4.

### Mode B — the JS harness
Write a `tasks.json` and run the bundled fleet runner (it executes **every task legged** through `legged-run.sh`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/orchestrator.js" tasks.json \
  --account <name> --concurrency 4 --model auto --out results.json
```

`tasks.json` is an array of `{ id, prompt, model?, account?, cwd?, worktree?, resume?, legMinutes?, maxLegs?, extraArgs? }`. The runner pools the fleet, passes `--force` automatically, keeps each task's leg state under `<out dir>/cursor-legs/<id>` (rerunning the same command resumes unfinished tasks), and writes `results.json` with each task's `ok`, `result`, `session_id`, `legs`, and summed token `usage`. Then review `results.json` (Step 4). Full field docs are in the header of `scripts/orchestrator.js`.

## Step 4 — review and iterate (Claude's job)

Read each worker's output and **accept or fix it yourself** — you are the quality gate. To correct a worker, **resume its session** instead of restarting: pass its `session_id` back (`legged-run.sh --resume <id>` for anything non-trivial, a `tasks.json` entry with `"resume": "<id>"`, or `cursor_run` → `extraArgs: ["--resume", "<id>"]` for a quick nudge). The worker keeps its prior context, so "also handle the empty-input case" just works. Loop until every slice passes, then integrate.

## Model routing

- **`auto`** (default) — unlimited on paid Cursor plans, draws no quota. Use it for the bulk of execution.
- **`composer-2.5`** or a **`gpt-5.x-codex`** tier — heavier coding slices where Auto struggles. These draw the monthly pool.
- A specific strong model (Opus, Fable, GPT-5.x) — only for the single hardest slice; usually keep top-tier reasoning on Claude's side, not the fleet's. `cursor-agent --list-models` (needs auth) prints the live catalog.

## Cost & safety

- Prefer `auto`; track spend from each result's `usage` tokens. Keep on-demand spending **off** in Cursor billing so a run can never exceed the plan.
- No secrets in task text — it leaves the machine for Cursor's servers.
- Report honestly: if the fleet stalls, a worker errors, or quota is exhausted, say so; don't silently redo the work on Claude's quota.

## Context: making workers follow project conventions

Proven behavior of headless `cursor-agent`:
- It **reads `CLAUDE.md` and `AGENTS.md`** at the project root. Put your conventions there and every worker in that repo inherits them for free.
- Global `~/.cursor/rules` are **not** applied to headless runs — do not rely on them; use project files.
- Workers can use MCP servers listed in the project `.cursor/mcp.json` (or `~/.cursor/mcp.json`); add one if a slice must reach a database/API during execution.

## Setup

Requires the `cursor-delegate` plugin (this skill ships with it): the Cursor CLI installed (`curl https://cursor.com/install -fsS | bash`), a login or API key, and — for multiple seats — `~/.claude-deck/cursor/agent-keys.json`. See the plugin README.
