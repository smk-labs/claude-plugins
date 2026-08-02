# cursor-delegate

Delegate self-contained tasks to the **Cursor CLI** (`cursor-agent`) from inside Claude Code, so they run on your **Cursor subscription's quota** instead of Claude's. Claude stays the orchestrator; Cursor runs the slice.

Works with your single Cursor login out of the box. An optional account input targets a specific seat when you keep several.

> This is **agent calling, not a model-backend swap.** Cursor sells no Anthropic-shaped API for its subscription, and the Claude Desktop Code tab always uses your claude.ai account, so you can't point Claude's engine at Cursor. This runs the two side by side.

## What's inside

| Component | Role |
|-----------|------|
| `cursor_run` MCP tool | Structured call: `task` (required), `account`, `model`, `extraArgs`, `dryRun`. The interface for one **quick** task (< ~4 min). `model` also picks which quota pool the run spends: see Billing below. |
| `cursor-delegate` skill | Teaches Claude when/how to delegate one task, quick-vs-legged routing, and that `account` is optional. |
| `cursor-orchestrate` skill | Scales it up: Claude plans and reviews, a **fleet** of Cursor workers executes in parallel. Auto-picks the approach by size; say **"sub"** to force one worker or **"workflow"**/**"w"** to force the JS harness. |
| `cursor-worker` subagent | Owns one delegation end-to-end and reports back. |
| `scripts/cursor-run.sh` | The shared auth/invocation primitive everything calls: one cursor-agent run. Quick tasks only. |
| `scripts/legged-run.sh` | **The canonical runner for anything longer**: chains ~4-minute legs of `cursor-run.sh` on ONE resumed session until the worker prints `DONE-ALL`. Survives connection drops; rerun the same command to continue. |
| `scripts/orchestrator.js` | Zero-dep fleet runner (Mode B): a concurrency pool that runs **every task legged** from a `tasks.json` and writes `results.json` (each with `ok`, `result`, `session_id`, `legs`, summed token `usage`). Perseveres: tasks that stop without `DONE-ALL` are automatically resumed for extra passes (`--rounds`, default 2); rerunning the same command later continues from the saved sessions. |
| `assets/report-card.md` | The report-card contract workers follow to author their own completion report as readable card-block HTML (`*-card.html`). With the [readable](../readable) plugin (>= 4.6.0), the main agent renders that file as a chat widget with one ~50-token `card` call (`htmlFile` mode) — the report's HTML is written on Cursor's quota and never enters Claude's context. |
| `scripts/card-header.sh` | Stamps the standard status header onto a finished worker's card: the official Cursor logo (`cursor-icon.svg`, the verbatim cursor.com path in a ~700 B gradient wrapper) floated into the corner, plus "تمام شد کارگر Cursor — نشست … — … ثانیه — مدل …" from the run's footer facts. Idempotent; workers never write this line themselves. |
| `copy-writing-fa` skill | The one job with its own playbook: Persian web copy. Five stages, a writing rulebook, and per-stage model routing. See [Persian copywriting](#persian-copywriting) below. |
| `scripts/fa-lint.py` | The gate that skill writes against: a dependency-free Persian copy linter. Exit 0 or the draft does not ship. |

## Three ways to use it

- **One task** — ask "delegate X to cursor" (or call `cursor_run`). Best for a single self-contained slice.
- **A whole job** — ask "orchestrate X with a cursor fleet" (the `cursor-orchestrate` skill). Claude decomposes into vertical slices, fans them out across parallel Cursor workers, reviews each, iterates by resuming worker sessions, and integrates. Good for building a feature (or a whole app) fast on Cursor's quota while Claude keeps the architecture and design decisions.
- **Persian copy** — ask for a Persian article, product description or landing page (the `copy-writing-fa` skill). Same workers, but with a brief, a rulebook and a linter around them.

## Long tasks run legged — never one long stream

Measured on a real multi-hour build: flaky network paths (VPNs especially) kill any single cursor-agent stream that lives past **~5 minutes** — long workers died at minute ~6 with "Connection lost", three for three, while sub-3-minute tasks and plain HTTPS requests to the same server kept succeeding. Turning the VPN off wasn't an option (Cursor is unreachable without it).

So the plugin's canonical long-task runner is `legged-run.sh`: the task runs as **short ~4-minute legs on ONE cursor-agent session**. Each leg checkpoints (`PROGRESS:`/`NEXT:`) and exits before the network can kill it; the loop `--resume`s the same session (context preserved) until the worker prints `DONE-ALL`. A drop costs one leg, never the job.

```bash
# runs in legs until DONE-ALL; exit 1 = leg budget spent, rerun to continue
"$CLAUDE_PLUGIN_ROOT/scripts/legged-run.sh" --cwd /path/to/repo --model auto "…self-contained task…"
```

Leg state (per-leg JSON, `session_id`, `last_result.txt`) lives in `~/.claude-deck/cursor/legs/<id>`, so the run is resumable even after a crash. `--worktree` gives the worker a persistent git worktree (branch `legs/<id>`) for parallel-safe edits; `--json` prints a machine-readable summary; `--force` is always passed. The fleet runner (`orchestrator.js`) uses this for every task automatically.

## Stopping a fleet safely

Never `pkill -f legged-run`: it matches your own shell's command line and kills the whole fleet, and it orphans live `cursor-agent` legs that keep spending quota and can double-run on a server. The official stop is `legged-run.sh --stop --id <id>` (or `--state <dir>`). Killing the orchestrator pid group-kills its tree.

Optional network hardening (opt-in; unset = no change): `CURSOR_NET_PROBE_URL` makes legged-run curl-test download speed before the first leg and on hard failures; `CURSOR_NET_MIN_BPS` sets the minimum bytes/sec (default 102400); `CURSOR_TUNNEL_REVIVE` runs a shell command when the probe fails (e.g. restart a VPN script). The fleet runner accepts `--wait-online [URL]` (defaults to `CURSOR_NET_PROBE_URL`) to wait for connectivity before each round instead of burning tasks on a dead tunnel.

## Setup

1. Install the Cursor CLI:
   ```bash
   curl https://cursor.com/install -fsS | bash
   ```
2. Store Cursor API keys (Cursor dashboard → Integrations → API Keys) in `~/.claude-deck/cursor/agent-keys.json` (chmod 600), and name the **default** account:

   ```json
   { "work": "key_...", "personal": "key_...", "default": "work" }
   ```

   The `default` entry (an alias to another label, or a raw key) is what every run uses when no account is given. This makes auth deterministic — no dependence on a browser login that may be absent or expired. `account: "work"` (tool) or `--account work` (script) targets a specific seat; a plain `cursor-agent login` still works as a last-resort fallback.
3. Install this plugin from the `smk` marketplace.

## Usage

Just ask: **"delegate the parser tests to cursor"** — Claude calls `cursor_run` with your default account.

Or drive the script directly:

```bash
# dry-run prints the exact command with the key redacted
"$CLAUDE_PLUGIN_ROOT/scripts/cursor-run.sh" --model auto --dry-run "…self-contained task…"

# real run; -- passes extra flags straight to cursor-agent (approvals are automatic)
"$CLAUDE_PLUGIN_ROOT/scripts/cursor-run.sh" --account work --model auto "…task…"
```

## Persian copywriting

Ask for a Persian article or product description and the `copy-writing-fa` skill takes over: Cursor writes, a linter checks the Persian, and Claude only ships what passes. Claude keeps the brief, the angle and the acceptance gate.

### Why the models are split

Model routing here is measured, not guessed. A live bake-off ran seven Cursor models through the same two tasks: writing a copy pack (product description, article section, SEO, microcopy) and copy-editing a deliberately broken Persian draft.

| Stage | Model | Evidence |
|---|---|---|
| Write | `claude-opus-5-high` | Best prose. Varied rhythm, concrete images, correct coffee science. The only model that respected the word cap and the SEO character limits. |
| Audit | `gpt-5.6-sol-high` | Sharpest proofreader: found 50 errors in the broken draft, more than any other model. A weak writer though. |
| Bulk | `auto` | Free and quota-less on paid plans. Fine for volume drafts. |

The surprise: GPT is the best *proofreader*, not the best *writer*. In round one `gpt-5.6-sol-high` wrote metronomic, repetitive Persian and overran the brief by 37%. In round two it was untouchable. Gemini 3.1 Pro was typographically clean but had no editorial judgement: its rewrite kept the unverifiable "۲۴ ساعته" claim and the ad-cliché rhetorical question the brief asked it to cut.

### fa-lint

A Persian web-copy linter with no third-party dependencies.

```bash
python3 "$CLAUDE_PLUGIN_ROOT/scripts/fa-lint.py" content/mag/article.mdx
```

It enforces ZWNJ (نیم‌فاصله), Persian punctuation and digits, Arabic-letter slips, administrative words (جهت، می‌باشد، اقدام به...نمودن), ad clichés, formal-you, and sentence length. Errors exit 1; warnings are judgement calls. Code blocks, YAML frontmatter, JSX/MDX tags, links and URLs are masked out, so it runs straight over `.mdx`.

Validated against the bake-off corpus: 27 errors on the planted-error draft, clean on the site's published house-style article, and it independently caught the exact two flaws a human review had flagged in the Gemini sample.

### Does it read like a person wrote it?

fa-lint also measures the texture that separates human copy from filler, using thresholds calibrated on a real corpus rather than invented:

| Signal | Human article | Frontier models |
|---|---|---|
| Sentence-length variation (CV) | 0.61 | 0.17 to 0.44 |
| Repeated sentence openers, per sentence | 0.12 | 0.31 to 0.43 |
| Repeated 4-word phrases, per sentence | 0.04 | 0.04 to 0.26 |

The model a human reviewer independently described as "metronomic" scored lowest on variation, so the measure tracks the judgement rather than replacing it. Rhythm is only scored on prose of 18+ body sentences: product pages run 12 to 14 and are legitimately more uniform than articles, and judging them by the article yardstick flagged 29 of 79 good pages. Repetition counts hold up at lower sample sizes and keep the smaller gate.

A linter cannot taste prose. These checks catch the mechanical tells; the final call stays with a reader.

Caught in the wild: after a fleet ran a copy pass over the coffee site, every word-level error was gone, but four enriched product pages had crossed the 18-sentence threshold and come out metronomic (CV 0.25 to 0.28), and one article opened 14 sentences with the same word. Fixing spelling is easy to automate; keeping the rhythm human is the part that needs measuring.

### Voice is per project, never universal

`--voice informal` (default) warns on «شما»; `--voice formal` allows it, for a B2B product whose own voice doc says so. Mixing both in one file is flagged either way, because that is a defect in any house voice.

This matters most on a multi-repo pass. A consumer shop is right to say «تو» and an enterprise product is right to say «شما»; a fleet let loose will flatten one site's tone into another's. The project's own `BRAND.md` / `voice-tone.md` / `AGENTS.md` outranks this plugin's rulebook, always.

## Notes

- **Billing: two pools, not one.** Paid plans meter **first-party** models (`auto`, `composer-*`, `cursor-*`, run by Cursor itself) separately from **API** models (`claude-*`, `gpt-*`, bought from the provider and passed through). The Cursor account page shows them as two bars under "Included usage". The first-party bar is large; the API bar is small and empties fast, and running it dry looks like a network fault rather than a quota error. Route mechanical work to first-party and keep API-pool models for prose, judgment and review. The full rule (naming rule, measured scale, pre-flight probe, exhaustion signature, salvage pattern) lives in the `cursor-orchestrate` skill under "Model routing". To rule out surprise charges, turn off on-demand spending in Cursor's billing settings.
- **Self-contained tasks only:** `cursor-agent` starts with a blank context, so include file paths, the goal, and acceptance criteria in the task.
- **Runs close themselves:** `cursor-agent` sometimes never exits after printing its result. `cursor-run.sh` supervises every run: in JSON mode it kills the process ~1.5s after the result object appears (the run still exits 0 with full output), and `--timeout` (default 900s) hard-kills anything hung before a result. No delegation can hang open.
- **Resume beats restart:** every run yields a `session_id` (the `cursor_run` reply footer; `<state>/session_id` for legged runs). On any failure, harvest the partial output (`last_result.txt`, `leg-N.json`) and continue the same session (`--resume`) with a "continue where you left off" prompt — restart only when no session ever existed.
- **Workers run fully trusted, like Claude Code subagents:** every runner passes `--force --approve-mcps`, and setting `approvalMode: "unrestricted"` in `~/.cursor/cli-config.json` makes it machine-wide. Full file, shell, and MCP access, no approval prompts; tasks may carry credentials and do direct server work (deploys, SSH) when needed.
- **Context sync (verified):** headless workers read the repo-root `CLAUDE.md`/`AGENTS.md`, load the user's `~/.claude/skills` as agent skills, and see installed Claude plugins' MCP servers. The user-level `~/.claude/CLAUDE.md` reaches them through a symlink bridge, `~/AGENTS.md -> ~/.claude/CLAUDE.md`: cursor-agent applies `~/AGENTS.md` from its parent-dir walk as an always-on rule (git repos included), while `~/.claude/CLAUDE.md`, `~/.cursor/rules`, and `~/.cursor/AGENTS.md` are never read directly. `cursor-run.sh` creates the symlink automatically if it is missing, so every runner inherits the global manual with zero drift.
