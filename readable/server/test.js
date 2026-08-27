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
  check('template is BASE only: no component CSS inlined at all (4.20.0)', ['.rc .spark', '.rc .kpi{', '.rc table{', '.rc .badge', '.rc .cta', '.rc .kv{', '.rc .bars', '.rc .flow{', '.rc .tl{', '.rc .card', '.rc .box', '.rc .cols', '.rc blockquote', '.rc .numbered', '.rc .sections', '.rc .tabs', '.rc .preview', '.donut', '.rc .fold'].every((sel) => !html.includes(sel)));
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

  // @ICON (5.0.0): one sprite behind a mask, so the glyph takes currentColor and
  // the font size. It only became affordable when the kit went lazy.
  const kIcon = await kitOf('<h3><i class="ic zap"></i>t</h3><p><i class="ic check"></i>ok</p>');
  const ICON_NAMES = ['check', 'x', 'alert', 'info', 'clock', 'user', 'file', 'folder', 'code', 'terminal', 'git', 'db', 'zap', 'shield', 'search', 'link'];
  check('read_kit delivers the icon set when an icon is used', kIcon.includes('.rc .ic{') && kIcon.includes('data:image/svg+xml'));
  check('all 16 icons have an offset rule', ICON_NAMES.every((n) => kIcon.includes('.rc .ic.' + n + '{--p:')));
  // The sprite URI is ~2KB; spelling it twice for the -webkit- prefix would
  // double the component, so it lives in --u and is referenced by both.
  check('the sprite URI appears exactly once, behind --u', (kIcon.match(/data:image\/svg\+xml/g) || []).length === 1 && kIcon.includes('-webkit-mask:var(--u)') && kIcon.includes('mask:var(--u)'));
  check('an icon in a heading replaces the section dot instead of doubling it', kIcon.includes('.rc h3:has(.ic):not(.numbered *)::before{display:none}'));
  // Both the dot suppression and the section counter live on h3::before and tie on
  // specificity, so an unscoped suppression ate the numbering. Guard the scope.
  check('an icon never eats a section number: the suppression is scoped out of @NUMBERED', kIcon.includes(':not(.numbered *)::before'));
  // 5.2.0: the set paints in ONE colour, the accent. currentColor made an icon read as a
  // letter and, in a heading, erased the only accent mark the heading had.
  check('the glyph paints in the one brand accent and still sizes with the font', kIcon.includes('background:var(--text-accent)') && kIcon.includes('width:1em;height:1em'));
  check('no icon CSS for a card that uses none', !kKpi.includes('.rc .ic{'));

  // @FIG (5.1.0): images and /fig motion are one component, because both are just
  // <img src> and build.py turns the reference into a data: URI.
  const kFig = await kitOf('<figure><img src="a.png" alt="x"><figcaption>c</figcaption></figure>');
  check('read_kit delivers the figure component for an image or a /fig animation', kFig.includes('.rc figure{') && kFig.includes('.rc figcaption{') && kFig.includes('max-width:100%'));
  check('a bare img is styled too, not only one inside a figure', kFig.includes('.rc img,'));
  check('no figure CSS for a card without one', !kKpi.includes('.rc figure{'));

  // @SECTIONS / @TABS / @PREVIEW (5.6.0). All three came out of one real report:
  // a long decision document with three parallel options.
  const kSec = await kitOf('<div class="numbered sections"><h3>یک</h3><h4>زیر</h4><h3>دو</h3></div>');
  check('read_kit delivers sections, and numbered alongside it when both are on the wrapper', kSec.includes('.rc .sections>h3{') && kSec.includes('.rc .numbered{counter-reset:sec}'));
  check('no sections CSS for a card without the wrapper', !kNum.includes('.rc .sections>h3{'));

  const kTabs = await kitOf('<div class="tabs"><a href="#p1">م ۱<span>الف</span></a><a href="#p2">م ۲<span>ب</span></a></div><h3 id="p1">الف</h3>');
  check('read_kit delivers the tab bar for a .tabs card', kTabs.includes('.rc .tabs{') && kTabs.includes('position:sticky'));
  check('no tab CSS for a card without a bar', !kKpi.includes('.rc .tabs{'));

  const kPrev = await kitOf('<a class="preview" href="https://x.test/p"><b>t</b><span>c</span><small>x.test</small></a><div class="preview live"><iframe src="https://x.test/p" title="t"></iframe></div>');
  check('read_kit delivers the preview card and its live frame together', kPrev.includes('.rc .preview{') && kPrev.includes('.rc .preview.live{') && kPrev.includes('.rc a.preview::after{'));
  check('no preview CSS for a card without one', !kKpi.includes('.rc .preview{'));

  // COMPLETENESS. A new @TAG with no detector would silently render unstyled.
  // This is the guard that makes adding a component fail loudly instead.
  // Read off the module rather than out of its source text: the detector table
  // IS the interface here, and a test that greps for a `const` name breaks on a
  // refactor that changed nothing it was meant to protect (it did, in 6.7.0).
  const detectors = new Set(Object.keys(require('./kit.js').DETECT));
  const tagsInSheet = new Set(require('./kit.js').componentTags());
  check('every @TAG in the sheet has a read_kit detector (' + [...tagsInSheet].length + ' components)', [...tagsInSheet].every((t) => detectors.has(t)) && [...detectors].every((d) => tagsInSheet.has(d)));

  /* SINGLE SOURCE (6.7.0). Every check below exists because the thing it pins was
   * spelled out in two or three files at once, with a comment in each promising
   * they matched, and at least one of them was wrong when this was written. The
   * cheapest way to keep them together is to make a copy fail here. */
  const blocksMod = require('./blocks.js');
  const kitMod = require('./kit.js');
  const assetsDir = path.join(__dirname, '..', 'assets');
  const src = (...f) => fs.readFileSync(path.join(...f), 'utf8').replace(/\r\n/g, '\n');

  // The vocabulary and the sheet must describe the SAME components: one in the
  // sheet with no entry renders with no instructions, one in the vocabulary with
  // no sheet renders unstyled.
  const inBlocks = new Set();
  for (const e of blocksMod.entries()) for (const tg of blocksMod.tagsOf(e)) inBlocks.add(tg);
  check('assets/blocks.md and assets/rc.css describe the same components (' + inBlocks.size + ')',
    [...tagsInSheet].every((tg) => inBlocks.has(tg)) && [...inBlocks].every((tg) => tagsInSheet.has(tg)));

  // The card tool's description is BUILT from that vocabulary, so a block cannot
  // be offered on one tier and forgotten on the other.
  const desc1 = blocksMod.forTier(1);
  const desc2 = blocksMod.forTier(2);
  check('the tier 1 description carries every chat shape and no report-only one',
    blocksMod.chat(1).every((e) => desc1.includes(e.shape)) &&
    blocksMod.entries().filter((e) => e.tier === 'r').every((e) => !desc1.includes(e.shape)));
  check('tier-2-only blocks reach the on-demand kit and stay out of the always-on description',
    blocksMod.chat(2).filter((e) => e.tier === '2').every((e) => desc2.includes(e.shape) && !desc1.includes(e.shape)));
  check('notes are tier 2 only, so the description the model always carries stays shapes',
    blocksMod.entries().filter((e) => e.notes && e.tier !== 'r').every((e) => desc2.includes(e.notes) && !desc1.includes(e.notes)));

  // Both tier 2 kits are generated. --check is the drift guard; without it the
  // files go stale silently, which is how kit.md ended up pinned two releases back.
  const gen = require('child_process').spawnSync(process.execPath,
    [path.join(__dirname, '..', 'tools', 'gen-kit.js'), '--check'], { encoding: 'utf8' });
  check('hooks/kit.md and hooks/kit-inline.md are regenerated from the sheet + the vocabulary',
    gen.status === 0, gen.stderr);
  const kitMd = src(__dirname, '..', 'hooks', 'kit.md');
  const kitInline = src(__dirname, '..', 'hooks', 'kit-inline.md');
  check('the CDN ref is a branch, so it can neither lag the plugin nor 404 on an unpushed tag',
    /claude-plugins@main\/readable\/assets\/rc\.css/.test(kitMd) && !/@readable-v/.test(kitMd));
  check('the offline kit needs no network at all', !/cdn\.jsdelivr/.test(kitInline));
  check('neither kit hands the model a framed card to draw inside the host\'s own frame',
    !/border-radius:14px/.test(kitMd.split('CONTENT')[0]) && !/border-radius:14px/.test(kitInline.split('CONTENT')[0]));
  check('the icon sprite is kept off the copy-by-hand path', !/class="ic /.test(kitInline.split('<!--@')[0].split('- ICON')[0] + 'x') && !/- ICON —/.test(kitInline));

  // The palette lived in the card template, the report shell and email.js.
  const paletteCss = src(assetsDir, 'palette.css');
  const shellHtml = src(__dirname, '..', 'skills', 'report', 'assets', 'shell.html');
  check('assets/palette.css is the only sheet that declares the palette',
    paletteCss.includes('--text-primary:#1f1f1f') &&
    !shellHtml.includes('--text-primary:#1f1f1f') && shellHtml.includes('{{PALETTE}}') &&
    !src(__dirname, 'theme.js').includes('#1f1f1f') && !src(__dirname, 'template.js').includes('#1f1f1f'));
  check('the card adapts it to html[data-theme=…] so a brand\'s dark block still wins by source order',
    require('./theme.js').palette().includes('html[data-theme="dark"]') &&
    !require('./theme.js').palette().includes(':root[data-theme'));

  // The LTR overrides lived in server.js as LTR_CSS and in build.py as EN_EXTRA.
  const buildPy = src(__dirname, '..', 'skills', 'report', 'build.py');
  check('assets/ltr.css is the only sheet that declares the LTR overrides',
    src(assetsDir, 'ltr.css').includes('rotate(225deg)') &&
    !buildPy.includes('rotate(225deg)') && !src(__dirname, 'theme.js').includes('rotate(225deg)'));

  // The font UA and subset allowlist were literals in both languages.
  check('assets/fonts.json is the only place the font fetch policy is written',
    src(assetsDir, 'fonts.json').includes('AppleWebKit') &&
    !buildPy.includes('AppleWebKit') && !src(__dirname, 'fonts.js').includes('AppleWebKit'));

  // 3b. kit source invariants that the chat template cannot see (report tier).
  const kit = fs.readFileSync(path.join(__dirname, '..', 'assets', 'rc.css'), 'utf8').replace(/\r\n/g, '\n');
  // @HUB (5.5.0): one thing connected to many. Eight rotated legs on a 3x3 grid, so the
  // invariants worth pinning are the ones a render cannot show at a glance.
  const kHub = await kitOf('<div class="hub"><div class="c">c</div><div class="s">a</div><div class="s out">b</div></div>');
  check('read_kit delivers the hub for a hub or a tree', kHub.includes('.rc .hub{') && (await kitOf('<div class="hub tree"><div class="c">r</div></div>')).includes('.rc .tree{'));
  check('no hub CSS for a card without one', !kKpi.includes('.rc .hub{'));
  const hubCss = kit.split('/*@HUB')[1].split('/*@BADGE')[0];
  // Rules only. The block's comment mentions both `.out` and `print-color-adjust`, so a
  // regex over the raw text can walk from one to the other and 'find' a colour that is prose.
  // The split ate the opening `/*@HUB`, so the doc comment has no opener left to match: drop
  // everything up to the first `*/` first, then any later comment.
  const hubRules = hubCss.replace(/^[^]*?\*\//, '').replace(/\/\*[^]*?\*\//g, '');
  // The centre owns the middle cell and the eight legs auto-flow around it, so a slot
  // carries only its own geometry. A missing slot leaves a leg pointing nowhere.
  check('all eight ring slots are declared, and only eight', (() => {
    const n = (hubCss.match(/\.rc \.hub>:nth-child\(\d\)/g) || []).map((m) => +m.match(/\d/)[0]);
    return n.length === 8 && n.join() === '2,3,4,5,6,7,8,9';
  })());
  // The row gap MUST equal the column gap: a corner cell's inner corner is then the same
  // distance across in both axes, which is the whole reason a 45deg leg lands on the
  // centre's corner with nothing measured. gap:44px 30px would break every diagonal.
  check('one gap for both axes, and the corner legs are that gap x 1.41 (+ the 9px radius)', /\.rc \.hub\{[^}]*gap:44px[;}]/.test(hubCss) && (hubCss.match(/--l:66px/g) || []).length === 4 && /--l:44px/.test(hubCss));
  // Connectors are BORDERS. print-color-adjust drops backgrounds, and a hub that prints
  // as boxes with no legs is not a hub.
  check('every connector is drawn with a border, never a background', hubCss.split('\n').filter((l) => /::(before|after)/.test(l)).every((l) => !/background/.test(l)) && (hubCss.match(/border-top:1\.5px|border-left:8px|border-inline-start:1\.5px/g) || []).length >= 3);
  check('print keeps the hub whole and un-inks its panels inside a card', kit.includes('.rc .card,.rc .cols>div,.rc .hub,.rc .preview{break-inside:avoid}') && /@media print\{[^]*:is\(\.kpi,\.flow \.s,\.hub \.c,\.hub \.s,/.test(kit));
  // RTL is one sign flip, not a second slot table: --r is read in the INLINE frame, so a
  // slot's angle is identical both ways and only the frame mirrors.
  check('rtl mirrors the frame, not the table: one :dir(rtl) rule flips --f/--o', hubCss.includes('.rc .hub:dir(rtl){--f:-1;--o:100%}') && !/:dir\(rtl\)[^}]*--r:/.test(hubCss));
  // The head is a SOLID triangle (one thick border-left between transparent caps), and it
  // must use a PHYSICAL border so scaleX(-1) mirrors it exactly once; a logical
  // border-inline-start mirrors twice and turns the arrow back on its own box.
  check('the head is a solid border triangle, mirrored by scaleX exactly once', /\.s::after\{[^}]*border:3px solid transparent;border-right:0;border-left:8px solid var\(--cb\)[^}]*transform:scaleX\(var\(--f\)\)/.test(hubCss));
  // A triangle is narrower than a 1.5px line for the last 2px before its point, so a line
  // run all the way to the tip pokes a blunt nub through it. The line stops at the head's
  // CENTRE (--w) and the head covers the rest, which is what makes them one silhouette.
  check('the line stops at the head centre, so no nub pokes through the point', /--w:calc\(var\(--l\) - 4px\);--d:var\(--w\)/.test(hubCss) && /\.s::before\{width:var\(--w\)/.test(hubCss));
  check('an out head keeps the full line and sits its tip 2px inside its own box', /\.rc \.hub \.out\{--a:180deg;--w:var\(--l\);--d:2px\}/.test(hubCss));
  // Direction, not a second hue: the whole component speaks one accent ramp.
  check('out only turns the arrow around; it never buys a second colour', /\.rc \.hub \.out\{--a:180deg/.test(hubRules) && !/\.out[^}]*(color|--cd)/.test(hubRules));
  // The tree root spans every row, and -1 needs EXPLICIT rows to mean the last line -
  // without them it collapses to one row and the root lands in the wrong column.
  check('the tree root spans the explicit rows it needs, column pinned too (grid-area:2/2 pins column 2)', hubCss.includes('grid-template-rows:repeat(40,auto)') && hubCss.includes('.rc .tree>.c{grid-area:1/1/-1/2') && /gap:0 26px/.test(hubCss));
  check('the tree draws no arrowheads: the arrow rule is scoped out of it', hubCss.includes('.rc .hub:not(.tree) .s::after{'));
  // Below 520px the ring cannot hold. It must NOT become a chain of box-to-box arrows,
  // which would claim HRIS feeds Jira; every leg becomes the same tick off its own box.
  check('narrow reflow is one column with one shared leg, never a box-to-box chain', /@media\(max-width:520px\)\{[^]*grid-template-columns:1fr[^]*\.rc \.hub \.s\{--x:0;--y:50%;--r:180deg/.test(hubCss));
  // Order is load-bearing: .tree sits AFTER the media query so it keeps two columns at
  // every width without repeating :not(.tree) inside the query.
  check('the tree block follows the media query, so it survives the narrow override', hubCss.lastIndexOf('.rc .tree{') > hubCss.lastIndexOf('@media(max-width:520px)'));
  check('a hub nested in a card or box still reads (child inversion lists .c and .s)', kit.includes('.hub .c,.hub .s,.bar .t'));

  // RULES ONLY. Every block below is heavily commented and the comments name the very things
  // the checks forbid (`::before`, `:first-child`, `requestAnimationFrame`), so a regex over the
  // raw text walks straight into prose and 'finds' the bug it was written to catch. The split
  // ate the opening `/*`, so the doc comment has no opener left to match: drop everything up to
  // the first `*/`, then any later comment.
  const rules = (s) => s.replace(/^[^]*?\*\//, '').replace(/\/\*[^]*?\*\//g, '');

  // @SECTIONS (5.6.0): same shape as @NUMBERED, and the two must compose.
  const secCss = rules(kit.split('/*@SECTIONS')[1].split('/*@TABS')[0]);
  check('a section break is DIRECT CHILDREN only, so an h3 inside a card or a fold keeps its size', /\.rc \.sections>h3\{/.test(secCss) && !/\.rc \.sections h3\{/.test(secCss));
  // The number lives on h3::before and this touches only the box, which is the whole reason
  // `numbered sections` needs nothing reconciled. A ::before here would eat the numbering the
  // same way the icon rule once did.
  check('sections never touches ::before, so a numbered document keeps its section numbers', !secCss.includes('::before'));
  check('one size up, landing between h3 and h2 rather than competing with the title', /font-size:1\.25em/.test(secCss));
  // The rule has to land for a reader scrolling PAST at speed, which is the only reason the
  // component exists. At the kit's .5px/--border hairline (what an hr and a kv row use, for
  // things a reader is already looking at) it was the faintest mark the sheet can draw and
  // still needed looking for on a light theme. --border-strong at 1px, which is also how the
  // kit pairs that token everywhere else: 1.5px on a thead, 2.5px on a blockquote, 3px on a cal.
  check('the section rule is the STRONG border, not the faintest hairline in the kit', /border-top:1px solid var\(--border-strong\)/.test(secCss) && !/border-top:\.5px solid var\(--border\)/.test(secCss));
  // Keyed on TYPE: whatever sits between the wrapper and its first heading (an intro, a .box
  // summary, a tab bar), the first section must not wear a rule under the one already above it.
  check('the first section carries no rule, keyed on :first-of-type and not :first-child', secCss.includes('.rc .sections>h3:first-of-type{') && /:first-of-type\{[^}]*border-top:none/.test(secCss) && !secCss.includes(':first-child'));

  // @TABS (5.6.0): report tier. The bar, the jump and the landing offset are CSS; only the
  // follow-on-scroll highlight is script. Both traps below cost a field debugging round.
  const tabCss = rules(kit.split('/*@TABS')[1].split('/*@DONUT')[0]);
  const shellSrc = fs.readFileSync(path.join(__dirname, '..', 'skills', 'report', 'assets', 'shell.html'), 'utf8');
  check('the bar is sticky, wraps instead of scrolling sideways, and every flex item can shrink under its content', /position:sticky/.test(tabCss) && /flex-wrap:wrap/.test(tabCss) && /min-width:0/.test(tabCss));
  // The sticky offset is the SHELL's geometry: the report floats a theme toggle, a Copy/PDF pair
  // and the ... menu in 34px circles at top:16px, and at top:10px the bar shared that band — at
  // 375px the print button clipped the first tab's label and the menu covered the last one, so a
  // phone reader could not press either. Both numbers are read here so moving one fails loudly.
  check('the bar pins below the report shell\'s own fixed chrome, read off both files', (() => {
    const top = +(tabCss.match(/\.rc \.tabs\{position:sticky;top:(\d+)px/) || [])[1];
    const seat = +(shellSrc.match(/\.theme-toggle\{position:fixed;top:(\d+)px/) || [])[1];
    const size = +(shellSrc.match(/\.theme-toggle\{[^}]*height:(\d+)px/) || [])[1];
    return top >= seat + size && seat > 0 && size > 0;
  })());
  // The basis decides how many tabs a line holds, and the sheet is content-box everywhere else:
  // at 7em content-box, three tabs measured 292px against 252px of room on a phone.
  check('the flex basis means the tab\'s real width, which is the one place the kit sets box-sizing', /box-sizing:border-box;flex:1 1 5\.5em/.test(tabCss) && (rules(kit).match(/box-sizing/g) || []).length === 1);
  // THE degrade: with the script stripped the bar is still plain anchors, so the landing offset
  // has to live in the stylesheet with a fallback, or a jump parks the heading under the bar.
  check('scroll-margin-top lives in the CSS with a fallback, so a script-less report still lands clear of the bar', tabCss.includes('.rc:has(.tabs) h3[id]{scroll-margin-top:var(--tabh,'));
  check('the target is h3[id], so the author writes nothing the tab link did not already need', !tabCss.includes('tabtarget'));
  // BASE hands every <a> a 1px bottom border on hover. A bare border-color leaves that width in
  // place and every tab grows half a pixel under the pointer; and the two rules tie on
  // specificity, so the active rule has to come LAST or hovering the active tab greys it out.
  check('hover re-declares the whole border, and the active rule follows it so the active tab survives the pointer', /\.rc \.tabs a:hover\{border:\.5px solid/.test(tabCss) && tabCss.indexOf('a[aria-current]') > tabCss.indexOf('a:hover'));
  check('the active tab is an aria state, not a class, so the highlight is announced as well as drawn', tabCss.includes('.rc .tabs a[aria-current]{') && shellSrc.includes("setAttribute('aria-current'"));
  // Sub-labels at three tabs across a phone truncate to four characters of mush.
  check('below 520px the sub-labels are hidden rather than ellipsed to mush', /@media\(max-width:520px\)\{\.rc \.tabs a span\{display:none\}\}/.test(tabCss));
  check('the bar leaves the page in print', /@media print\{[^]*\.rc \.tabs,\.rc \.preview\.live\{display:none\}/.test(kit));
  // TRAP 1, paid for once already: rAF is throttled to zero in a hidden tab, so the bar freezes
  // on whatever was active when the tab lost focus and is wrong when the reader comes back.
  const spy = rules(shellSrc.split('@TABS scrollspy')[1].split('/* PNG export')[0]);
  check('the scrollspy runs straight off the scroll event, never through requestAnimationFrame', /addEventListener\('scroll', sync/.test(spy) && !/requestAnimationFrame/.test(spy));
  // TRAP 2: the bar WRAPS. Six tabs on a phone are three flex lines, and a hardcoded offset
  // parks the heading behind rows two and three. Both consumers read one measured number.
  check('the bar height is measured, and its sticky offset is read off the bar instead of spelled twice', /getBoundingClientRect\(\)\.height/.test(spy) && /getComputedStyle\(bar\)\.top/.test(spy) && /setProperty\('--tabh'/.test(spy));
  // The webfont lands AFTER first paint and changes the bar's height with no resize event.
  check('re-measured by ResizeObserver, so the webfont reflow is caught too', /new ResizeObserver\(hold\)\.observe\(bar\)/.test(spy));
  check('a report with no bar runs no scrollspy at all', /querySelector\('\.tabs'\);\s*\n?\s*if \(!bar\) return;/.test(spy.replace(/\r/g, '')));
  check('the jump animates from the stylesheet, and honours reduced motion (scroll-behavior does not on its own)', shellSrc.includes('html{scroll-behavior:smooth}') && shellSrc.includes('@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}'));

  // @PREVIEW (5.6.0): a link to another document, drawn as a document.
  const prevCss = rules(kit.split('/*@PREVIEW')[1].split('/*@NUMBERED')[0]);
  const buildSrc = fs.readFileSync(path.join(__dirname, '..', 'skills', 'report', 'build.py'), 'utf8');
  // The live frame is a SIBLING, never a wrapper: that is what makes the fallback free, because
  // the card it falls back to is already on the page and nothing has to be rebuilt.
  check('the frame joins the card above it into one silhouette, and neither owns the other', prevCss.includes('.rc .preview:has(+.preview.live){') && prevCss.includes('.rc .preview+.preview.live{margin-top:0;border-top:none'));
  check('print drops the frame and gives the card its own radius back (tying the :has rule, which only print being last can do)', /@media print\{[^]*\.rc \.preview:has\(\+\.preview\.live\)\{margin-bottom:\.9em;border-end-start-radius:11px/.test(kit));
  // Fixed SCALE, and the logical width follows the container. Pinning the logical width instead
  // would hold a desktop layout at 0.24 on a phone, i.e. 4px text.
  check('the frame renders at 1/--s and is scaled back by exactly --s, so a desktop page reads at report width', /width:calc\(100%\/var\(--s\)\);height:calc\(100%\/var\(--s\)\)/.test(prevCss) && /transform:scale\(var\(--s\)\)/.test(prevCss) && /--s:\.7/.test(prevCss));
  // Same one-sign idiom as @HUB: an RTL frame must not scale away from the edge it is pinned to.
  check('rtl flips the transform origin only, via one :dir(rtl) rule', prevCss.includes('.rc .preview.live:dir(rtl){--o:100%}') && /transform-origin:var\(--o\) 0/.test(prevCss));
  check('a transparent lid covers the frame, so the wheel scrolls the report instead of the target', /\.rc \.preview\.live::after\{content:'';position:absolute;inset:0\}/.test(prevCss));
  // The lid and the corner mark would otherwise land on the same pseudo-element, and the lid
  // would come out as a 6px bordered corner.
  check('the corner mark is scoped to a.preview so it can never become the frame lid', prevCss.includes('.rc a.preview::after{') && !/\.rc \.preview::after/.test(prevCss));
  check('the corner mark is borders, not an icon glyph, and flips with the reading direction', /border-top:1\.5px solid var\(--text-accent\)/.test(prevCss) && prevCss.includes('.rc a.preview:dir(rtl)::after{transform:rotate(-45deg)}') && !prevCss.includes('class="ic'));
  check('the card cancels BASE\'s link colour and its hover underline with the border shorthand', /\.rc a\.preview:hover\{border:\.5px solid var\(--text-accent\)/.test(prevCss) && /\.rc \.preview\{[^}]*color:var\(--text-primary\)|\.rc a\.preview\{[^}]*color:var\(--text-primary\)/.test(prevCss));
  // RUNTIME CANNOT KNOW: a frame blocked by X-Frame-Options still fires load, its document is
  // cross-origin either way, and a file:// report cannot fetch the url to look. So the probe is
  // build.py's, and both refusal headers are read - CSP frame-ancestors is the modern spelling.
  check('build.py probes framing at build time and reads BOTH refusal headers', buildSrc.includes('def frames_ok(') && buildSrc.includes('x-frame-options') && buildSrc.includes('frame-ancestors'));
  // A report is opened from disk, so its origin is null: only `*` or no policy lets it through.
  check('a host allowlist counts as a refusal, because a file:// report has a null origin', buildSrc.includes('if [p for p in parts[1:] if p != "*"]'));
  check('unreachable counts as refusing: an empty box in a finished document is worse than a card with no picture', buildSrc.includes('return False, "unreachable'));
  check('the refusal drops the block and says so, keeping the plain card', buildSrc.includes('kept the plain card') && buildSrc.includes('PREVIEW_LIVE_RE.sub(live, content)'));
  // Same reason section numbers come off a counter: the document already holds the fact.
  check('the host comes off the href, so nobody types it and nobody can mistype it', buildSrc.includes('urlparse(href.group(1)).hostname') && buildSrc.includes('"<small>" + host + "</small>"'));
  check('a live block is matched by its own class pair, never by a generic div (re.sub consumes what it matches)', buildSrc.includes('PREVIEW_LIVE_RE = re.compile(') && !/PREVIEW_LIVE_RE = re\.compile\(r"\(\?is\)<div\\b\[\^>\]\*>/.test(buildSrc));
  check('the probe is skippable without touching the markup', buildSrc.includes('--no-preview-probe'));

  // Judged on the kit source, not the template: menu.js carries its own chrome
  // radii (7/8/12px) which are not on the kit's scale and never should be.
  // Hairlines under 5px on 4-9px decorations (dots, tracks, rules) are off-scale
  // by design, so the filter starts at 5.
  // A dot heading is a 7px square plus the slot remainder; an icon heading is a 1em glyph.
  // One 1em slot for both, so sections keep one left edge whichever marker they carry, and
  // @NUMBERED cancels the remainder because its number brings its own width.
  check('the h3 marker sits in a 1em slot, so dot and icon headings start their text alike', kit.includes('margin-inline-end:calc(1em - 7px)') && kit.includes('.rc .numbered>h3::before{content:counter(sec,persian) \'.\';width:auto;height:auto;margin-inline-end:0'));
  // 5.2.0 palette: --ca..--cc are one accent ramp and --cd is the only literal hue, so a
  // brand that sets --text-accent recolours every state, chip, callout and chart series.
  check('the kit speaks two hues: an accent ramp plus one negative red', /--ca:var\(--text-accent\);--cb:color-mix\(in srgb,var\(--text-accent\) \d+%/.test(kit) && (kit.match(/#[0-9a-f]{6}/gi) || []).filter((h) => !['#000', '#fff'].includes(h.toLowerCase())).length === 1);
  check('no status hue is hard-coded past the token block: green/amber tints are gone', !kit.includes('--bg-success') && !kit.includes('--bg-warning'));
  // An LTR card used to inherit text-align:right from the RTL default.
  check('alignment is logical, so an LTR card hangs its text on the left', !/text-align:right/.test(kit));
  check('radius scale is four tokens: 5 inline / 9 small panel / 11 panel / 20 pill (+14 frame)', (() => {
    const radii = [...new Set((kit.match(/border-radius:(\d+)px/g) || []).map((m) => +m.match(/\d+/)[0]))].filter((n) => n >= 5);
    return radii.length > 0 && radii.every((n) => [5, 9, 11, 14, 20].includes(n));
  })());
  const tail = kit.split('/*@REPORT')[1];
  // The child inversion ties with `.rc .badge.ok` on specificity (0,3,0). @CARD
  // sits BELOW @BADGE, so the inversion wins on order and the semantic chip
  // colours must be re-asserted after it, or every chip inside a card and box
  // greys out. Order, not specificity, is what keeps them: assert it. Two tints
  // now, not three (5.2.0): accent for ok/info, red for warn.
  check('semantic chips survive inside a panel: the badge restore follows the child inversion (4.19.0)', (() => {
    const inv = tail.indexOf(':is(.kpi,pre,code,.badge');
    const ok = tail.indexOf(':is(.card,.box) .badge.ok');
    return inv > -1 && ok > inv && ['.badge.info{background:var(--bg-accent)', '.badge.warn{background:var(--bg-danger)'].every((s) => tail.includes(s));
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

  // 6b. THE email contract (5.4.0). Email clients are not browsers: Gmail
  // strips <style> on forward, Outlook renders through Word. Every feature
  // below is unsupported there, and the pseudo-element row is the one that
  // fails SILENTLY — a list keeps its text and loses its bullets. One card
  // using every layout component, then the whole forbidden class asserted at
  // once. Cheap, and it catches the entire regression family.
  const FULL = '<h2>گزارش</h2><p class="lead">خلاصه</p><ul><li>ساده</li><li class="ok">پاس</li></ul>' +
    '<div class="grid c3"><div class="kpi"><div class="l">درآمد</div><div class="n">۱.۲M<span class="trend up">۱۸٪</span></div></div><div class="kpi"><div class="l">کاربر</div><div class="n">۸۴۰</div></div><div class="kpi"><div class="l">نرخ</div><div class="n">۳٪</div></div></div>' +
    '<div class="kv"><div><b>مسئول</b><span>تیم</span></div></div>' +
    '<div class="bars"><div class="bar"><span class="l">وب</span><span class="t"><i style="width:72%"></i></span><span class="v">۷۲٪</span></div></div>' +
    '<div class="cards c2"><div class="card"><h4>الف</h4><p>م</p></div><div class="card pick"><h4>ب</h4><p>م</p></div></div>' +
    '<div class="cols"><div><p>مزیت</p></div><div><p>ایراد</p></div></div>' +
    '<div class="box"><div class="lbl">جمع‌بندی</div><p>خوب</p></div>' +
    '<div class="tl"><div><b>تیر</b>شروع</div></div>' +
    '<div class="numbered"><h3>یک</h3><h4>زیر</h4><h3>دو</h3></div>' +
    '<div class="donut-w"><div class="donut" style="--a:60"></div><div class="leg"><span class="a"><i></i>الف ۶۰٪</span></div></div>' +
    '<details class="fold"><summary>جزئیات</summary><p>بدنه</p></details>' +
    '<blockquote><p>نقل</p><cite>منبع</cite></blockquote>' +
    '<figure><img src="data:image/png;base64,AAAA"><figcaption>نمودار</figcaption></figure>' +
    '<h3><i class="ic check"></i>پایان</h3>';
  const emAll = (await rpc('tools/call', { name: 'render_email', arguments: { html: FULL, theme: 'light' } })).content[0].text;
  const FORBIDDEN = ['var(--', 'display:grid', 'display:flex', '::before', '::after', 'color-mix(', ':is(', 'inset-inline'];
  check('email carries none of the features no client runs', FORBIDDEN.every((f) => !emAll.includes(f)));
  check('email carries no class-based styling at all', !emAll.includes('class='));
  // <table> is the one layout primitive every client supports, so every block
  // that is grid or flex on screen has to arrive as one.
  check('kpi grid becomes a real table, one cell per tile', /<table[^>]*cellspacing="8"[^>]*>(?:(?!<\/table>)[\s\S])*?۱\.۲M/.test(emAll));
  check('cards, cols, kv, bars, callout and box are all tables', (emAll.match(/<table/g) || []).length >= 9);
  check('every table declares its own direction (Word resolves dir per table)', !/<table(?![^>]*\bdir=)/.test(emAll));
  check('cells align by attribute, not by text-align (Word ignores the CSS)', emAll.includes('<td align="right"'));
  // Pseudo-elements are the silent failure: the text survives, the marker does
  // not, and a counter cannot come back at all because it was never a character.
  check('bullets, timeline dots and legend swatches are real characters', emAll.includes('•') && emAll.includes('●') && emAll.includes('■'));
  check('section numbers are written into the headings as Persian digits', emAll.includes('۱.') && emAll.includes('۱.۱') && emAll.includes('۲.'));
  // h4 is also the kit's CARD title, so the counter has to reach one level and
  // stop, exactly like the kit's `>`. A descendant rule numbers every card in a
  // `cards` row and pushes the real section h4 down the sequence.
  const emNest = (await rpc('tools/call', { name: 'render_email', arguments: { html:
    '<div class="numbered"><h3>یک</h3><div class="cards c2"><div class="card"><h4>عنوان کارت</h4></div></div><h4>زیربخش</h4><h3>دو</h3></div>' } })).content[0].text;
  check('numbering counts direct children only, never a nested card title', JSON.stringify(emNest.match(/[۰-۹]+\.[۰-۹]*/g)) === JSON.stringify(['۱.', '۱.۱', '۲.']));
  const emHref = (await rpc('tools/call', { name: 'render_email', arguments: { html: '<p><a href="https://x.test/?a=1&amp;b=2">لینک</a></p>' } })).content[0].text;
  check('a link keeps its href intact (an already-escaped & is not escaped twice)', emHref.includes('href="https://x.test/?a=1&amp;b=2"'));
  check('the heading mark survives as a glyph, and an icon heading keeps it', (emAll.match(/▪/g) || []).length === 1 && !emAll.includes('<i'));
  // Undrawable in a mail, so each degrades to what still carries meaning.
  check('a fold exports already open (<details> never opens in a mail)', !emAll.includes('<details') && emAll.includes('جزئیات') && emAll.includes('بدنه'));
  check('a donut ships its legend numbers, not a broken ring', !emAll.includes('<svg') && emAll.includes('الف ۶۰٪'));
  check('a data-URI figure falls back to its caption (Gmail draws neither)', !emAll.includes('<img') && emAll.includes('نمودار'));
  const EM_BRAND = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-embrand-')), '.readable');
  fs.mkdirSync(EM_BRAND);
  fs.writeFileSync(path.join(EM_BRAND, 'brand.css'),
    ':root{--text-accent:#C2410C}\n[data-theme="dark"]{--text-accent:#FB923C}\n');
  const emBrand = (await rpc('tools/call', { name: 'render_email', arguments: {
    html: '<h2>گزارش</h2><ul><li>یک</li></ul>', theme: 'light', brand: EM_BRAND,
  } })).content[0].text;
  check('a branded card exports in its own colours, not the kit blue', emBrand.includes('#C2410C') && !emBrand.includes('#2f66c4'));
  const emNoBrand = (await rpc('tools/call', { name: 'render_email', arguments: {
    html: '<h2>گزارش</h2><ul><li>یک</li></ul>', theme: 'light', brand: '/nonexistent/.readable',
  } })).content[0].text;
  check('a dangling brand arg degrades to the kit palette, never an error', emNoBrand.includes('#2f66c4'));
  // ONE transform, or the two hosts drift again the way they did before 5.4.0.
  const emailSrc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'email.js'), 'utf8');
  const emailShell = fs.readFileSync(path.join(__dirname, '..', 'skills', 'report', 'assets', 'shell.html'), 'utf8');
  check('the transform lives in assets/email.js and nowhere else', emailSrc.includes('__rcEmailRender') && !fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').includes('function renderEmail'));
  check('the report inlines that same file instead of its own walker', emailShell.includes('{{EMAIL}}') && emailShell.includes('__rcEmailRender') && !emailShell.includes('EMAIL_PROPS'));
  check('the card asks the server for it, and hands over its brand dir', html.includes("name:'render_email'") && html.includes('brand:bLoaded'));

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
    // The ui extension rides along because this block is about brand
    // resolution, and since 6.0.0 a host without it gets the card tool refused
    // outright rather than a result to inspect.
    srv4.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: { roots: { listChanged: true }, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } } } }) + '\n');
    srv4.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  });
  check('multi-root: a brand-less call is never guessed (4.13.1)', mr[11].result.structuredContent.brand === undefined && mr[11].result.structuredContent.html === '<p>a</p>');
  check('multi-root: an explicit brand dir still wins', mr[12].result.structuredContent.brand === path.join(MR_B, '.readable'));
  check('lone root resumes auto-branding after roots/list_changed', mr[13].result.structuredContent.brand === path.join(MR_B, '.readable'));
  srv4.kill();

  // 8c-bis. THE CAPABILITY GATE (6.0.0). A host with no MCP Apps extension
  // cannot paint, so the card tool is not listed and a call to it is refused.
  // Before this, such a host got the tool, got a successful result carrying
  // "it did not render", and the html rode structuredContent into the
  // transcript as raw markup while the model signed off with "card delivered
  // above" over a reply nobody saw. The export tools stay: they touch the
  // filesystem, not the screen, and are useful on any host.
  const srv5 = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: ['pipe', 'pipe', 'inherit'], env: env3, cwd: NEUTRAL_CWD });
  const gate = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout: capability gate')), 3000);
    let b = '';
    const got = {};
    srv5.stdout.on('data', (d) => {
      b += d;
      let j;
      while ((j = b.indexOf('\n')) !== -1) {
        const l = b.slice(0, j); b = b.slice(j + 1);
        if (!l.trim()) continue;
        const m = JSON.parse(l);
        if (m.id != null) got[m.id] = m;
        if (m.id === 3) { clearTimeout(t); resolve(got); }
      }
    });
    srv5.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'no-ui-host', version: '1' } } }) + '\n');
    srv5.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    srv5.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'card', arguments: { html: '<p>x</p>' } } }) + '\n');
  });
  const gateNames = gate[2].result.tools.map((t) => t.name);
  check('no MCP Apps host: the card tool is not listed at all (6.0.0)', !gateNames.includes('card'));
  check('no MCP Apps host: the export tools are still listed', ['save_card', 'render_email', 'read_card_file', 'copy_text', 'read_brand', 'read_fonts', 'read_kit'].every((n) => gateNames.includes(n)));
  check('no MCP Apps host: a card call is an ERROR, never a result', Boolean(gate[3].error) && gate[3].result === undefined);
  check('the refusal tells the model to deliver text and stop calling', /deliver the whole reply as text/i.test(gate[3].error.message) && /do not call this tool again/i.test(gate[3].error.message));
  check('the refusal never echoes the html back into the transcript', !JSON.stringify(gate[3]).includes('<p>x</p>'));
  srv5.kill();

  // READABLE_FORCE_UI is the escape hatch for a host whose handshake lands
  // late: same no-extension initialize, card tool back on the list.
  const srv6 = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: ['pipe', 'pipe', 'inherit'], env: Object.assign({}, env3, { READABLE_FORCE_UI: '1' }), cwd: NEUTRAL_CWD });
  const forced = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout: force-ui')), 3000);
    let b = '';
    srv6.stdout.on('data', (d) => {
      b += d;
      let j;
      while ((j = b.indexOf('\n')) !== -1) {
        const l = b.slice(0, j); b = b.slice(j + 1);
        if (!l.trim()) continue;
        const m = JSON.parse(l);
        if (m.id === 2) { clearTimeout(t); resolve(m); }
      }
    });
    srv6.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }) + '\n');
    srv6.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
  });
  check('READABLE_FORCE_UI=1 puts the card tool back', forced.result.tools.map((t) => t.name).includes('card'));
  srv6.kill();

  // READABLE_NO_CARD is the opposite and it must WIN, even against a client that
  // declares the MCP Apps extension. 6.0.0 added a plugin-scoped copy of this
  // server on the theory that the capability gate made it safe; it did not,
  // because Claude Code's plugin bridge declares the extension and still cannot
  // paint. So that copy was handed the card tool, accepted the call, and the
  // html came back as structuredContent and printed raw in the chat: the exact
  // defect 6.0.0 existed to kill, reintroduced by 6.0.0. The scoped server now
  // sets this env var and carries the export tools only.
  const srv8 = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: Object.assign({}, env3, { READABLE_NO_CARD: '1', READABLE_FORCE_UI: '1' }),
    cwd: NEUTRAL_CWD,
  });
  const nocard = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout: no-card')), 3000);
    let b = '';
    const got = {};
    srv8.stdout.on('data', (d) => {
      b += d;
      let j;
      while ((j = b.indexOf('\n')) !== -1) {
        const l = b.slice(0, j); b = b.slice(j + 1);
        if (!l.trim()) continue;
        const m = JSON.parse(l);
        if (m.id != null) got[m.id] = m;
        if (m.id === 3) { clearTimeout(t); resolve(got); }
      }
    });
    srv8.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } } } }) + '\n');
    srv8.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    srv8.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'card', arguments: { html: '<p>x</p>' } } }) + '\n');
  });
  check('READABLE_NO_CARD=1 beats a client that DECLARES the ui extension (6.4.0)',
    !nocard[2].result.tools.map((t) => t.name).includes('card'));
  check('READABLE_NO_CARD=1 beats READABLE_FORCE_UI=1 too', nocard[2].result.tools.length === 7);
  check('and a card call there is refused, not answered', Boolean(nocard[3].error));
  srv8.kill();

  // the scoped server must not be able to shadow the desktop one by name
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8'));
  const scoped = Object.keys(manifest.mcpServers || {});
  check('the plugin-scoped server is NOT named readable-card', !scoped.includes('readable-card'));
  check('the plugin-scoped server hard-disables its card tool', scoped.every((k) => manifest.mcpServers[k].env && manifest.mcpServers[k].env.READABLE_NO_CARD === '1'));

  // The rule has to separate "not offered" from "offered but not yet loaded".
  // Collapsing them cost a full day: on a host that defers MCP tools, the card
  // server was connected, negotiating the UI and offering the tool, and every
  // Persian reply still came out as a tier 2 widget because the rule said "in
  // your list" and the tool was one search away instead of already loaded.
  const ruleTxt = fs.readFileSync(path.join(__dirname, '..', 'hooks', 'rule.md'), 'utf8');
  check('the rule says deferred counts as present (6.5.0)', /[Dd]eferred is not absent/.test(ruleTxt));
  check('the rule still forbids searching for a name nothing offered', /never .*search for, or call, a name that nothing has offered/i.test(ruleTxt));
  check('the rule resolves the tier up front, not per reply (6.5.1)', /Resolve your tier ONCE, before your first reply/.test(ruleTxt));
  check('and forbids skipping the load for a short reply', /too small to be worth it/.test(ruleTxt));

  // A byte budget, enforced rather than promised. rule.md is injected into EVERY
  // session whether a card is used or not, so it is the one payload that must
  // stay small. 6.5.1 had grown to 9,021 bytes, about 2,255 tokens a session,
  // and roughly half of that was the block vocabulary repeated from the card
  // tool's own description.
  check('rule.md stays under 5KB, since every session pays for it (6.6.0)', Buffer.byteLength(ruleTxt) < 5120);
  check('rule.md does not duplicate the block vocabulary the tool already ships',
    !/Build the card content from these blocks only/.test(ruleTxt) && /ships it in its own description/.test(ruleTxt));

  // 8c-ter. CLIPBOARD ENCODING (5.7.0). Inside the MCP Apps iframe every Copy
  // goes through copy_text into pbcopy, and the server is started by a GUI app
  // that passes down no locale at all. macOS tools read a locale-less
  // environment as Mac OS Roman, so pbcopy decoded each UTF-8 byte as its own
  // MacRoman glyph and "مستند" landed on the clipboard as "ŸÖÿ≥ÿ™ŸÜÿØ". The
  // bytes were always right; the far end's transcoding was not. This probe
  // stands in for pbcopy and checks both halves: exact UTF-8 bytes on stdin,
  // and an LC_CTYPE that makes the receiver read them as UTF-8.
  const PROBE_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-copy-'));
  const probeOut = path.join(PROBE_DIR, 'out.bin');
  const probeCtype = path.join(PROBE_DIR, 'ctype.txt');
  const probe = path.join(PROBE_DIR, 'copyprobe.sh');
  fs.writeFileSync(probe, '#!/bin/sh\ncat > "' + probeOut + '"\nprintf %s "${LC_CTYPE-unset}" > "' + probeCtype + '"\n');
  fs.chmodSync(probe, 0o755);
  const FA = 'مستند شد و در حافظه هم رفت';
  const srv7 = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: Object.assign({}, process.env, { READABLE_COPY_CMD: probe, LC_CTYPE: '', LANG: '' }),
    cwd: NEUTRAL_CWD,
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout: copy probe')), 3000);
    let b = '';
    srv7.stdout.on('data', (d) => {
      b += d;
      let j;
      while ((j = b.indexOf('\n')) !== -1) {
        const l = b.slice(0, j); b = b.slice(j + 1);
        if (!l.trim()) continue;
        if (JSON.parse(l).id === 2) { clearTimeout(t); resolve(); }
      }
    });
    srv7.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }) + '\n');
    srv7.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'copy_text', arguments: { text: FA } } }) + '\n');
  });
  srv7.kill();
  check('copy_text writes exact UTF-8 bytes, never a re-encoding (5.7.0)', fs.readFileSync(probeOut).equals(Buffer.from(FA, 'utf8')));
  check('copy_text hands the clipboard helper a UTF-8 LC_CTYPE even when the app passed none', /UTF-8/i.test(fs.readFileSync(probeCtype, 'utf8')));
  check('the round trip survives: bytes back out as the same Persian text', fs.readFileSync(probeOut, 'utf8') === FA);

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

  // 8e. SIGNATURE (5.2.0): one muted line under every artifact readable produces.
  // The whole design rests on TWO invariants, and these assert both: there is
  // exactly ONE literal (rc.css's @sig line, which every build/assembly path
  // reads), and it mounts as the LAST CHILD OF .rc, which is what makes the five
  // menu exports carry it with no per-format code.
  const sigLine = (kit.match(/@sig[ \t]+(<[^\n]+)/) || [])[1];
  check('rc.css carries exactly one @sig marker and it is the markup itself', Boolean(sigLine) && (kit.match(/@sig[ \t]+</g) || []).length === 1 && sigLine.indexOf('<div class="sig">') === 0 && /<\/div>$/.test(sigLine));
  // The link TEXT is the bare domain, which is the whole degrade-gracefully trick:
  // png rasterizes it and innerText copies it, so both carry a usable address
  // without any markup or a second plain-text definition.
  check('the signature links to smk-labs and its link TEXT is the bare domain, so png and plain text degrade to readable text', sigLine.includes('href="https://github.com/smk-labs"') && sigLine.includes('>github.com/smk-labs</a>'));
  check('signature is text only: no emoji, and no dependency on the @ICON sprite', !sigLine.includes('class="ic') && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(sigLine));

  // BASE, not a @TAG: it ships unconditionally, so a component snippet would be
  // selected on 100% of cards, and read_kit's 1500ms deadline would leave it
  // unstyled - a full-size accent link competing with the content.
  const kitBase = kit.split('/*@')[0];
  check('signature css lives in BASE, so it never waits on a read_kit round trip', kitBase.includes('.rc .sig{') && kitBase.includes('.rc .sig a{color:inherit}') && !kit.includes('/*@SIG'));
  check('signature is muted, small, seated under the line ends, and its link refuses the accent colour', /\.rc \.sig\{[^}]*font-size:\.8em/.test(kit) && /\.rc \.sig\{[^}]*color:var\(--text-secondary\)/.test(kit) && /\.rc \.sig\{[^}]*text-align:end/.test(kit) && /\.rc \.sig\{[^}]*border-top:\.5px solid var\(--border\)/.test(kit));
  // text-align:end + inherited direction is what mirrors it correctly; plaintext
  // would re-resolve `end` against the line's own LTR run and flip Persian to the
  // wrong corner.
  check('signature is NOT in the unicode-bidi:plaintext list (that would flip its corner in RTL)', !/plaintext[^\n]*\.sig|\.sig[^\n]*plaintext/.test(kit));
  const kSig = await kitOf(sigLine);
  check('read_kit ships nothing for the signature: it is BASE, already in the template', kSig === '');

  // The template holds the ONE literal, byte for byte, frozen at assembly time.
  check('template mounts the signature as the last child of #card, from the rc.css literal verbatim', html.includes(".rc .sig{") && html.includes("var SIG='" + sigLine + "'") && html.includes("c.innerHTML=html+(noSig?'':SIG)"));
  check('the signature costs the model nothing: absent from the tool description and from every reply the model gets back', !card.description.includes('smk-labs') && !JSON.stringify(ok).includes('smk-labs') && !JSON.stringify(cardBr).includes('smk-labs'));
  // The report signs the CARD, not the page: .meta sits OUTSIDE #card, so a
  // signature there would leave every export from a report page unsigned.
  check('report .meta still holds only the date; the shell holds no copy of the literal', shell.includes('<div class="meta">{{DATE}}</div>') && !shell.includes('smk-labs'));

  // Opt-out: "signature": false in .readable/brand.json. One committable flag for
  // both paths. It reaches the card through read_kit because that call already
  // gates the first paint - tool-input arguments are the model's, and
  // structuredContent lands after the first paint (a visible flash).
  const sigOffDir = mkbrand('sigoff', { wordmark: 'Acme', signature: false });
  const sigOnDir = mkbrand('sigon', { wordmark: 'Acme' });
  const kOff = (await rpc('tools/call', { name: 'read_kit', arguments: { html: '<p>x</p>', brand: sigOffDir } })).content[0].text;
  const kOn = (await rpc('tools/call', { name: 'read_kit', arguments: { html: '<p>x</p>', brand: sigOnDir } })).content[0].text;
  check('opt-out: "signature": false flags read_kit with a leading !, a brand without the key does not', kOff === '!' && kOn === '');
  const kOffTbl = (await rpc('tools/call', { name: 'read_kit', arguments: { html: '<table><tbody><tr><td>a</td></tr></tbody></table>', brand: sigOffDir } })).content[0].text;
  check('the flag rides in FRONT of the component css, so opting out never costs a card its styling', kOffTbl.charAt(0) === '!' && kOffTbl.includes('.rc table{'));
  check('bridge reads the flag before the first paint and strips the marker before mounting', html.includes("noSig=t.charAt(0)==='!'") && html.includes('kMount(noSig?t.slice(1):t)') && html.includes("brand:bLoaded||''"));
  check('read_kit advertises the brand param that carries the flag', kitt.inputSchema.properties.brand.type === 'string');
  const kBogus = (await rpc('tools/call', { name: 'read_kit', arguments: { html: '<p>x</p>', brand: '/nonexistent/.readable' } })).content[0].text;
  check('an unresolvable brand keeps the signature (the safe default), never an error', kBogus === '');

  // Email: the signature arrives inside the card html, so the server only styles
  // it - muted, on its own hairline, with the real href kept.
  const emSig = (await rpc('tools/call', { name: 'render_email', arguments: { html: '<h2>گزارش</h2><p>متن</p>' + sigLine } })).content[0].text;
  check('email carries the signature as a real link, muted instead of accent, on its own hairline', emSig.includes('href="https://github.com/smk-labs"') && emSig.includes('>github.com/smk-labs<') && emSig.includes('color:#6f6f6a;text-decoration:none') && /border-top:\.5px solid #dcdcd6;font-size:9\.2px;color:#6f6f6a/.test(emSig) && !emSig.includes('class='));

  // Report path (build.py). Source-level, because `node test.js` must not need a
  // python toolchain; the real end-to-end build is part of the release check.
  const build = fs.readFileSync(path.join(__dirname, '..', 'skills', 'report', 'build.py'), 'utf8');
  check('the report holds no copy of the literal: it reads the same @sig marker out of rc.css', !build.includes('smk-labs') && build.includes('@sig[ \\t]+(<[^\\n\\r]+)') && build.includes('content = content + "\\n" + signature()'));
  check('report opt-out reads the same brand.json key, and stays independent of --no-brand', build.includes('.get("signature") is False') && build.includes('if not sig_off(brand_dir)') && build.includes('if brand_dir and not a.no_brand'));
  check('report never double-signs a fragment that already carries a signature', build.includes('\'class="sig"\' not in content'));

  // The model-side fallbacks are the ONLY other copy, because on those paths the
  // model IS the assembler and there is no build step to read rc.css. Byte
  // identity is asserted so the copy cannot drift.
  for (const f of ['kit-inline.md', 'kit.md']) {
    const r = fs.readFileSync(path.join(__dirname, '..', 'hooks', f), 'utf8').replace(/\r\n/g, '\n');
    check(f + ' carries the signature byte-identical to rc.css @sig, and nowhere twice', r.includes(sigLine) && !r.split(sigLine).join('').includes('github.com/smk-labs'));
    check(f + ' carries the .sig css in its verbatim BASE block', r.includes('.rc .sig{') && r.includes('.rc .sig a{color:inherit}'));
  }
  const ruleMd = fs.readFileSync(path.join(__dirname, '..', 'hooks', 'rule.md'), 'utf8');
  check('the ACTIVE card rule never mentions the signature: the model must not spend a token retyping it', !ruleMd.includes('smk-labs') && !ruleMd.includes('class="sig"'));
  // The real no-duplication guard: which files hold the markup literal at all.
  const carriers = ['server/server.js', 'assets/menu.js', 'assets/rc.css', 'skills/report/build.py', 'skills/report/assets/shell.html', 'hooks/rule.md', 'hooks/kit-inline.md', 'hooks/kit.md']
    .filter((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes(sigLine));
  check('exactly three files hold the literal: rc.css (the source) plus the two model-side fallbacks', carriers.join() === 'assets/rc.css,hooks/kit-inline.md,hooks/kit.md');

  // 7. the no-ui host: covered by 8c-bis above, which asserts the 6.0.0
  // contract (tool absent, call refused). The old test here asserted the
  // opposite contract, a successful result carrying a fallback note, and that
  // note is precisely what let a host with no renderer look like a host with
  // one. Deleted rather than adapted: two tests for one behaviour is how a
  // stale expectation survives a redesign.

  /* The stable dir is a FLAT copy of the files hooks/connect.sh names, and a
   * connected desktop install runs from it. 5.4.0 added assets/email.js as a
   * module-load require and left the copy list alone, so that dir got a server
   * that threw before its first byte of protocol and every machine installing
   * from the marketplace lost the card tool. A checkout never notices: it
   * resolves ../assets/. So build the flat dir exactly as connect.sh does and
   * boot it — any future file the server needs and connect.sh forgets fails
   * here, not on a user's machine. There is deliberately ONE copy list and one
   * profile list in the tree: 6.0.0 briefly had a second copy in refresh.sh,
   * which is how a list drifts. */
  const HOOKS = path.join(__dirname, '..', 'hooks');
  const connect = fs.readFileSync(path.join(HOOKS, 'connect.sh'), 'utf8');
  // The set is a GLOB now, not a typed list (6.7.0): the list WAS the module
  // graph, kept in a shell loop, and a module added to the server's requires and
  // forgotten here broke a desktop install on a require. Two globs cannot miss
  // one, so what is worth pinning is that they are still globs — the boot check
  // at the bottom of this file proves what they actually produce.
  check('connect.sh copies the server and its assets by glob, so no list can go stale',
    /for f in "\$ROOT"\/server\/\*\.js "\$ROOT"\/assets\/\*; do/.test(connect));
  check('connect.sh is the only file that names a desktop config (6.1.0)',
    fs.readdirSync(HOOKS).filter((f) => f.endsWith('.sh') && /claude_desktop_config/.test(fs.readFileSync(path.join(HOOKS, f), 'utf8'))).join() === 'connect.sh');
  check('setup.sh and refresh.sh are both gone, so there is one implementation',
    !fs.existsSync(path.join(HOOKS, 'setup.sh')) && !fs.existsSync(path.join(HOOKS, 'refresh.sh')));

  /* AUTO-CONNECT (6.1.0), against a fake HOME with four fake profiles.
   *
   * 6.0.0 made registration a command the user had to run, which cost readable
   * the one property it was built for: installing it is the whole setup. The
   * real 5.x defects were never "it wrote the config", they were writing to one
   * hardcoded profile, writing a backup on every write, writing in silence, and
   * a removal that the next session silently undid. Each is asserted here. */
  const FH = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-home-'));
  // Every shape seen in the field. The last one is the shape 6.1.0 missed: a
  // relay setup keeps its profile in ~/.claude-<name>/desktop, so three live
  // profiles went unregistered while status reported all five others fine.
  const profs = [
    path.join(FH, 'Library', 'Application Support', 'Claude'),
    path.join(FH, 'Library', 'Application Support', 'Claude-3p'),
    path.join(FH, 'Library', 'Application Support', 'Claude Profiles', '3p-test'),
    path.join(FH, 'claude-3p-test-3p'),
    path.join(FH, '.claude-relayed', 'desktop'),
  ];
  for (const p of profs) fs.mkdirSync(p, { recursive: true });
  // two with a config that already holds an unrelated server, one bare, one
  // with only config.json (a real profile that has never had a desktop config)
  fs.writeFileSync(path.join(profs[0], 'claude_desktop_config.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } }, preferences: { keep: true } }, null, 2));
  fs.writeFileSync(path.join(profs[1], 'claude_desktop_config.json'), JSON.stringify({ mcpServers: {} }, null, 2));
  fs.writeFileSync(path.join(profs[2], 'claude_desktop_config.json'), JSON.stringify({}, null, 2));
  fs.writeFileSync(path.join(profs[3], 'config.json'), '{}');
  fs.writeFileSync(path.join(profs[4], 'claude_desktop_config.json'), JSON.stringify({ mcpServers: {} }, null, 2));
  const runHook = (action) => require('child_process').execFileSync('sh', [path.join(HOOKS, 'connect.sh'), action], { env: Object.assign({}, process.env, { HOME: FH }), encoding: 'utf8' });
  const cfgOf = (p) => { const f = path.join(p, 'claude_desktop_config.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
  const srvPath = path.join(FH, '.claude', 'plugins', 'data', 'readable', 'server', 'server.js');

  const first = runHook('auto');
  check('auto finds a relay profile at ~/.claude-<name>/desktop (6.1.2)',
    (cfgOf(profs[4]) || {}).mcpServers && cfgOf(profs[4]).mcpServers['readable-card'].args[0] === srvPath);
  check('auto registers in EVERY profile on the first session, not just the default (6.1.0)',
    profs.every((p) => (cfgOf(p) || {}).mcpServers && cfgOf(p).mcpServers['readable-card'].args[0] === srvPath));
  check('auto writes a desktop config for a profile that had none', cfgOf(profs[3]) !== null);
  check('auto leaves every other server and preference alone', cfgOf(profs[0]).mcpServers.other.command === 'x' && cfgOf(profs[0]).preferences.keep === true);
  check('auto says it wrote, once, with the undo (a silent write leaves the user with no cards and no clue)',
    /<readable-setup>/.test(first) && /reopen the Claude app/.test(first) && /disconnect/.test(first));
  check('auto builds the flat stable dir at a version-free path', fs.existsSync(srvPath) && ['rc.css', 'menu.js', 'email.js'].every((f) => fs.existsSync(path.join(path.dirname(srvPath), f))));

  const stamps = profs.map((p) => fs.statSync(path.join(p, 'claude_desktop_config.json')).mtimeMs);
  const second = runHook('auto');
  check('the second session writes NOTHING and says nothing (steady state is free)',
    second.trim() === '' && profs.every((p, i) => fs.statSync(path.join(p, 'claude_desktop_config.json')).mtimeMs === stamps[i]));
  check('exactly one backup per config, ever (5.x left one per write)',
    profs.every((p) => fs.readdirSync(p).filter((f) => f.endsWith('.readable-bak')).length <= 1));

  runHook('disconnect');
  check('disconnect removes the entry from every profile and deletes the copy',
    profs.every((p) => !(cfgOf(p).mcpServers || {})['readable-card']) && !fs.existsSync(path.dirname(srvPath)));
  const afterMark = runHook('auto');
  check('a disconnect STICKS: the next session does not put it back (the 5.x defect that made removal pointless)',
    afterMark.trim() === '' && profs.every((p) => !(cfgOf(p).mcpServers || {})['readable-card']));
  runHook('connect');
  check('an explicit connect clears the opt-out and registers again',
    profs.every((p) => cfgOf(p).mcpServers['readable-card'].args[0] === srvPath));

  // a hand-made override pointing at a real file is never rewritten
  const ovr = path.join(FH, 'my-server.js');
  fs.writeFileSync(ovr, '//');
  const c0 = cfgOf(profs[0]); c0.mcpServers['readable-card'] = { command: 'node', args: [ovr] };
  fs.writeFileSync(path.join(profs[0], 'claude_desktop_config.json'), JSON.stringify(c0, null, 2));
  runHook('auto');
  check('a dev override that resolves is left alone', cfgOf(profs[0]).mcpServers['readable-card'].args[0] === ovr);
  check('status reports per profile without writing anything', /not registered|ok |!! /.test(runHook('status')));

  // A profile can opt out on its own with .readable-skip, which is how a managed
  // 3p deployment keeps its one sanctioned registration (managedMcpServers in its
  // own config) instead of carrying a second, redundant one here.
  const skipProf = profs[1];
  const skipCfgBefore = JSON.stringify(cfgOf(skipProf));
  fs.writeFileSync(path.join(skipProf, '.readable-skip'), 'managed by the deployment config\n');
  const c1 = cfgOf(skipProf); delete c1.mcpServers['readable-card'];
  fs.writeFileSync(path.join(skipProf, 'claude_desktop_config.json'), JSON.stringify(c1, null, 2));
  runHook('auto');
  check('.readable-skip keeps the session hook out of that profile for good (6.2.0)',
    !(cfgOf(skipProf).mcpServers || {})['readable-card']);
  check('.readable-skip does not affect any other profile',
    profs.filter((p) => p !== skipProf).every((p) => cfgOf(p).mcpServers['readable-card']));
  check('status names the skipped profile and its reason', /skip .*managed by the deployment config/.test(runHook('status')));
  fs.unlinkSync(path.join(skipProf, '.readable-skip'));
  void skipCfgBefore;
  // Boot the dir connect.sh REALLY built, in the fake home above, rather than a
  // second reconstruction of it here. Reconstructing is what let the copy set and
  // the test drift; running the hook means the thing under test is the thing that
  // ships.
  runHook('connect');
  const flat = path.dirname(srvPath);
  check('every module and asset the server needs is in the flat stable dir',
    fs.existsSync(path.join(flat, 'server.js')) && fs.existsSync(path.join(flat, 'rc.css')) &&
    fs.readdirSync(path.join(__dirname)).filter((f) => f.endsWith('.js') && f !== 'test.js')
      .every((f) => fs.existsSync(path.join(flat, f))) &&
    fs.readdirSync(path.join(__dirname, '..', 'assets')).every((f) => fs.existsSync(path.join(flat, f))) &&
    !fs.existsSync(path.join(flat, 'test.js')));
  const srvFlat = spawn(process.execPath, [path.join(flat, 'server.js')], { stdio: ['pipe', 'pipe', 'ignore'], cwd: NEUTRAL_CWD });
  const boot = new Promise((res) => {
    let buf = '';
    srvFlat.stdout.on('data', (d) => { buf += d; if (buf.includes('\n')) res(buf); });
    srvFlat.on('exit', () => res(buf));
  });
  srvFlat.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }) + '\n');
  check('the flat stable dir setup.sh builds boots and answers initialize', (await boot).includes('"serverInfo"'));
  srvFlat.kill();

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
