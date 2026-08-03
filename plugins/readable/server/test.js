#!/usr/bin/env node
/** Protocol test for readable-card: full JSON-RPC exchange over stdio, zero deps. Run: node test.js */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SAVE_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-save-'));
// Hermetic cwd: the repo itself carries a .readable/ at its root, so a server
// inheriting the checkout cwd would find a brand via the walk and poison the
// no-brand assertions. Every spawned server gets a bare temp dir instead.
const NEUTRAL_CWD = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-cwd-'));
const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  stdio: ['pipe', 'pipe', 'inherit'],
  cwd: NEUTRAL_CWD,
  env: Object.assign({}, process.env, { READABLE_SAVE_DIR: SAVE_DIR, READABLE_COPY_CMD: 'cat' }),
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
  const copyt = tools.tools[4];
  const brandt = tools.tools[5];
  const fontt = tools.tools[6];
  const kitt = tools.tools[7];
  check('eight tools: card + save_card + render_email + read_card_file + copy_text + read_brand + read_fonts + read_kit', tools.tools.length === 8 && card.name === 'card' && save.name === 'save_card' && email.name === 'render_email' && readf.name === 'read_card_file' && copyt.name === 'copy_text' && brandt.name === 'read_brand' && fontt.name === 'read_fonts' && kitt.name === 'read_kit');
  check('read_kit carries no ui meta (app-only, never the model)', kitt._meta === undefined && kitt.inputSchema.properties.html.type === 'string');
  check('read_brand carries no ui meta', brandt._meta === undefined);
  check('read_fonts carries no ui meta and takes no args', fontt._meta === undefined && Object.keys(fontt.inputSchema.properties).length === 0);
  check('card schema advertises the brand dir param', card.inputSchema.properties.brand && card.inputSchema.properties.brand.type === 'string');
  check('tool links template via _meta.ui.resourceUri', card._meta.ui.resourceUri === 'ui://readable/card.html');
  check('inputSchema offers html or htmlFile, neither hard-required', Boolean(card.inputSchema.properties.html && card.inputSchema.properties.htmlFile) && card.inputSchema.required === undefined);
  check('save_card carries no ui meta (Desktop meta parser is fragile)', save._meta === undefined);
  check('render_email carries no ui meta', email._meta === undefined);
  check('read_card_file carries no ui meta', readf._meta === undefined);
  check('copy_text carries no ui meta', copyt._meta === undefined);

  // 3. resources: template served with the exact MCP Apps mime
  const res = await rpc('resources/list', {});
  check('template listed', res.resources[0].uri === 'ui://readable/card.html' && res.resources[0].mimeType === MIME);
  const read = await rpc('resources/read', { uri: 'ui://readable/card.html' });
  const html = read.contents[0].text;
  check('template mime exact', read.contents[0].mimeType === MIME);
  check('template carries kit css', html.includes('.rc{') && html.includes('unicode-bidi:plaintext'));
  check('template carries dark palette', html.includes('data-theme="dark"'));
  // 4.20.0: the template carries BASE only. Every component, chat-tier or
  // report-tier, is delivered per card by read_kit, so the old "which tier fits
  // in 30KB" question is gone and this asserts the new shape instead.
  check('template is BASE only: no component CSS inlined at all (4.20.0)', ['.rc .spark', '.rc .kpi{', '.rc table{', '.rc .badge', '.rc .cta', '.rc .kv{', '.rc .bars', '.rc .flow{', '.rc .tl{', '.rc .card', '.rc .box', '.rc .cols', '.rc blockquote', '.rc .numbered', '.donut', '.rc .fold'].every((sel) => !html.includes(sel)));
  check('template still carries all of BASE (frame, text, lists, callouts, code, bidi)', html.includes('.rc{') && html.includes('unicode-bidi:plaintext') && html.includes('.rc .cal') && html.includes('.rc code{') && html.includes('.rc ul>li::before'));
  check('print rules never ship to an iframe', !html.includes('@media print'));
  check('bridge mounts the lazy kit before first paint, with a deadline so a silent host still paints (4.20.0)', html.includes("name:'read_kit'") && html.includes("id='rckit'") && html.includes('kApply(html,') && html.includes('setTimeout(go,1500)'));
  // The #rckit node is created at load, not on first use, so the brand style is
  // appended after it and keeps winning. Assert the ORDER of the two mounts.
  check('the kit style node precedes the brand style node', html.indexOf("id='rckit'") < html.indexOf("id='rcbrand'"));
  // Step 3 dedup: the panel half (surface-2 on a hairline) is declared once for
  // the always-shipped panels; card/box keep their own copy in @CARD so the chat
  // sheet never pays for selectors it cannot use.
  check('panel recipe is shared by the always-shipped panels, not repeated per component (4.19.0)', html.includes('.rc code,.rc pre,.rc .kpi,.rc .flow .s{background:var(--s2);border:var(--bd)}'));

  // 3c. read_kit: the lazy component selector. A MISS here renders a component
  // unstyled in a real card, so these cover detection, dependencies, ordering,
  // and completeness rather than just the happy path.
  const kitOf = async (h) => (await rpc('tools/call', { name: 'read_kit', arguments: { html: h } })).content[0].text;

  const kNone = await kitOf('<h2>سلام</h2><p>یک پاسخ ساده با <code>path/to/x</code></p><ul><li>یک</li></ul>');
  check('read_kit ships NOTHING for a prose card: BASE already covers it', kNone === '');

  const kKpi = await kitOf('<div class="grid c3"><div class="kpi"><div class="l">a</div><div class="n">7<span class="trend up">2%</span></div></div></div><span class="badge ok">ok</span>');
  check('read_kit ships exactly what a kpi+badge card uses', kKpi.includes('.rc .kpi{') && kKpi.includes('.rc .trend{') && kKpi.includes('.rc .badge{') && !kKpi.includes('.rc table{') && !kKpi.includes('.rc .spark') && !kKpi.includes('.rc .cta') && !kKpi.includes('.rc .numbered'));

  const kTable = await kitOf('<table class="zebra dense"><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>');
  check('a zebra table also pulls @TABLE it restyles (declared dependency)', kTable.includes('.rc table{') && kTable.includes('table.zebra') && kTable.includes('table.dense'));

  const kBox = await kitOf('<div class="box"><div class="lbl">x</div><p>y</p></div>');
  check('a box-only card also pulls @CARD, which owns its panel rule (declared dependency)', kBox.includes('.rc .card,.rc .box{') && kBox.includes('.rc .box{border-color') && kBox.includes('.rc .lbl{'));

  const kCards = await kitOf('<div class="cards c2"><div class="card pick"><h4>a<span class="badge ok">b</span></h4><p>c</p></div></div>');
  check('cards reach a chat card now, chip restore included', kCards.includes('.rc .cards{') && kCards.includes('.rc .card.pick{') && kCards.includes(':is(.card,.box) .badge.ok'));
  // The generic child inversion and .rc .badge.ok tie on specificity (0,3,0), so
  // the delivered bundle must keep SHEET order or chips grey out inside a card.
  check('delivered snippets keep sheet order, so the specificity ties still resolve', kCards.indexOf('.rc .badge{') < kCards.indexOf(':is(.card,.box)'));

  const kQuote = await kitOf('<blockquote><p>q</p><cite>s</cite></blockquote><div class="src">source: x</div><div class="cols"><div><p>a</p></div></div>');
  check('blockquote, src and cols are all detected', kQuote.includes('.rc blockquote{') && kQuote.includes('.rc blockquote cite{') && kQuote.includes('.rc .src{') && kQuote.includes('.rc .cols{'));

  const kNum = await kitOf('<div class="numbered"><h3>a</h3><h4>b</h4></div>');
  check('numbered reaches a chat card, direction-keyed numerals included', kNum.includes('.rc .numbered{counter-reset:sec}') && kNum.includes(':dir(ltr) .numbered>h3::before'));

  // The duo-bar legend markup reuses the swatch rules that live in @DONUT, and
  // the only signal is the `leg` class. If that link ever breaks the legend
  // renders as a bare column of text with no colour chips.
  const kDuo = await kitOf('<div class="bars"><div class="leg"><span class="a"><i></i>total</span><span class="b"><i></i>subset</span></div><div class="bar duo"><span class="l">l</span><span class="t"><i style="width:80%"></i><i style="width:40%"></i></span><span class="v">v</span></div></div>');
  check('a duo-bar legend gets its colour swatches (the leg rules live in @DONUT)', kDuo.includes('.rc .bars .leg{') && kDuo.includes('.rc .leg i{') && kDuo.includes('.rc .leg .a i{'));

  check('read_kit output is wire-ready: no comments, no newlines', !kCards.includes('/*') && kCards.indexOf(String.fromCharCode(10)) < 0 && kCards.startsWith('.rc '));
  check('read_kit never ships print rules to an iframe', !(await kitOf('<div class="fold"></div><table></table>')).includes('@media print'));
  // Detection parses class ATTRIBUTES, so prose is never mistaken for markup.
  const kProse = await kitOf('<p>the src and box and card and fold of it</p>');
  check('detection is token-exact: prose words never pull a component', kProse === '');

  // COMPLETENESS. A new @TAG with no detector would silently render unstyled.
  // This is the guard that makes adding a component fail loudly instead.
  const srvSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const detectorBlock = srvSrc.split('const KIT_DETECT = {')[1].split('};')[0];
  const detectors = new Set((detectorBlock.match(/([A-Z]+):\s*\{/g) || []).map((m) => m.split(':')[0]));
  const kitSrc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'rc.css'), 'utf8');
  const tagsInSheet = new Set((kitSrc.match(/\/\*@([A-Z]+)/g) || []).map((m) => m.slice(3)));
  tagsInSheet.delete('REPORT'); // tier divider, no CSS of its own
  tagsInSheet.delete('PRINT');  // never ships to a card
  check('every @TAG in the sheet has a read_kit detector (' + [...tagsInSheet].length + ' components)', [...tagsInSheet].every((t) => detectors.has(t)) && [...detectors].every((d) => tagsInSheet.has(d)));

  // 3b. kit source invariants that the chat template cannot see (report tier).
  const kit = fs.readFileSync(path.join(__dirname, '..', 'assets', 'rc.css'), 'utf8').replace(/\r\n/g, '\n');
  // Judged on the kit source, not the template: menu.js carries its own chrome
  // radii (7/8/12px) which are not on the kit's scale and never should be.
  // Hairlines under 5px on 4-9px decorations (dots, tracks, rules) are off-scale
  // by design, so the filter starts at 5.
  check('radius scale is four tokens: 5 inline / 9 small panel / 11 panel / 20 pill (+14 frame)', (() => {
    const radii = [...new Set((kit.match(/border-radius:(\d+)px/g) || []).map((m) => +m.match(/\d+/)[0]))].filter((n) => n >= 5);
    return radii.length > 0 && radii.every((n) => [5, 9, 11, 14, 20].includes(n));
  })());
  const tail = kit.split('/*@REPORT')[1];
  // The child inversion ties with `.rc .badge.ok` on specificity (0,3,0). @CARD
  // sits BELOW @BADGE, so the inversion wins on order and the three semantic
  // chip colours must be re-asserted after it, or every chip inside a card and
  // box greys out. Order, not specificity, is what keeps them: assert it.
  check('semantic chips survive inside a panel: the badge restore follows the child inversion (4.19.0)', (() => {
    const inv = tail.indexOf(':is(.kpi,pre,code,.badge');
    const ok = tail.indexOf(':is(.card,.box) .badge.ok');
    return inv > -1 && ok > inv && ['ok{background:var(--bg-success)', 'warn{background:var(--bg-warning)', 'info{background:var(--bg-accent)'].every((s) => tail.includes(s));
  })());
  // Numerals follow the document's DIRECTION, the one signal both paths already
  // set (a --lang en report stamps <html dir=ltr>; a chat card stamps dir on .rc).
  // A hardcoded `persian` would print Persian digits in an English report.
  check('numbered counters are direction-keyed, never hardcoded to one script (4.19.0)', tail.includes("content:counter(sec,persian) '.'") && tail.includes(".rc:dir(ltr) .numbered>h3::before{content:counter(sec) '.'}") && tail.includes(".rc:dir(ltr) .numbered>h4::before{content:counter(sec) '.' counter(sub)}"));
  check('authors never hand-write section numbers: they come from counters', tail.includes('.rc .numbered{counter-reset:sec}') && tail.includes('counter-increment:sec;counter-reset:sub') && tail.includes('.rc .numbered>h4{counter-increment:sub}'));
  // Print STAYS LAST (the sheet's own rule): anything added after it silently
  // wins over print at equal specificity.
  check('print block is still the last rule in the sheet, and now un-inks panels', kit.trimEnd().endsWith('}') && kit.lastIndexOf('@media print') > kit.lastIndexOf('.rc .numbered') && /@media print\{[^]*:is\(\.card,\.box\)\{background:none/.test(kit) && /break-inside:avoid/.test(kit));
  check('cards reflow instead of scrolling: auto-fit grid, no max-content width', /\.rc \.cards\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(190px,1fr\)\)/.test(tail) && /\.rc \.cols\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(220px,1fr\)\)/.test(tail));
  check('box is a card variant sharing one panel rule, not a second panel component', tail.includes('.rc .card,.rc .box{background:var(--surface-2);border:.5px solid var(--border);border-radius:11px;padding:11px 13px}') && /\.rc \.box\{border-color:var\(--border-strong\)/.test(tail));
  check('page paints itself with surface-1 + theme color-scheme (host canvas is opaque light; a transparent page renders white-on-white in dark mode)', html.includes('background:var(--surface-1);overflow:hidden') && html.includes('color-scheme:light') && html.includes('color-scheme:dark'));
  check('template hoists @imports above all rules (mid-sheet imports are dead)', html.indexOf('@import') < html.indexOf(':root{') && html.includes('family=Inter'));
  check('hoisted Vazirmatn import survives intact (its url contains semicolons)', html.includes("family=Vazirmatn:wght@400;500;700;800&display=swap')") && html.includes(';--ca:'));
  check('assembly aliases hot kit vars on .rc, defs first (4.11.0; sources keep long names)', html.includes('.rc{--bd:.5px solid var(--border);') && html.includes('border:var(--bd)') && !html.includes('1var(') && (html.match(/var\(--text-accent\)/g) || []).length === 2);
  check('per-code-block copy button rides both hosts via menu.js (4.11.0)', html.includes("closest('#card pre')") && html.includes('#rccp{position:absolute') && html.includes('#rcmenu .act,#rccp{') && html.includes("textContent.replace(/\\n$/,'')"));
  check('copies go host-first through copy_text (sandboxed iframe swallows page clipboard writes, 4.11.1)', html.includes("{name:'copy_text',arguments:{text:t}}") && html.includes('if(W.__rcRpc){W.__rcRpc('));
  check('template stamps card dir from majority script + LTR overrides', html.includes('dirOf') && html.includes('.rc[dir=ltr]{text-align:left'));
  check('dir detection ignores code/pre content (long paths must not flip Persian cards to LTR)', html.includes('<(code|pre)'));
  check('template speaks MCP Apps bridge', html.includes('ui/initialize') && html.includes('ui/notifications/tool-input') && html.includes('size-changed'));
  check('template maps sendPrompt to ui/message', html.includes("rpc('ui/message'"));
  check('template has 5x2 format/action matrix (Email row back in 4.4, rendered server-side)', ['class="row"', 'class="fmt"', 'copyimg', 'copyemail', 'copyhtml', 'copymd', 'copytext', 'dlpng', 'dlemail', 'dlhtml', 'dlmd', 'dltxt'].every((l) => html.includes(l)) && html.split('row(I.').length === 6);
  check('email export fetches render_email and rich-copies both flavors, no lying execCommand fallback (4.12.0)', html.includes("name:'render_email'") && html.includes("'text/html'") && !html.includes('contentEditable'));
  check('open menu grows the iframe (fixed menu never enters scrollHeight)', html.includes('W.__rcFit=fit') && html.split('W.__rcFit()').length === 3);
  const scriptSrc = html.split('<script>')[1].split('</script>')[0];
  check('squeezed template script still parses (assembly squeeze is syntax-safe)', (() => { try { new Function(scriptSrc); return true; } catch (e) { return false; } })());
  check('squeeze hoists the host-object globals + DOM-method helpers once, and each long form survives only in its helper def', scriptSrc.indexOf('var D=document,W=window,CE=t=>D.createElement(t)') === 0 && !scriptSrc.includes('document.') && !scriptSrc.includes('window.') && (scriptSrc.match(/querySelectorAll/g) || []).length === 1 && (scriptSrc.match(/querySelector\(/g) || []).length === 1 && (scriptSrc.match(/\.createElement\(/g) || []).length === 1 && (scriptSrc.match(/\.getElementById\(/g) || []).length === 1);
  check('squeeze arrows every anonymous callback (neither source uses this or the arguments object)', !/function\s*\(/.test(scriptSrc) && scriptSrc.includes('=>{'));
  // 4.16.0: the card iframe is grown to the whole card and never scrolls, so
  // position:fixed pins to the card, not the app window — both export controls
  // ride the pointer instead. The 'flex';return} literal is the no-collision
  // guarantee: the <pre> branch returns BEFORE the menu-rail line, so the menu
  // holds still while the pointer is over a block that has its own button.
  check('both export controls ride the pointer, so a tall card exports from any height (4.16.0)', html.includes("addEventListener('mousemove'") && !html.includes("addEventListener('mouseover'") && html.includes('Math.min(e.clientX,innerWidth-e.clientX)<70') && html.includes("menu.className.indexOf('open')<0") && html.includes('Math.min(innerHeight-40,y-15)') && html.includes('Math.min(r.bottom+scrollY-35,y+scrollY-15)') && html.includes("cpBtn.style.display='flex';return}"));
  // 4.17.0: #rcmenu forces direction:ltr on ITSELF so its dots and labels never
  // mirror, which also makes inset-inline-end resolve to the physical right
  // always. 4.14.0's "sits where lines end, both directions" was therefore true
  // only in LTR, and every Persian card wore the dots on top of its title. The
  // side is now a physical right flipped by a #card[dir=rtl] sibling rule. The
  // kit's own inset-inline-* rules live on .rc, which DOES follow the card's
  // direction, so the ban below is scoped to #rcmenu rule bodies.
  check('the menu takes the corner where the card\'s lines END in BOTH directions: physical right, flipped by #card[dir=rtl] (4.17.0)', html.includes('#rcmenu{position:fixed;top:8px;right:8px;z-index:9}') && html.includes('#card[dir=rtl]~#rcmenu{left:8px;right:auto}') && !/#rcmenu[^}]*inset-inline/.test(html));
  check('the dropdown flips with the dots, so a left-side menu opens inward instead of past the viewport edge (4.17.0)', html.includes('#rcmenu .items{display:none;position:absolute;right:0;') && html.includes('#card[dir=rtl]~#rcmenu .items{left:0;right:auto}'));
  check('template stays under the host resource-size ceiling (' + html.length + 'B of 30000)', html.length < 30000);
  check('template applies project brands via read_brand (4.13.0)', html.includes("name:'read_brand'") && html.includes("id='rcbrand'") && html.includes('if(a.brand)bApply(a.brand)') && html.includes('if(s.brand)bApply(s.brand)'));
  check('saves go through save_card then ui/download-file', html.includes("name:'save_card'") && html.includes('ui/download-file'));
  check('png export is dependency-free (foreignObject, blob URL)', html.includes('foreignObject') && html.includes('createObjectURL') && !html.includes('html2canvas'));
  check('png export inlines real font bytes: mounts #rcfont via read_fonts before rastering, and makeSvg strips only @import (data-URI @font-face survive)', html.includes("name:'read_fonts'") && html.includes("id='rcfont'") && html.includes('ensureFonts(()=>{makeSvg') && html.includes('@import url'));
  check('menu has per-item states (spinner/ok/err)', html.includes('rcspin .7s') && html.includes('ICON_OK') && html.includes('classList.add(st)'));
  check('clipboard has execCommand fallback', html.includes("execCommand('copy')"));
  check('CTA clicks survive blocked inline handlers (delegation)', html.includes("closest('#card [onclick]')"));
  check('template fetches htmlFile via read_card_file (never via model context)', html.includes("name:'read_card_file'") && html.includes('htmlFile'));
  check('exports are named after the card title (4.12.0)', html.includes('function fileBase()') && html.includes("fileBase()+'.png'") && html.includes("fileBase()+'.md'") && html.includes("fileBase()+'.email.html'"));
  check('save rpcs are deadlined and request the native picker (4.12.0)', html.includes('function rpcTo(') && html.includes('pick:true') && html.includes("'picking'") && !html.includes('no host response'));
  check('email export is deadlined too (busy-forever guard)', html.includes("toast('email: timeout')"));

  // 4. tools/call happy path
  const ok = await rpc('tools/call', { name: 'card', arguments: { html: '<h2>سلام</h2><p>تست</p>' } });
  check('call returns model-facing text', ok.content[0].type === 'text' && ok.content[0].text.includes('rendered'));
  check('call mirrors html into structuredContent', ok.structuredContent.html === '<h2>سلام</h2><p>تست</p>');
  const okSvg = await rpc('tools/call', { name: 'card', arguments: { html: '<div class="spark"><svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="0,26 50,10 100,4"/></svg><div class="x"><span>a</span><span>b</span></div></div>' } });
  check('card accepts inline-svg spark content (guardrail blocks only style/script)', okSvg.structuredContent.html.includes('<svg'));

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
  const emPath = await rpc('tools/call', { name: 'render_email', arguments: {
    html: '<h2>گزارش</h2><p>خروجی <code>/Users/seyed/projects/very/long/latin/path/that/would/outvote/the/persian/prose/abcdefghijklmnopqrstuvwxyz.js</code> آماده شد</p>',
  } });
  check('render_email keeps Persian cards rtl despite long code paths', emPath.content[0].text.indexOf('<div dir="rtl"') === 0);
  check('render_email flips flow arrows for ltr', emEnOut.includes('→') && !emEnOut.includes('←'));
  const emSpark = await rpc('tools/call', { name: 'render_email', arguments: {
    html: '<h2>روند</h2><div class="spark"><svg viewBox="0 0 100 30"><polyline points="0,26 50,10 100,4"/></svg><div class="x"><span>ف</span><span>ت</span></div></div><p>متن</p>',
  } });
  check('render_email drops spark blocks (email clients strip svg)', !emSpark.content[0].text.includes('<svg') && !emSpark.content[0].text.includes('polyline'));
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
  const s5 = await rpc('tools/call', { name: 'save_card', arguments: { filename: 'گزارش هفتگی.md', content: 'فارسی', encoding: 'utf8' } });
  check('save_card keeps Unicode titles (Persian filenames survive, spaces to dashes)', path.basename(s5.content[0].text) === 'گزارش-هفتگی.md' && fs.readFileSync(s5.content[0].text, 'utf8') === 'فارسی');
  const s6 = await rpc('tools/call', { name: 'save_card', arguments: { filename: 'card.txt', content: 'x', encoding: 'utf8', pick: true } });
  check('READABLE_SAVE_DIR outranks the picker (tests never open dialogs)', s6.content[0].text.startsWith(SAVE_DIR) && s6.content[0].text.endsWith('.txt'));
  check('save_card schema advertises pick', save.inputSchema.properties.pick && save.inputSchema.properties.pick.type === 'boolean');

  // 8. copy_text: pipes through the clipboard helper (overridden to `cat` here)
  const cp1 = await rpc('tools/call', { name: 'copy_text', arguments: { text: 'plain code\nline2' } });
  check('copy_text succeeds through the helper', !cp1.isError && cp1.content[0].text.includes('copied via cat'));
  const cp2 = await rpc('tools/call', { name: 'copy_text', arguments: {} }).then(
    () => false,
    (e) => String(e.message).includes('-32602')
  );
  check('copy_text rejects missing text', cp2);

  // 8a2. brand: .readable/brand.css reskins cards — explicit dir arg, css
  // normalization (breakout strip, import filter, dark-selector raise), and
  // the no-brand default staying byte-identical to 4.12 behavior.
  const BRAND_PROJ = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-brand-'));
  const BRAND_DIR = path.join(BRAND_PROJ, '.readable');
  fs.mkdirSync(BRAND_DIR);
  fs.writeFileSync(path.join(BRAND_DIR, 'brand.css'),
    "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap');\n" +
    "@import url('https://evil.example.com/steal.css');\n" +
    ':root{--text-accent:#C2410C;--surface-1:#FDFBF6}\n' +
    '[data-theme="dark"]{--text-accent:#FB923C;--surface-1:#0F1626}\n' +
    '</style><script>alert(1)</script>\n');
  const br = await rpc('tools/call', { name: 'read_brand', arguments: { dir: BRAND_DIR } });
  const brCss = br.content[0].text;
  check('read_brand returns the brand css with google import first', !br.isError && brCss.indexOf('@import') === 0 && brCss.includes('fonts.googleapis') && brCss.includes('--text-accent:#C2410C'));
  check('read_brand drops non-google imports', !brCss.includes('evil.example.com'));
  check('read_brand strips < (no style/script breakout can survive)', !brCss.includes('<'));
  check('read_brand raises bare dark selectors to html[data-theme]', brCss.includes('html[data-theme="dark"]{--text-accent:#FB923C'));
  const cardBr = await rpc('tools/call', { name: 'card', arguments: { html: '<p>برند</p>', brand: BRAND_DIR } });
  check('card call carries the brand dir into structuredContent', cardBr.structuredContent.brand === BRAND_DIR && cardBr.structuredContent.html === '<p>برند</p>');
  const cardNoBr = await rpc('tools/call', { name: 'card', arguments: { html: '<p>ساده</p>' } });
  check('card without a resolvable brand omits the field entirely', cardNoBr.structuredContent.brand === undefined);
  const brRel = await rpc('tools/call', { name: 'read_brand', arguments: { dir: '.readable' } });
  check('read_brand rejects relative dirs', brRel.isError && brRel.content[0].text.includes('absolute'));
  const brWrong = await rpc('tools/call', { name: 'read_brand', arguments: { dir: BRAND_PROJ } });
  check('read_brand rejects dirs not named .readable', brWrong.isError);
  const cardBadBrand = await rpc('tools/call', { name: 'card', arguments: { html: '<p>x</p>', brand: '/nonexistent/.readable' } });
  check('a dangling brand arg degrades to the default look, never an error', !cardBadBrand.isError && cardBadBrand.structuredContent.brand === undefined && cardBadBrand.structuredContent.html === '<p>x</p>');

  // 8a3. letterhead (4.14.0): a brand.json wordmark/logo folds a .rc::before
  // letterhead INTO the read_brand css (zero template cost, runtime only). It
  // rides above the card, is invisible to #card exporters, and never appears
  // when the brand is palette-only (byte-identical to 4.13).
  const LH = path.join(BRAND_PROJ, '.lh');
  const mkbrand = (name, json, logo) => {
    const d = path.join(LH, name, '.readable');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'brand.css'), ':root{--text-accent:#2f66c4}');
    if (json) fs.writeFileSync(path.join(d, 'brand.json'), JSON.stringify(json));
    if (logo) fs.writeFileSync(path.join(d, 'logo.svg'), logo);
    return d;
  };
  const wmDir = mkbrand('wm', { wordmark: 'پایا' });
  const wmCss = (await rpc('tools/call', { name: 'read_brand', arguments: { dir: wmDir } })).content[0].text;
  check('wordmark-only brand folds a .rc::before letterhead with the wordmark as content', wmCss.includes('.rc::before{content:"پایا"') && wmCss.includes('color:var(--text-primary)'));
  const logoWmDir = mkbrand('lw', { wordmark: 'Acme' }, '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#e00"/></svg>');
  const logoWmCss = (await rpc('tools/call', { name: 'read_brand', arguments: { dir: logoWmDir } })).content[0].text;
  check('logo+wordmark rides the logo as a background data-URI with text padding + dir positions', logoWmCss.includes('.rc::before{content:"Acme"') && logoWmCss.includes('background:url("data:image/svg+xml,') && logoWmCss.includes('padding-inline-start:32px') && logoWmCss.includes('.rc[dir=rtl]::before{background-position:right center}'));
  const monoDir = mkbrand('mono', null, '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="currentColor"/></svg>');
  const monoCss = (await rpc('tools/call', { name: 'read_brand', arguments: { dir: monoDir } })).content[0].text;
  check('a currentColor logo-only brand tints via -webkit-mask so it theme-flips', monoCss.includes('.rc::before{content:""') && monoCss.includes('-webkit-mask:url("data:image/svg+xml,') && monoCss.includes('background:var(--text-primary)'));
  const scriptLogoDir = mkbrand('evil', { wordmark: 'X' }, '<svg onload="alert(1)"><script>alert(2)</script><rect/></svg>');
  const scriptLogoCss = (await rpc('tools/call', { name: 'read_brand', arguments: { dir: scriptLogoDir } })).content[0].text;
  check('a hostile logo cannot smuggle code: <script> and on*= handlers are stripped before the data-URI', !/alert%281%29|alert%282%29|onload/i.test(scriptLogoCss) && scriptLogoCss.includes('.rc::before'));
  const plainDir = mkbrand('plain', null, null);
  const plainCss = (await rpc('tools/call', { name: 'read_brand', arguments: { dir: plainDir } })).content[0].text;
  check('a palette-only brand (no json/logo) folds NO letterhead (byte-identical to 4.13)', !plainCss.includes('::before'));

  // 8b. roots: a client that advertises roots gets asked roots/list, and saves
  // land in the first root (the session's project dir) instead of Downloads.
  const ROOTS_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-root-'));
  const env3 = Object.assign({}, process.env);
  delete env3.READABLE_SAVE_DIR;
  const srv3 = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: ['pipe', 'pipe', 'inherit'], env: env3, cwd: NEUTRAL_CWD });
  const rootSave = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout: roots flow')), 3000);
    let b = '';
    srv3.stdout.on('data', (d) => {
      b += d;
      let j;
      while ((j = b.indexOf('\n')) !== -1) {
        const l = b.slice(0, j); b = b.slice(j + 1);
        if (!l.trim()) continue;
        const m = JSON.parse(l);
        if (m.method === 'roots/list' && m.id != null) {
          srv3.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { roots: [{ uri: 'file://' + ROOTS_DIR, name: 'proj' }] } }) + '\n');
          srv3.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'save_card', arguments: { filename: 'root.txt', content: 'r', encoding: 'utf8' } } }) + '\n');
        }
        if (m.id === 9) { clearTimeout(t); resolve(m); }
      }
    });
    srv3.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: { roots: { listChanged: true } } } }) + '\n');
    srv3.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  });
  check('roots/list is requested on initialized and the first root becomes the save dir', rootSave.result.content[0].text === path.join(ROOTS_DIR, 'root.txt') && fs.readFileSync(path.join(ROOTS_DIR, 'root.txt'), 'utf8') === 'r');
  srv3.kill();

  // 8c. multi-root (4.13.1): the desktop app runs ONE server for every open
  // project, so with several roots a brand-less call must not be guessed (in
  // 4.13.0 it took the first branded root and skinned one project's cards
  // with a parallel project's brand); an explicit dir still wins, and a lone
  // root resumes auto-branding after roots/list_changed.
  const MR_A = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-mrA-'));
  const MR_B = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-mrB-'));
  for (const p of [MR_A, MR_B]) {
    fs.mkdirSync(path.join(p, '.readable'));
    fs.writeFileSync(path.join(p, '.readable', 'brand.css'), ':root{--text-accent:#123456}');
  }
  const srv4 = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: ['pipe', 'pipe', 'inherit'], env: env3, cwd: NEUTRAL_CWD });
  const mr = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout: multi-root flow')), 3000);
    let b = '';
    let openRoots = [MR_A, MR_B];
    const got = {};
    srv4.stdout.on('data', (d) => {
      b += d;
      let j;
      while ((j = b.indexOf('\n')) !== -1) {
        const l = b.slice(0, j); b = b.slice(j + 1);
        if (!l.trim()) continue;
        const m = JSON.parse(l);
        if (m.method === 'roots/list' && m.id != null) {
          srv4.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { roots: openRoots.map((p) => ({ uri: 'file://' + p })) } }) + '\n');
          if (openRoots.length === 2) {
            srv4.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'card', arguments: { html: '<p>a</p>' } } }) + '\n');
            srv4.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'card', arguments: { html: '<p>b</p>', brand: path.join(MR_B, '.readable') } } }) + '\n');
          } else {
            srv4.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'card', arguments: { html: '<p>c</p>' } } }) + '\n');
          }
        }
        if (m.id === 11 || m.id === 12 || m.id === 13) got[m.id] = m;
        if (m.id === 12) {
          openRoots = [MR_B];
          srv4.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/roots/list_changed', params: {} }) + '\n');
        }
        if (m.id === 13) { clearTimeout(t); resolve(got); }
      }
    });
    srv4.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: { roots: { listChanged: true } } } }) + '\n');
    srv4.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  });
  check('multi-root: a brand-less call is never guessed (4.13.1)', mr[11].result.structuredContent.brand === undefined && mr[11].result.structuredContent.html === '<p>a</p>');
  check('multi-root: an explicit brand dir still wins', mr[12].result.structuredContent.brand === path.join(MR_B, '.readable'));
  check('lone root resumes auto-branding after roots/list_changed', mr[13].result.structuredContent.brand === path.join(MR_B, '.readable'));
  srv4.kill();

  // 8d. report shell: the OTHER host of the same assets/menu.js. Its #card is
  // nested inside .wrap, so menu.js's #card[dir=rtl] sibling flip cannot reach
  // it, and the report seats the menu beside the theme toggle instead of on the
  // card corner, so the shell owns its own side, read off the ROOT dir. Until
  // 4.17.0 that seat was an inline inset-inline-end on a direction:ltr element,
  // i.e. always physical right: in a Persian report (toggle on the left, the
  // Copy/PDF bar on the right) the dots landed 28px on top of the Copy button.
  const shell = fs.readFileSync(path.join(__dirname, '..', 'skills', 'report', 'assets', 'shell.html'), 'utf8');
  check('report seats the menu beside the theme toggle, on whichever side the ROOT dir puts it (4.17.0)', shell.includes('html[dir=ltr] #rcmenu{top:16px;right:62px}') && shell.includes('html[dir=rtl] #rcmenu{top:16px;left:62px;right:auto}') && shell.includes('html[dir=rtl] #rcmenu .items{left:0;right:auto}'));
  check('report no longer pins the menu inline with a logical inset (a direction:ltr element cannot see the page dir)', !shell.includes('inset-inline-end:62px') && !shell.includes('m.style.cssText'));
  check('report keeps the theme toggle and the Copy/PDF bar on opposite logical corners', shell.includes('.theme-toggle{position:fixed;top:16px;inset-inline-end:16px') && shell.includes('.rbar{position:fixed;top:16px;inset-inline-start:16px'));

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
