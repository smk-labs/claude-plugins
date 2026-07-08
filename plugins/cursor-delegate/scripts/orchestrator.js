#!/usr/bin/env node
'use strict';
// orchestrator.js — run a batch of self-contained tasks across a Cursor-agent
// fleet with a bounded concurrency pool. Zero deps (Node >=18). This is Mode B
// of the cursor-orchestrate skill: Fable (the caller) writes a tasks file and a
// review step; this script just executes the fan-out deterministically.
//
// Every task runs through legged-run.sh — the plugin's canonical runner — as a
// chain of short ~4-minute legs resumed on ONE cursor-agent session. Why:
// flaky networks (VPNs especially) kill any single stream older than ~5
// minutes, so a classic long run dies at minute ~6; legs make a drop cost one
// leg, never the task. Each result carries the final text, session_id, leg
// count, and summed token usage for review and iteration. Nothing here decides
// WHAT to build; the caller owns decomposition and acceptance.
//
// Usage:
//   node orchestrator.js tasks.json [--concurrency 4] [--account NAME] \
//                        [--model auto] [--leg-minutes 4] [--max-legs 15] \
//                        [--out results.json]
//
// tasks.json: a non-empty array of
//   { "id": "api",                       // label for logs/results/state dir
//     "prompt": "…fully self-contained…",// paths + goal + acceptance criteria
//     "model"?: "auto",                  // overrides --model for this task
//     "account"?: "work",                // overrides --account for this task
//     "cwd"?: "/abs/path",               // run directory
//     "worktree"?: true,                 // persistent git worktree beside the repo at cwd
//     "resume"?: "<session_id>",         // continue a prior worker's session
//     "legMinutes"?: 4,                  // focused work per leg
//     "maxLegs"?: 15,                    // leg budget for this task
//     "extraArgs"?: ["..."] }            // extra flags to cursor-agent (--force is automatic)
//
// Task state (legs, session id) lives under <out dir>/cursor-legs/<id>, so
// rerunning the same command resumes unfinished tasks instead of restarting.
// Exit code: 0 if every task printed DONE-ALL, 1 otherwise.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function flag(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function log(m) { process.stderr.write(m + '\n'); }

const tasksFile = process.argv[2];
if (!tasksFile || tasksFile.slice(0, 2) === '--') {
  log('usage: node orchestrator.js tasks.json [--concurrency N] [--account NAME] [--model auto] [--leg-minutes 4] [--max-legs 15] [--out results.json]');
  process.exit(2);
}
const CONCURRENCY = Math.max(1, Number(flag('--concurrency', 4)) || 4);
const ACCOUNT = flag('--account', '');
const MODEL = flag('--model', 'auto');
const LEG_MINUTES = Math.max(1, Number(flag('--leg-minutes', 4)) || 4);
const MAX_LEGS = Math.max(1, Number(flag('--max-legs', 15)) || 15);
const OUT = flag('--out', 'results.json');
const STATE_ROOT = path.resolve(path.dirname(path.resolve(OUT)), 'cursor-legs');

function resolveRunner() {
  const cands = [
    process.env.CURSOR_LEGGED_BIN,
    path.join(__dirname, 'legged-run.sh'),
    path.join(os.homedir(), '.claude-deck', 'bin', 'legged-run.sh'),
  ].filter(Boolean);
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch (e) { /* keep looking */ } }
  return null;
}
const RUNNER = resolveRunner();
if (!RUNNER) { log('legged-run.sh not found (set CURSOR_LEGGED_BIN)'); process.exit(2); }

let tasks;
try { tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8')); }
catch (e) { log('bad tasks file: ' + e.message); process.exit(2); }
if (!Array.isArray(tasks) || !tasks.length) { log('tasks.json must be a non-empty array'); process.exit(2); }

function runTask(t, index) {
  return new Promise((resolve) => {
    const id = String(t.id || 'task-' + index);
    const legMinutes = Math.max(1, Number(t.legMinutes) || LEG_MINUTES);
    const maxLegs = Math.max(1, Number(t.maxLegs) || MAX_LEGS);
    const argv = [
      '--json', '--model', t.model || MODEL, '--id', id,
      '--leg-minutes', String(legMinutes), '--max-legs', String(maxLegs),
      '--state', path.join(STATE_ROOT, id),
    ];
    const acct = t.account || ACCOUNT;
    if (acct) argv.push('--account', acct);
    if (t.cwd) argv.push('--cwd', t.cwd);
    if (t.worktree) argv.push('--worktree');
    if (t.resume) argv.push('--resume', String(t.resume));
    argv.push(String(t.prompt));
    if (Array.isArray(t.extraArgs) && t.extraArgs.length) argv.push('--', ...t.extraArgs.map(String));

    const started = Date.now();
    // Whole-task wall cap: legged-run already hard-caps each leg at legMinutes+4.
    const timeoutMs = maxLegs * (legMinutes + 5) * 60 * 1000;
    const child = spawn(RUNNER, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    // Relay leg progress live, prefixed per task.
    child.stderr.on('data', (d) => {
      for (const line of String(d).split('\n')) if (line.trim()) log(`  [${id}] ${line}`);
    });
    const timer = setTimeout(() => { try { child.kill(); } catch (e) {} }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ id: t.id, ok: false, error: e.message, wall_ms: Date.now() - started });
    });
    child.on('close', () => {
      clearTimeout(timer);
      const wall = Date.now() - started;
      // legged-run --json prints one summary object; take the last line that parses.
      let parsed = null;
      const lines = (stdout || '').trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try { parsed = JSON.parse(lines[i]); break; } catch (e) { /* not this line */ }
      }
      if (parsed && parsed.result !== undefined) {
        resolve({ id: t.id, ok: !!parsed.ok, result: parsed.result, session_id: parsed.session_id, legs: parsed.legs, usage: parsed.usage || null, wall_ms: wall });
      } else {
        resolve({ id: t.id, ok: false, error: 'no JSON summary from legged-run (state: ' + path.join(STATE_ROOT, id) + ')', wall_ms: wall });
      }
    });
  });
}

(async () => {
  const results = new Array(tasks.length);
  let next = 0, done = 0;
  log(`fleet: ${tasks.length} tasks, concurrency ${CONCURRENCY}, model ${MODEL}${ACCOUNT ? ', account ' + ACCOUNT : ''}, legs ≤${MAX_LEGS}×${LEG_MINUTES}min`);
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      const t = tasks[i];
      const label = t.id || i;
      log(`▸ start [${label}]`);
      results[i] = await runTask(t, i);
      done++;
      const r = results[i];
      const tok = r.usage ? (r.usage.inputTokens || 0) + (r.usage.outputTokens || 0) : 0;
      log(`${r.ok ? '✓' : '✗'} [${label}] ${done}/${tasks.length}${r.legs ? ` (${r.legs} legs)` : ''}${tok ? ` (${tok} tok)` : ''}${r.ok ? '' : ' — ' + String(r.error || 'no DONE-ALL, rerun to continue').slice(0, 120)}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const okN = results.filter((r) => r && r.ok).length;
  const tok = results.reduce((s, r) => s + (r && r.usage ? (r.usage.inputTokens || 0) + (r.usage.outputTokens || 0) : 0), 0);
  log(`done: ${okN}/${tasks.length} ok, ${tok} tokens total, results -> ${OUT}`);
  process.exit(okN === tasks.length ? 0 : 1);
})();
