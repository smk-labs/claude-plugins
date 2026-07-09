#!/usr/bin/env node
// cursor-mcp: a tiny, dependency-free MCP server that exposes ONE tool,
// `cursor_run`, which delegates a self-contained task to a Cursor account via
// cursor-agent. It is the structured-tool alternative to the cursor-delegate
// skill / cursor-worker subagent: same behavior, same wrapper underneath
// (cursor-run.sh), just surfaced as an MCP tool for clients that prefer a typed
// call over a Bash invocation.
//
// Transport: MCP stdio (newline-delimited JSON-RPC 2.0). Node >=18, stdlib only.
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { execFile } = require('child_process');

const SERVER_INFO = { name: 'cursor-mcp', version: '1.5.2' };
const DEFAULT_PROTOCOL = '2025-06-18';

// Locate cursor-run.sh: explicit override, canonical install path, then a
// sibling of this file (running straight from the repo checkout).
function resolveRunner() {
  const candidates = [
    process.env.CURSOR_RUN_BIN,
    path.join(os.homedir(), '.claude-deck', 'bin', 'cursor-run.sh'),
    path.join(__dirname, '..', 'cursor-run.sh'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) { /* keep looking */ }
  }
  return null;
}

const TOOL = {
  name: 'cursor_run',
  description:
    'Delegate ONE self-contained QUICK coding/research task (under ~4 minutes of agent work) to a ' +
    "Cursor account via cursor-agent, running on the Cursor subscription's quota instead of Claude's. " +
    'Anything that could run longer MUST NOT use this tool: long single streams die at ~5-6 minutes ' +
    "on flaky networks/VPNs — run those with the plugin's legged runner (scripts/legged-run.sh, see " +
    'the cursor-delegate skill), which chains ~4-minute legs on one resumed session. The task must be ' +
    'fully self-contained (cursor-agent starts with a blank context): include file paths, the goal, ' +
    'and acceptance criteria. Auth is deterministic: the "default" entry of ' +
    '~/.claude-deck/cursor/agent-keys.json picks the API key when account is omitted (no dependence ' +
    'on a browser login). Every reply ends with a [cursor …] footer carrying the session_id: SAVE IT. ' +
    'To continue or fix that same worker with its full context, call this tool again with ' +
    'extraArgs: ["--resume", "<session_id>"] — always prefer resuming over restarting, so no work is ' +
    'lost. Runs self-terminate (the process is killed right after its result; hung runs die at a hard ' +
    'timeout), so a call can never hang open. Cursor "auto" model is unlimited on paid plans; named ' +
    'models draw the monthly pool. The worker runs fully trusted, like a Claude Code subagent: file ' +
    'edits, shell, and MCPs are auto-approved (--force --approve-mcps always passed), and the task ' +
    'may include credentials or keys when the job needs them (e.g. a direct server deploy).',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The self-contained task text.' },
      account: { type: 'string', description: 'Account label from agent-keys.json. Omit to use the keys file\'s "default" entry.' },
      model: { type: 'string', description: 'Model for cursor-agent, e.g. "auto" (unlimited) or a specific model. Omit for Cursor default.' },
      json: { type: 'boolean', description: 'Return the raw result JSON object (result, session_id, usage, duration_ms) instead of the formatted text.' },
      cwd: { type: 'string', description: 'Directory to run in. Defaults to the server process cwd.' },
      dryRun: { type: 'boolean', description: 'Print the exact command (key redacted) without executing.' },
      extraArgs: { type: 'array', items: { type: 'string' }, description: 'Extra flags passed straight to cursor-agent (after --).' },
    },
    required: ['task'],
    additionalProperties: false,
  },
};

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function reply(id, result) {
  send({ jsonrpc: '2.0', id: id, result: result });
}
function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id: id, error: { code: code, message: message } });
}

// Last line of `text` that parses as a JSON object, or null.
function lastJson(text) {
  const lines = (text || '').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t || t[0] !== '{') continue;
    try { return JSON.parse(t); } catch (e) { /* not this line */ }
  }
  return null;
}

