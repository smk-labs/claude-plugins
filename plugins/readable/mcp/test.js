#!/usr/bin/env node
/** Protocol test for readable-card: full JSON-RPC exchange over stdio, zero deps. Run: node test.js */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SAVE_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-save-'));
const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: Object.assign({}, process.env, { READABLE_SAVE_DIR: SAVE_DIR }),
});
const pending = new Map();
let buf = '';
let nextId = 1;

srv.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => reject(new Error('timeout: ' + method)), 3000);
  });
}
function notify(method, params) {
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

const checks = [];
function check(name, cond) {
  checks.push([name, Boolean(cond)]);
  if (!cond) process.exitCode = 1;
}

(async () => {
  const UI_EXT = 'io.modelcontextprotocol/ui';
  const MIME = 'text/html;profile=mcp-app';

  // 1. initialize WITH MCP Apps capability
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: { extensions: { [UI_EXT]: { mimeTypes: [MIME] } } },
    clientInfo: { name: 'test', version: '0' },
  });
  check('initialize echoes protocolVersion', init.protocolVersion === '2025-06-18');
  check('server declares ui extension', init.capabilities.extensions[UI_EXT].mimeTypes[0] === MIME);
  notify('notifications/initialized', {});

  // 2. tools/list: card tool linked to the ui:// template + app-only save_card
  const tools = await rpc('tools/list', {});
  const card = tools.tools[0];
  const save = tools.tools[1];
  check('two tools: card + save_card', tools.tools.length === 2 && card.name === 'card' && save.name === 'save_card');
  check('tool links template via _meta.ui.resourceUri', card._meta.ui.resourceUri === 'ui://readable/card.html');
  check('inputSchema requires html', card.inputSchema.required[0] === 'html');
  check('save_card is app-only', save._meta.ui.visibility.length === 1 && save._meta.ui.visibility[0] === 'app');

  // 3. resources: template served with the exact MCP Apps mime
  const res = await rpc('resources/list', {});
  check('template listed', res.resources[0].uri === 'ui://readable/card.html' && res.resources[0].mimeType === MIME);
  const read = await rpc('resources/read', { uri: 'ui://readable/card.html' });
  const html = read.contents[0].text;
  check('template mime exact', read.contents[0].mimeType === MIME);
  check('template carries kit css', html.includes('.rc{') && html.includes('.rc .kpi') && html.includes('unicode-bidi:plaintext'));
  check('template carries dark palette', html.includes('data-theme="dark"'));
  check('template speaks MCP Apps bridge', html.includes('ui/initialize') && html.includes('ui/notifications/tool-input') && html.includes('size-changed'));
  check('template maps sendPrompt to ui/message', html.includes("rpc('ui/message'"));
  check('template has 5x2 format/action matrix', ['class="row"', 'class="fmt"', 'copyimg', 'copyhtml', 'copymd', 'copytext', 'copyemail', 'dlpng', 'dlhtml', 'dlmd', 'dltxt', 'dlemail'].every((l) => html.includes(l)) && html.split('class="row"').length === 6);
  check('saves go through save_card then ui/download-file', html.includes("name:'save_card'") && html.includes('ui/download-file'));
  check('png export is dependency-free (foreignObject, blob URL)', html.includes('foreignObject') && html.includes('createObjectURL') && !html.includes('html2canvas'));
  check('menu has per-item states (spinner/ok/err)', html.includes('rcspin .7s') && html.includes('ICON_OK') && html.includes('classList.add(st)'));
  check('clipboard has execCommand fallback', html.includes("execCommand('copy')"));
  check('CTA clicks survive blocked inline handlers (delegation)', html.includes("closest('#card [onclick]')"));

  // 4. tools/call happy path
  const ok = await rpc('tools/call', { name: 'card', arguments: { html: '<h2>سلام</h2><p>تست</p>' } });
  check('call returns model-facing text', ok.content[0].type === 'text' && ok.content[0].text.includes('rendered'));
  check('call mirrors html into structuredContent', ok.structuredContent.html === '<h2>سلام</h2><p>تست</p>');

  // 5. guardrails
  const bad = await rpc('tools/call', { name: 'card', arguments: { html: '<style>x</style><p>a</p>' } }).then(
    () => false,
    (e) => String(e.message).includes('-32602')
  );
  check('rejects embedded <style>', bad);
  const empty = await rpc('tools/call', { name: 'card', arguments: {} }).then(
    () => false,
    (e) => String(e.message).includes('-32602')
  );
  check('rejects missing html', empty);

  // 6. save_card: writes to READABLE_SAVE_DIR, returns absolute path, dedupes, sanitizes
  const s1 = await rpc('tools/call', { name: 'save_card', arguments: { filename: 'card.md', content: '# hi', encoding: 'utf8' } });
  check('save_card returns absolute path', s1.content[0].text.startsWith(SAVE_DIR));
  check('save_card wrote utf8 content', fs.readFileSync(s1.content[0].text, 'utf8') === '# hi');
  const s2 = await rpc('tools/call', { name: 'save_card', arguments: { filename: 'card.md', content: 'x', encoding: 'utf8' } });
  check('save_card dedupes existing names', s2.content[0].text.endsWith('card-1.md'));
  const s3 = await rpc('tools/call', { name: 'save_card', arguments: { filename: '../../evil.sh', content: 'x', encoding: 'utf8' } });
  check('save_card sanitizes path traversal', s3.content[0].text.startsWith(SAVE_DIR) && !s3.content[0].text.includes('..'));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
  const s4 = await rpc('tools/call', { name: 'save_card', arguments: { filename: 'card.png', content: png, encoding: 'base64' } });
  check('save_card decodes base64', fs.readFileSync(s4.content[0].text)[0] === 0x89);

  // 7. fallback path: a second server WITHOUT ui capability gets the fallback note
  const srv2 = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: ['pipe', 'pipe', 'inherit'] });
  const out2 = new Promise((resolve) => {
    let b = '';
    const want = new Set([1, 2]);
    const got = {};
    srv2.stdout.on('data', (d) => {
      b += d;
      let j;
      while ((j = b.indexOf('\n')) !== -1) {
        const l = b.slice(0, j); b = b.slice(j + 1);
        if (!l.trim()) continue;
        const m = JSON.parse(l);
        if (want.has(m.id)) { got[m.id] = m; want.delete(m.id); }
        if (!want.size) resolve(got);
      }
    });
  });
  srv2.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }) + '\n');
  srv2.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'card', arguments: { html: '<p>x</p>' } } }) + '\n');
  const got = await out2;
  check('no-ui host gets fallback instruction', got[2].result.content[0].text.includes('show_widget'));
  srv2.kill();

  srv.kill();
  let pass = 0;
  for (const [name, okc] of checks) {
    console.log((okc ? 'PASS' : 'FAIL') + '  ' + name);
    if (okc) pass++;
  }
  console.log(pass + '/' + checks.length + ' checks passed');
  process.exit(pass === checks.length ? 0 : 1);
})().catch((e) => {
  console.error('test crashed:', e);
  srv.kill();
  process.exit(1);
});
