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

const SERVER_INFO = { name: 'cursor-mcp', version: '1.0.0' };
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
    'Delegate ONE self-contained coding/research task to a Cursor account via cursor-agent, ' +
    "running on the Cursor subscription's quota instead of Claude's. The task must be fully " +
    'self-contained (cursor-agent starts with a blank context): include file paths, the goal, ' +
    'and acceptance criteria. Cursor "auto" model is unlimited on paid plans; named models draw ' +
    'the monthly pool. File-editing tasks need an approval flag via extraArgs (e.g. ["--force"]).',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The self-contained task text.' },
      account: { type: 'string', description: 'Account label from agent-keys.json. Omit to use the CURSOR_API_KEY env var.' },
      model: { type: 'string', description: 'Model for cursor-agent, e.g. "auto" (unlimited) or a specific model. Omit for Cursor default.' },
      json: { type: 'boolean', description: 'Request JSON output from cursor-agent instead of text.' },
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

function runCursor(args) {
  return new Promise((resolve) => {
    const runner = resolveRunner();
    if (!runner) {
      return resolve({ ok: false, text: 'cursor-run.sh not found. Set CURSOR_RUN_BIN or install it to ~/.claude-deck/bin/cursor-run.sh.' });
    }
    const argv = [];
    if (args.account) argv.push('--account', String(args.account));
    if (args.model) argv.push('--model', String(args.model));
    if (args.json) argv.push('--json');
    if (args.cwd) argv.push('--cwd', String(args.cwd));
    if (args.dryRun) argv.push('--dry-run');
    argv.push(String(args.task));
    if (Array.isArray(args.extraArgs) && args.extraArgs.length) {
      argv.push('--');
      for (const a of args.extraArgs) argv.push(String(a));
    }
    // 10 min: agent runs can be long. Big buffer for verbose output.
    execFile(runner, argv, { maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => {
      const out = (stdout || '').trim();
      const errText = (stderr || '').trim();
      if (err && !out) {
        return resolve({ ok: false, text: errText || ('cursor-run failed: ' + err.message) });
      }
      // Surface stderr alongside stdout when both exist (cursor-agent warnings).
      const text = errText && errText !== out ? out + '\n\n[stderr]\n' + errText : out;
      resolve({ ok: !err, text: text || '(no output)' });
    });
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
