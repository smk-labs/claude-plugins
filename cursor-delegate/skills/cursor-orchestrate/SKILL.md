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

Two guarantees every runner gives you: **auth is deterministic** (with no `account`, the `default` entry of `~/.claude-deck/cursor/agent-keys.json` supplies the API key — no dependence on a browser login), and **runs close themselves** (the process is killed ~1.5s after its result object; hung runs die at a hard timeout — a worker can never hang a turn open).

**Sandbox off for every runner invocation, and don't fear keychain noise.** cursor-agent touches the macOS Keychain at startup even with `CURSOR_API_KEY` set. Sandboxed Bash kills it every time (`Security command failed: … code: 45`) — run `legged-run.sh`/`orchestrator.js`/`cursor-run.sh` with `dangerouslyDisableSandbox: true`. Concurrent startups also race on the keychain (measured: 1 in 4 simultaneous starts dies with `Password not found`); that is self-healing — legs retry with a random pause and the fleet runner staggers startups (`--spawn-gap`, default 4s). Neither error means auth is broken.

### Mode A-simple
One quick task → the `cursor_run` tool (or the `cursor-worker` subagent). One long task → the legged runner:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/legged-run.sh" --cwd <repo> "…self-contained task…"
```

### Mode A-fan-out
Quick slices: several `cursor_run` calls **in a single turn** so they run concurrently (proven: multiple cursor-agent runs on one account run in parallel fine). Long slices: one `legged-run.sh` per slice via Bash `run_in_background`. For slices that **edit files in the same repo**, give each legged run `--worktree` (persistent git worktree, branch `legs/<id>`) or disjoint directories, so they never collide. Collect all results, then go to Step 4.

**Persevere on exit `1`.** A legged run that exits `1` is unfinished, not failed: its leg budget ran out with the session saved. Rerun the exact same command and it resumes where it stopped. Keep resuming until `DONE-ALL` or a real blocker (auth, quota); only then report the stall.

**A run of consecutive `hard failure (no result, no session)` has a name: quota exhaustion.** That line is all the console shows, so read `<out dir>/cursor-legs/*/leg-*.err` before blaming the network. If it says usage limit (or `Cannot use this model` with an empty list), stop the fan-out and tell the user which pool is empty and when it resets (see "Model routing"). Never silently fall back to Claude's own quota.

**Stop safely.** Official stop: `legged-run.sh --stop --id <id>`. Never `pkill -f legged-run` (matches your shell, orphans live legs, risks parallel deploys). Optional: `CURSOR_NET_PROBE_URL` / `CURSOR_NET_MIN_BPS` / `CURSOR_TUNNEL_REVIVE` for legged-run; orchestrator `--wait-online [URL]` waits for connectivity before each round.

**Resume beats restart, in every failure mode.** Any worker that ever produced a `session_id` (the `cursor_run` reply footer, `results.json`, or `<state>/session_id`) can be continued with its full context: harvest its partial output first (`last_result.txt`, `leg-N.json`), then resume with a continue-style prompt ("Continue exactly where you left off; finish the remaining work"). Restart from scratch only when no session ever existed (auth/CLI setup failure). Never let a worker's done-but-unreported work go to waste.

### Mode B — the JS harness
Write a `tasks.json` and run the bundled fleet runner (it executes **every task legged** through `legged-run.sh`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/orchestrator.js" tasks.json \
  --account <name> --concurrency 4 --model auto --out results.json
```

`tasks.json` is an array of `{ id, prompt, model?, account?, cwd?, worktree?, resume?, legMinutes?, maxLegs?, extraArgs? }`. The runner pools the fleet, passes `--force` automatically, and keeps each task's leg state under `<out dir>/cursor-legs/<id>`. It perseveres on its own: any task that stops without `DONE-ALL` but holds a saved session is automatically resumed in extra passes (`--rounds`, default 2); setup failures (auth/CLI broken, no session ever) are not retried. It writes `results.json` with each task's `ok`, `result`, `session_id`, `legs`, and summed token `usage`. If tasks are still unfinished when rounds run out, rerun the same command: it resumes them from the same saved sessions. Then review `results.json` (Step 4). Full field docs are in the header of `scripts/orchestrator.js`.

### Fleet report cards (live progress widgets)

When the readable `card` tool is available (`mcp__readable-card__card`, readable >= 4.6.0), give every slice its own report-card path (`~/.claude-deck/cursor/cards/<id>-card.html`) plus the contract pointer from the cursor-delegate skill's "Report cards" section (`${CLAUDE_PLUGIN_ROOT}/assets/report-card.md`). As each background run's completion notification fires, stamp the status header (`"${CLAUDE_PLUGIN_ROOT}/scripts/card-header.sh" <path> <session_id> <seconds> <model>` — Cursor logo + "تمام شد" line, idempotent), then make one `card` call with `htmlFile: "<path>"` — the finished worker's report pops up as a widget mid-chat while the rest of the fleet keeps running, and the HTML never touches Claude's context (the worker authored it on Cursor's quota). Acceptance still happens on the worker's actual output (`results.json` / chat result), never on the card.

## Step 4 — review and iterate (Claude's job)

Read each worker's output and **accept or fix it yourself** — you are the quality gate. To correct a worker, **resume its session** instead of restarting: pass its `session_id` back (`legged-run.sh --resume <id>` for anything non-trivial, a `tasks.json` entry with `"resume": "<id>"`, or `cursor_run` → `extraArgs: ["--resume", "<id>"]` for a quick nudge). The worker keeps its prior context, so "also handle the empty-input case" just works. Loop until every slice passes, then integrate.

## Model routing

This section is the plugin's single source of truth on quota. The other files point here.

### Two pools, not one

Paid Cursor plans meter two allowances separately. The Cursor account page shows them as two bars under "Included usage":

- **First-party**: models Cursor runs itself. Cheap for Cursor, so the bar is large.
- **API**: models Cursor buys from Anthropic, OpenAI and others and passes through. Every call has a real dollar cost, so this bar empties fast.

**Read the pool off the model id.** An id starting with `claude-` or `gpt-` is API pool. `auto`, `composer-*` and `cursor-*` are first-party. The catalog changes; the naming rule holds. `cursor-agent --list-models` (needs auth) prints the live list.

One observation, on an Ultra account on 2026-07-27, not a permanent guarantee: the API bar hit 100% used after roughly 389k output tokens of Opus 5 work. The first-party bar then carried about 1.66M output tokens across 96 articles and was still open at the end. Probed at that moment, `auto`, `composer-2.5`, `composer-2.5-fast` and `cursor-grok-4.5-low/medium/high` all answered; `claude-opus-5-high`, `claude-opus-5-medium`, `claude-opus-4-8-thinking-high`, `claude-fable-5-thinking-high`, `gpt-5.2`, `gpt-5.3-codex-high`, `gpt-5.5-high` and `gpt-5.6-sol-high` all returned a usage limit.

### Route by kind of work

- **Mechanical and structural work goes first-party.** File edits, refactors, research gathering, running tools and linters until they pass. `auto` for the bulk; `composer-2.5` or `cursor-grok-4.5-high` for heavier coding slices.
- **Prose, judgment, architecture and review keep the API-pool models**, spent deliberately, because that budget is small. Usually keep top-tier reasoning on Claude's side, not the fleet's.

First-party is not a free lunch. A blind judge (authoring model hidden) scored real 2000-word Persian articles against two reference articles written by Opus 5: `cursor-grok-4.5-high` 36.5/50, `composer-2.5` 36/50, `auto` 30.5/50. All three sat below the Opus references, which were denser with numbers, took clearer positions, and repeated themselves less.

### Probe before a big fan-out

Before any fan-out larger than a handful of tasks on a named API-pool model, run the probe and report the result:

```bash
cursor-agent --force --model claude-opus-5-high -p "Reply with exactly: PONG"
```

`PONG` means the API bar has room. Anything else means route the fan-out to first-party or tell the user. It costs almost nothing and it is the difference between a clean run and fifty dead tasks.

### When a pool runs dry

The real message appears only in the per-leg error files, `<out dir>/cursor-legs/<id>/leg-*.err`:

```
ActionRequiredError: You've hit your usage limit for Opus ... Your usage
limits will reset when your monthly cycle ends on 7/28/2026.
```

Three traps:

1. The same condition can instead surface as `Cannot use this model: <model>. Available models:` with an **empty** list. That reads like a bad model name or a proxy fault. It is not; it is the quota block.
2. On screen you only get `hard failure (no result, no session)`. Dozens of tasks fail in a row and nothing says "quota".
3. A plain internet outage produces a similar-looking pile of failures (`Failed to reach the Cursor API...`). Tell them apart by the times on the `leg-*.err` files: an outage clusters every error into one window, while quota exhaustion keeps failing from the moment it starts and never recovers.

**Salvage instead of stopping.** When the API pool dies mid-job, first-party models can still do the mechanical pass now, and the API-pool model does a much cheaper editing pass later, once the cycle resets. That turns a hard stop into a delay.

## Cost, trust & honesty

- Prefer `auto`; track spend from each result's `usage` tokens. Keep on-demand spending **off** in Cursor billing so a run can never exceed the plan.
- **Workers are fully trusted, exactly like Claude Code subagents.** Full file, shell, and MCP access, zero approval prompts (`--force --approve-mcps` on every run; `approvalMode: "unrestricted"` on the machine). Slices may carry credentials and keys and may deploy straight to servers (SSH, production config) when the job calls for it. Don't withhold a secret a slice genuinely needs.
- Report honestly: if the fleet stalls, a worker errors, or quota is exhausted, say so; don't silently redo the work on Claude's quota.

## Context: making workers follow project conventions

Proven behavior of headless `cursor-agent` (verified live on this machine):
- It **reads `CLAUDE.md` and `AGENTS.md`** at the project root. Put your conventions there and every worker in that repo inherits them for free.
- It **loads the user's `~/.claude/skills` as agent skills** and **sees the MCP servers of installed Claude plugins**, natively. The Claude side's skills and plugin MCPs are already in sync; nothing to copy.
- The global operating manual reaches workers via the `~/AGENTS.md -> ~/.claude/CLAUDE.md` symlink: cursor-agent applies `~/AGENTS.md` from its parent-dir walk as an always-on rule (git repos included). `~/.cursor/rules` and `~/.cursor/AGENTS.md` are never read. Before fanning out, ensure the bridge exists: `[ -e ~/AGENTS.md ] || ln -s ~/.claude/CLAUDE.md ~/AGENTS.md`.
- Workers can also use MCP servers listed in the project `.cursor/mcp.json` (or `~/.cursor/mcp.json`); add one if a slice must reach a database/API during execution.

## Setup

Requires the `cursor-delegate` plugin (this skill ships with it): the Cursor CLI installed (`curl https://cursor.com/install -fsS | bash`) and API keys in `~/.claude-deck/cursor/agent-keys.json` (chmod 600) with a `default` entry naming the account every run uses when none is given — e.g. `{ "tech-c": "key_...", "default": "tech-c" }`. A browser `cursor-agent login` is only a last-resort fallback. See the plugin README.