function runCursor(args) {
  return new Promise((resolve) => {
    const runner = resolveRunner();
    if (!runner) {
      return resolve({ ok: false, text: 'cursor-run.sh not found. Set CURSOR_RUN_BIN or install it to ~/.claude-deck/bin/cursor-run.sh.' });
    }
    // Always run --json underneath: it gives cursor-run its kill-on-result
    // signal (cursor-agent sometimes never exits on its own) and carries the
    // session_id every reply must surface so the caller can --resume later.
    const argv = ['--json', '--timeout', '480'];
    if (args.account) argv.push('--account', String(args.account));
    if (args.model) argv.push('--model', String(args.model));
    if (args.cwd) argv.push('--cwd', String(args.cwd));
    if (args.dryRun) argv.push('--dry-run');
    argv.push(String(args.task));
    if (Array.isArray(args.extraArgs) && args.extraArgs.length) {
      argv.push('--');
      for (const a of args.extraArgs) argv.push(String(a));
    }
    // 10 min outer cap; cursor-run's own --timeout 480 fires first, so a hung
    // run still returns whatever it produced. Big buffer for verbose output.
    let retried = false;
    const exec = () => execFile(runner, argv, { maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => {
      const out = (stdout || '').trim();
      const errText = (stderr || '').trim();
      // Concurrent cursor-agent startups race on the macOS keychain (measured);
      // one decorrelated retry turns that transient into a non-event.
      if (err && !out && !retried && /Security command failed|Password not found|code: 45/.test(errText)) {
        retried = true;
        return setTimeout(exec, 4000 + Math.floor(Math.random() * 6000));
      }
      if (err && !out) {
        return resolve({ ok: false, text: errText || ('cursor-run failed: ' + err.message) });
      }
      if (args.dryRun) return resolve({ ok: !err, text: out || '(no output)' });
      const parsed = lastJson(out);
      if (!parsed || parsed.result === undefined) {
        // No result object — a real failure. Show everything for diagnosis.
        const text = errText && errText !== out ? out + '\n\n[stderr]\n' + errText : out;
        return resolve({ ok: false, text: (text || '(no output)') + '\n\n[cursor: no result object — if a session_id appeared above, resume it with extraArgs ["--resume", "<session_id>"] instead of restarting]' });
      }
      if (args.json) return resolve({ ok: !parsed.is_error, text: JSON.stringify(parsed) });
      const u = parsed.usage || {};
      const footer = '[cursor: session_id ' + (parsed.session_id || 'unknown')
        + ' | ' + (u.inputTokens || 0) + ' in / ' + (u.outputTokens || 0) + ' out tokens'
        + ' | ' + Math.round((parsed.duration_ms || 0) / 1000) + 's'
        + ' — to continue this worker with its context intact, pass extraArgs ["--resume", "' + (parsed.session_id || '') + '"]]';
      resolve({ ok: !parsed.is_error, text: String(parsed.result || '(empty result)') + '\n\n' + footer });
    });
    exec();
  });
}

async function handle(msg) {
  const { id, method, params } = msg;
  // Notifications (no id) never get a response.
  if (id === undefined || id === null) return;

  switch (method) {
    case 'initialize': {
      const requested = params && params.protocolVersion;
      return reply(id, {
        protocolVersion: typeof requested === 'string' ? requested : DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: [TOOL] });
    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      if (name !== 'cursor_run') return replyError(id, -32602, 'unknown tool: ' + name);
      if (!args || typeof args.task !== 'string' || !args.task.trim()) {
        return reply(id, { content: [{ type: 'text', text: 'task is required' }], isError: true });
      }
      const res = await runCursor(args);
      return reply(id, { content: [{ type: 'text', text: res.text }], isError: !res.ok });
    }
    default:
      return replyError(id, -32601, 'method not found: ' + method);
  }
}

// Don't exit the moment stdin closes: a tool call may still be running
// (execFile is async). Track in-flight handlers and exit only once they have
// all settled, so no response is dropped if the client closes the pipe mid-call.
let pending = 0;
let closed = false;
function maybeExit() {
  if (closed && pending === 0) process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (e) {
    return; // ignore non-JSON noise
  }
  pending++;
  Promise.resolve(handle(msg))
    .catch((e) => {
      if (msg && msg.id != null) replyError(msg.id, -32603, 'internal error: ' + (e && e.message));
    })
    .then(() => {
      pending--;
      maybeExit();
    });
});
rl.on('close', () => {
  closed = true;
  maybeExit();
});
