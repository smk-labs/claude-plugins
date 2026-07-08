#!/usr/bin/env node
'use strict';
// orchestrator.js — run a batch of self-contained tasks across a Cursor-agent
// fleet with a bounded concurrency pool. Zero deps (Node >=18). This is Mode B
// of the cursor-orchestrate skill: Fable (the caller) writes a tasks file and a
// review step; this script just executes the fan-out deterministically.
//
// Each task shells cursor-run.sh (the plugin's single auth/invocation
// primitive) with JSON output, so every result carries session_id + token usage
// for review and iteration. Nothing here decides WHAT to build; the caller owns
// decomposition and acceptance.
//
// Usage:
//   node orchestrator.js tasks.json [--concurrency 4] [--account NAME] \
//                        [--model auto] [--out results.json]
//
// tasks.json: a non-empty array of
//   { "id": "api",                       // label for logs/results
//     "prompt": "…fully self-contained…",// paths + goal + acceptance criteria
//     "model"?: "auto",                  // overrides --model for this task
//     "account"?: "work",                // overrides --account for this task
//     "cwd"?: "/abs/path",               // run directory
//     "worktree"?: true,                 // isolate edits in a git worktree
//     "resume"?: "<session_id>",         // continue a prior worker's session
//     "extraArgs"?: ["..."] }            // extra flags to cursor-agent
//
// Exit code: 0 if every task succeeded, 1 otherwise.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function flag(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function log(m) { process.stderr.write(m + '\n'); }

const tasksFile = process.argv[2];
if (!tasksFile || tasksFile.slice(0, 2) === '--') {
  log('usage: node orchestrator.js tasks.json [--concurrency N] [--account NAME] [--model auto] [--out results.json]');
  process.exit(2);
}
const CONCURRENCY = Math.max(1, Number(flag('--concurrency', 4)) || 4);
const ACCOUNT = flag('--account', '');
const MODEL = flag('--model', 'auto');
const OUT = flag('--out', 'results.json');

function resolveRunner() {
  const cands = [
    process.env.CURSOR_RUN_BIN,
    path.join(__dirname, 'cursor-run.sh'),
    path.join(os.homedir(), '.claude-deck', 'bin', 'cursor-run.sh'),
  ].filter(Boolean);
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch (e) { /* keep looking */ } }
  return null;
}
const RUNNER = resolveRunner();
if (!RUNNER) { log('cursor-run.sh not found (set CURSOR_RUN_BIN)'); process.exit(2); }

let tasks;
try { tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8')); }
catch (e) { log('bad tasks file: ' + e.message); process.exit(2); }
if (!Array.isArray(tasks) || !tasks.length) { log('tasks.json must be a non-empty array'); process.exit(2); }

function runTask(t) {
  return new Promise((resolve) => {
    const argv = ['--json', '--model', t.model || MODEL];
    const acct = t.account || ACCOUNT;
    if (acct) argv.push('--account', acct);
    if (t.cwd) argv.push('--cwd', t.cwd);
    argv.push(String(t.prompt));
    // Everything after -- goes straight to cursor-agent. --force lets a headless
    // run edit files without stalling on the approval prompt.
    const extra = ['--force'];
    if (t.worktree) extra.push('-w');
    if (t.resume) extra.push('--resume', String(t.resume));
    if (Array.isArray(t.extraArgs)) extra.push(...t.extraArgs.map(String));
    argv.push('--', ...extra);

    const started = Date.now();
    execFile(RUNNER, argv, { maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000 }, (err, stdout, stderr) => {
      const wall = Date.now() - started;
      // cursor-agent --output-format json prints one JSON object; take the last
      // line that parses (defensive against any leading noise).
      let parsed = null;
      const lines = (stdout || '').trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try { parsed = JSON.parse(lines[i]); break; } catch (e) { /* not this line */ }
      }
      if (parsed && parsed.result !== undefined) {
        resolve({ id: t.id, ok: !parsed.is_error, result: parsed.result, session_id: parsed.session_id, usage: parsed.usage || null, duration_ms: parsed.duration_ms, wall_ms: wall });
      } else {
        resolve({ id: t.id, ok: false, error: (stderr || '').trim() || (err && err.message) || 'no JSON result', wall_ms: wall });
      }
    });
  });
}

(async () => {
  const results = new Array(tasks.length);
  let next = 0, done = 0;
  log(`fleet: ${tasks.length} tasks, concurrency ${CONCURRENCY}, model ${MODEL}${ACCOUNT ? ', account ' + ACCOUNT : ''}`);
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      const t = tasks[i];
      const label = t.id || i;
      log(`▸ start [${label}]`);
      results[i] = await runTask(t);
      done++;
      const r = results[i];
      const tok = r.usage ? (r.usage.inputTokens || 0) + (r.usage.outputTokens || 0) : 0;
      log(`${r.ok ? '✓' : '✗'} [${label}] ${done}/${tasks.length}${tok ? ` (${tok} tok)` : ''}${r.ok ? '' : ' — ' + String(r.error).slice(0, 100)}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const okN = results.filter((r) => r && r.ok).length;
  const tok = results.reduce((s, r) => s + (r && r.usage ? (r.usage.inputTokens || 0) + (r.usage.outputTokens || 0) : 0), 0);
  log(`done: ${okN}/${tasks.length} ok, ${tok} tokens total, results -> ${OUT}`);
  process.exit(okN === tasks.length ? 0 : 1);
})();
