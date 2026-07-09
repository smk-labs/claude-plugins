#!/usr/bin/env node
'use strict';
// orchestrator.js — run a batch of self-contained tasks across a Cursor-agent
// fleet with a bounded concurrency pool. Zero deps (Node >=18). This is Mode B
// of the cursor-orchestrate skill: Fable (the caller) writes a tasks file and a
// review step; this script just executes the fan-out deterministically.
//
// Every task runs through legged-run.sh (the plugin's canonical runner) as a
// chain of short ~4-minute legs resumed on ONE cursor-agent session. Why:
// flaky networks (VPNs especially) kill any single stream older than ~5
// minutes, so a classic long run dies at minute ~6; legs make a drop cost one
// leg, never the task. Each result carries the final text, session_id, leg
// count, and summed token usage for review and iteration. Nothing here decides
// WHAT to build; the caller owns decomposition and acceptance.
//
// Perseverance: a task that stops without DONE-ALL (leg budget spent, wall-cap
// kill) but holds a saved session is NOT failed, only unfinished. After each
// pass the pool automatically reruns those tasks (legged-run resumes them from
// its state dir), up to --rounds passes total. Setup failures (no session was
// ever obtained: auth/CLI broken) are not retried. If rounds run out, rerunning
// the same command later continues from the same saved sessions — and tasks
// that already finished return their saved result instantly (legged-run keeps
// a done marker), so a rerun costs nothing for completed work.
//
// Crash safety: results.json is rewritten (atomically) after every finished
// task, so a killed run leaves a usable partial file; SIGINT/SIGTERM kill the
// whole fleet (no orphaned cursor-agent keeps spending quota) with state
// saved for the next rerun.
//
// Usage:
//   node orchestrator.js tasks.json [--concurrency 4] [--account NAME] \
//                        [--model auto] [--leg-minutes 4] [--max-legs 15] \
//                        [--rounds 2] [--spawn-gap 4] [--out results.json]
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
const ROUNDS = Math.max(1, Number(flag('--rounds', 2)) || 2);
const OUT = flag('--out', 'results.json');
const SPAWN_GAP_MS = Math.max(0, (Number(flag('--spawn-gap', 4)) || 0) * 1000);
const STATE_ROOT = path.resolve(path.dirname(path.resolve(OUT)), 'cursor-legs');

// Concurrent cursor-agent STARTUPS race on the macOS keychain (measured: 1 in
// 4 simultaneous starts dies with "Password not found" even with an API key in
// the env). Stagger task starts a few seconds apart so fleet launches don't
// collide; legged-run's own retry covers mid-run leg collisions.
let spawnQueue = Promise.resolve();
function staggered() {
  const turn = spawnQueue;
  spawnQueue = turn.then(() => new Promise((r) => setTimeout(r, SPAWN_GAP_MS)));
  return turn;
}

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

