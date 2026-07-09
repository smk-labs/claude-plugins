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
  const email = tools.tools[2];
  const readf = tools.tools[3];
  check('four tools: card + save_card + render_email + read_card_file', tools.tools.length === 4 && card.name === 'card' && save.name === 'save_card' && email.name === 'render_email' && readf.name === 'read_card_file');
  check('tool links template via _meta.ui.resourceUri', card._meta.ui.resourceUri === 'ui://readable/card.html');
  check('inputSchema offers html or htmlFile, neither hard-required', Boolean(card.inputSchema.properties.html && card.inputSchema.properties.htmlFile) && card.inputSchema.required === undefined);
  check('save_card carries no ui meta (Desktop meta parser is fragile)', save._meta === undefined);
  check('render_email carries no ui meta', email._meta === undefined);
  check('read_card_file carries no ui meta', readf._meta === undefined);

  // 3. resources: template served with the exact MCP Apps mime
  const res = await rpc('resources/list', {});
  check('template listed', res.resources[0].uri === 'ui://readable/card.html' && res.resources[0].mimeType === MIME);
  const read = await rpc('resources/read', { uri: 'ui://readable/card.html' });
  const html = read.contents[0].text;
  check('template mime exact', read.contents[0].mimeType === MIME);
  check('template carries kit css', html.includes('.rc{') && html.includes('.rc .kpi') && html.includes('unicode-bidi:plaintext'));
  check('template carries dark palette', html.includes('data-theme="dark"'));
  check('page paints itself with surface-1 + theme color-scheme (host canvas is opaque light; a transparent page renders white-on-white in dark mode)', html.includes('background:var(--surface-1);overflow:hidden') && html.includes('color-scheme:light') && html.includes('color-scheme:dark'));
  check('template hoists @imports above all rules (mid-sheet imports are dead)', html.indexOf('@import') < html.indexOf(':root{') && html.includes('family=Inter'));
  check('hoisted Vazirmatn import survives intact (its url contains semicolons)', html.includes("family=Vazirmatn:wght@400;500;700;800&display=swap')") && html.includes('.rc{--ca:'));
  check('template stamps card dir from majority script + LTR overrides', html.includes('dirOf') && html.includes('.rc[dir=ltr]{text-align:left'));
  check('template speaks MCP Apps bridge', html.includes('ui/initialize') && html.includes('ui/notifications/tool-input') && html.includes('size-changed'));
  check('template maps sendPrompt to ui/message', html.includes("rpc('ui/message'"));
  check('template has 5x2 format/action matrix (Email row back in 4.4, rendered server-side)', ['class="row"', 'class="fmt"', 'copyimg', 'copyemail', 'copyhtml', 'copymd', 'copytext', 'dlpng', 'dlemail', 'dlhtml', 'dlmd', 'dltxt'].every((l) => html.includes(l)) && html.split('row(I.').length === 6);
  check('email export fetches render_email and rich-copies both flavors', html.includes("name:'render_email'") && html.includes("'text/html'") && html.includes("contentEditable"));
  check('open menu grows the iframe (fixed menu never enters scrollHeight)', html.includes('window.__rcFit=fit') && html.split('window.__rcFit()').length === 3);
  check('template stays under the host resource-size ceiling', html.length < 30000);
  check('saves go through save_card then ui/download-file', html.includes("name:'save_card'") && html.includes('ui/download-file'));
  check('png export is dependency-free (foreignObject, blob URL)', html.includes('foreignObject') && html.includes('createObjectURL') && !html.includes('html2canvas'));
  check('menu has per-item states (spinner/ok/err)', html.includes('rcspin .7s') && html.includes('ICON_OK') && html.includes('classList.add(st)'));
  check('clipboard has execCommand fallback', html.includes("execCommand('copy')"));
  check('CTA clicks survive blocked inline handlers (delegation)', html.includes("closest('#card [onclick]')"));
  check('template fetches htmlFile via read_card_file (never via model context)', html.includes("name:'read_card_file'") && html.includes('htmlFile'));

  // 4. tools/call happy path
  const ok = await rpc('tools/call', { name: 'card', arguments: { html: '<h2>سلام</h2><p>تست</p>' } });
  check('call returns model-facing text', ok.content[0].type === 'text' && ok.content[0].text.includes('rendered'));
  check('call mirrors html into structuredContent', ok.structuredContent.html === '<h2>سلام</h2><p>تست</p>');

  // 4b. htmlFile mode: card renders from a pre-written *-card.html file
  const CARD_FILE = path.join(SAVE_DIR, 'worker-report-card.html');
  fs.writeFileSync(CARD_FILE, '<h2>گزارش کارگر</h2><p>تمام شد</p>');
  const okf = await rpc('tools/call', { name: 'card', arguments: { htmlFile: CARD_FILE } });
  check('htmlFile call returns model-facing text', okf.content[0].type === 'text' && okf.content[0].text.includes('rendered'));
  check('htmlFile call carries only the path in structuredContent (no html echo to the model)', okf.structuredContent.htmlFile === CARD_FILE && okf.structuredContent.html === undefined);
  const rf = await rpc('tools/call', { name: 'read_card_file', arguments: { path: CARD_FILE } });
  check('read_card_file returns the file content for the bridge', rf.content[0].text === '<h2>گزارش کارگر</h2><p>تمام شد</p>' && !rf.isError);

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
  const both = await rpc('tools/call', { name: 'card', arguments: { html: '<p>a</p>', htmlFile: CARD_FILE } }).then(
    () => false,
    (e) => String(e.message).includes('not both')
  );
  check('rejects html and htmlFile together', both);
  const wrongName = await rpc('tools/call', { name: 'card', arguments: { htmlFile: path.join(SAVE_DIR, 'evil.html') } }).then(
    () => false,
    (e) => String(e.message).includes('-card.html')
  );
  check('rejects htmlFile without the -card.html suffix', wrongName);
  const missing = await rpc('tools/call', { name: 'card', arguments: { htmlFile: path.join(SAVE_DIR, 'ghost-card.html') } }).then(
    () => false,
    (e) => String(e.message).includes('not found')
  );
  check('rejects missing htmlFile with an actionable error', missing);
  const STYLED_FILE = path.join(SAVE_DIR, 'styled-card.html');
  fs.writeFileSync(STYLED_FILE, '<style>x</style><p>a</p>');
  const styledFile = await rpc('tools/call', { name: 'card', arguments: { htmlFile: STYLED_FILE } }).then(
    () => false,
    (e) => String(e.message).includes('style')
  );
  check('rejects htmlFile containing <style>', styledFile);
  const relPath = await rpc('tools/call', { name: 'read_card_file', arguments: { path: 'relative-card.html' } });
  check('read_card_file rejects relative paths', relPath.isError && relPath.content[0].text.includes('absolute'));

  // 6. render_email: server-side inline-styled email HTML
  const em = await rpc('tools/call', { name: 'render_email', arguments: {
    html: '<h2>گزارش</h2><ul><li class="ok">پاس</li><li class="no">رد</li></ul><div class="cal tip"><div><p>نکته</p></div></div><p>متن <code>x=1</code></p><div class="btns"><button class="cta" onclick="sendPrompt(\'x\')">برو</button></div>',
    theme: 'light',
  } });
  const emailOut = em.content[0].text;
  check('render_email returns inline-styled rtl HTML', emailOut.indexOf('<div dir="rtl"') === 0 && emailOut.includes('style="'));
  check('render_email strips every class attribute', !emailOut.includes('class='));
  check('render_email materializes list glyphs', emailOut.includes('✓') && emailOut.includes('✕'));
  check('render_email inlines the light callout fill', emailOut.includes('#e6f4ec'));
  check('render_email drops interactive bits', !emailOut.includes('<button') && !emailOut.includes('onclick'));
  check('render_email emits no style/script tags', !/<\s*(style|script)\b/i.test(emailOut));
  const emEn = await rpc('tools/call', { name: 'render_email', arguments: {
    html: '<h2>Weekly report</h2><p>All systems green.</p><div class="flow"><span class="s">plan</span><span class="s">ship</span></div>',
  } });
  const emEnOut = emEn.content[0].text;
  check('render_email detects English content as ltr', emEnOut.indexOf('<div dir="ltr"') === 0 && emEnOut.includes('text-align:left') && !emEnOut.includes('Vazirmatn'));
  check('render_email flips flow arrows for ltr', emEnOut.includes('→') && !emEnOut.includes('←'));
  const emBad = await rpc('tools/call', { name: 'render_email', arguments: { html: '<style>x</style><p>a</p>' } }).then(
    () => false,
    (e) => String(e.message).includes('-32602')
  );
  check('render_email rejects embedded <style>', emBad);

  // 7. save_card: writes to READABLE_SAVE_DIR, returns absolute path, dedupes, sanitizes
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
