'use strict';
/**
 * The wire: newline-delimited JSON-RPC 2.0 over stdio, no SDK, no packages.
 *
 * It owns both directions, and the reason that matters is the ONE rule at the
 * top of receive(): a message carrying `result` or `error` for an id WE issued
 * is a response to us, and it is routed to its callback instead of being
 * treated as an incoming request. Do NOT discriminate on the absence of
 * `method`: at least one real host echoes the method field back in its
 * responses. Handling that here means no dispatcher above ever has to think
 * about it.
 */
const readline = require('readline');

const PARSE_ERROR = -32700;
const INTERNAL_ERROR = -32603;

let nextId = 1;
const pending = new Map();

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function respond(id, result) { write({ jsonrpc: '2.0', id, result }); }
function fail(id, code, message) { write({ jsonrpc: '2.0', id, error: { code, message } }); }

/* Server->client requests (roots/list). Ids are prefixed so they can never
 * collide with a client request id. */
function request(method, params, cb) {
  const id = 'rc' + nextId++;
  pending.set(id, cb);
  write({ jsonrpc: '2.0', id, method, params: params || {} });
}

/* onRequest(msg) is called for everything that is not a response to us. It may
 * return a promise; a throw either way becomes an internal error for a request
 * and is swallowed for a notification. */
function listen(onRequest) {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return fail(null, PARSE_ERROR, 'parse error'); }
    const { id } = msg;
    if (id != null && pending.has(id) && (('result' in msg) || ('error' in msg))) {
      const cb = pending.get(id);
      pending.delete(id);
      if (cb) cb(msg.result, msg.error);
      return;
    }
    const oops = (e) => { if (id != null) fail(id, INTERNAL_ERROR, String(e && e.message)); };
    try {
      const out = onRequest(msg);
      if (out && typeof out.catch === 'function') out.catch(oops);
    } catch (e) { oops(e); }
  });
  rl.on('close', () => process.exit(0));
}

module.exports = { listen, write, respond, fail, request };