// Live children, so killing the orchestrator kills the whole fleet: without
// this, legged-run/cursor-agent processes would survive as orphans and keep
// spending quota after the pool is gone.
const live = new Set();
let aborting = false;
// Tasks are spawned detached (own process group), so one negative-pid kill
// takes down the whole chain: legged-run -> cursor-run supervisor ->
// cursor-agent. Killing only the direct child would orphan the in-flight leg.
function killTree(child, sig) {
  try { process.kill(-child.pid, sig || 'SIGTERM'); }
  catch (e) { try { child.kill(sig || 'SIGTERM'); } catch (e2) {} }
}
function abort(sig) {
  if (aborting) return;
  aborting = true;
  log(`received ${sig}: killing ${live.size} running task(s); state is saved, rerun the same command to resume`);
  for (const c of live) killTree(c);
  setTimeout(() => process.exit(130), 2000);
}
process.on('SIGINT', () => abort('SIGINT'));
process.on('SIGTERM', () => abort('SIGTERM'));

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
    const child = spawn(RUNNER, argv, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    // Relay leg progress live, prefixed per task.
    child.stderr.on('data', (d) => {
      for (const line of String(d).split('\n')) if (line.trim()) log(`  [${id}] ${line}`);
    });
    live.add(child);
    const timer = setTimeout(() => killTree(child), timeoutMs);
    child.on('error', (e) => {
      live.delete(child);
      clearTimeout(timer);
      resolve({ id: t.id, ok: false, error: e.message, wall_ms: Date.now() - started });
    });
    child.on('close', () => {
      live.delete(child);
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

// Unfinished-but-resumable: no DONE-ALL yet, but a session exists to resume
// (in the result, or persisted by legged-run in the task's state dir after a
// wall-cap kill). Setup failures never got a session and are not retried.
function resumable(r, t, i) {
  if (!r || r.ok) return false;
  if (r.session_id) return true;
  const id = String(t.id || 'task-' + i);
  try { return fs.existsSync(path.join(STATE_ROOT, id, 'session_id')); } catch (e) { return false; }
}

(async () => {
  const results = new Array(tasks.length);
  log(`fleet: ${tasks.length} tasks, concurrency ${CONCURRENCY}, model ${MODEL}${ACCOUNT ? ', account ' + ACCOUNT : ''}, legs ≤${MAX_LEGS}×${LEG_MINUTES}min, rounds ≤${ROUNDS}`);

  // Persist after every task (atomic rename): a killed run leaves a usable
  // partial results file, and finished work is never lost to a crash.
  function flushResults() {
    try {
      fs.writeFileSync(OUT + '.tmp', JSON.stringify(results.filter(Boolean), null, 2));
      fs.renameSync(OUT + '.tmp', OUT);
    } catch (e) { /* best effort */ }
  }

  async function runPass(indices) {
    let next = 0, done = 0;
    async function worker() {
      while (next < indices.length && !aborting) {
        const i = indices[next++];
        const t = tasks[i];
        const label = t.id || i;
        // Only real cursor-agent startups need the anti-race stagger; a task
        // whose state already holds a done marker returns instantly from disk.
        const isDone = (() => {
          try { return fs.existsSync(path.join(STATE_ROOT, String(t.id || 'task-' + i), 'done')); } catch (e) { return false; }
        })();
        if (!isDone) {
          await staggered();
          if (aborting) break;
        }
        log(`▸ start [${label}]`);
        results[i] = await runTask(t, i);
        done++;
        flushResults();
        const r = results[i];
        const tok = r.usage ? (r.usage.inputTokens || 0) + (r.usage.outputTokens || 0) : 0;
        log(`${r.ok ? '✓' : '✗'} [${label}] ${done}/${indices.length}${r.legs ? ` (${r.legs} legs)` : ''}${tok ? ` (${tok} tok)` : ''}${r.ok ? '' : ': ' + String(r.error || 'no DONE-ALL yet').slice(0, 120)}`);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, indices.length) }, worker));
  }

  let pending = tasks.map((_, i) => i);
  for (let round = 1; round <= ROUNDS && pending.length && !aborting; round++) {
    if (round > 1) log(`round ${round}/${ROUNDS}: resuming ${pending.length} unfinished task(s) from saved sessions`);
    await runPass(pending);
    pending = pending.filter((i) => resumable(results[i], tasks[i], i));
  }

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const okN = results.filter((r) => r && r.ok).length;
  const tok = results.reduce((s, r) => s + (r && r.usage ? (r.usage.inputTokens || 0) + (r.usage.outputTokens || 0) : 0), 0);
  log(`done: ${okN}/${tasks.length} ok, ${tok} tokens total, results -> ${OUT}`);
  if (pending.length) log(`still unfinished (resumable): ${pending.map((i) => tasks[i].id || i).join(', ')}. Rerun the same command to keep going; state under ${STATE_ROOT}`);
  process.exit(okN === tasks.length ? 0 : 1);
})();
