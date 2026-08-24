#!/usr/bin/env node
/**
 * readable-card — zero-dependency MCP Apps server (SEP-1865).
 *
 * One tool: `card`. The model sends ONLY content HTML (readable building
 * blocks, no <style>); the host renders it inside a predeclared ui://
 * template that carries the full kit CSS. Output tokens per reply drop to
 * the content itself.
 *
 * Kit CSS is read from ../assets/rc.css (single source of truth, shared
 * with the hook rule). No SDK, no npm packages: stdio NDJSON JSON-RPC.
 *
 * EXPERIMENTAL: needs a host that negotiates the io.modelcontextprotocol/ui
 * extension (MCP Apps). On hosts without it the tool still answers with a
 * text fallback instructing the model to use the readable rule skeleton.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const PROTOCOL_FALLBACK = '2025-06-18';
const SERVER_INFO = { name: 'readable-card', version: '0.1.0' };
const UI_EXT = 'io.modelcontextprotocol/ui';
const UI_MIME = 'text/html;profile=mcp-app';
const CARD_URI = 'ui://readable/card.html';

const KIT_CANDIDATES = [
  path.join(__dirname, '..', 'assets', 'rc.css'), // plugin layout
  path.join(__dirname, 'rc.css'), // bundled layout (.mcpb extension)
];
/* \r-strip: a CRLF checkout (autocrlf=true on Windows) would otherwise leak
 * one stray byte per line into the template and eat the 30KB budget. */
const KIT_CSS = fs.readFileSync(KIT_CANDIDATES.find((p) => fs.existsSync(p)), 'utf8').replace(/\r\n/g, '\n');

/* SIGNATURE (5.2.0): the one literal lives on rc.css's @sig line - see the comment
 * there for why it is BASE and why it mounts as the last child of .rc. Read at
 * ASSEMBLY time and frozen into the template as a JS constant, so it never enters
 * the model's context and costs nothing per session. Single-quote ban: it ships
 * inside a single-quoted JS string literal in the template. */
const SIG_HTML = (() => {
  /* Anchored on the '<': prose ABOUT the marker mentions @sig too, and an
   * unanchored match happily froze a sentence fragment into the template. */
  const m = KIT_CSS.match(/@sig[ \t]+(<[^\n]+)/);
  if (!m) throw new Error('rc.css is missing its @sig signature line');
  const s = m[1].trim();
  if (s.indexOf("'") !== -1) throw new Error('@sig must not contain a single quote');
  if (s.slice(0, 16) !== '<div class="sig"') throw new Error('@sig must be a single <div class="sig"> line');
  return s;
})();

/* Host CSS variables do not exist inside the sandboxed MCP Apps iframe,
 * so the template ships its own palette and switches on hostContext.theme.
 * The page paints itself with --surface-1 edge to edge: a transparent page
 * is NOT safe — the host composites the iframe onto an opaque light canvas
 * (color-scheme mismatch), which rendered dark-theme text on a white backing.
 * color-scheme follows the theme so native UI and the canvas agree too. */
/* Chart hues (--ca..--cd) live on .rc in the kit itself — the menu never
 * reads them outside the card, so the template palette carries none. */
const PALETTE = [
  ':root{color-scheme:light;--text-primary:#1f1f1f;--text-secondary:#6f6f6a;--text-accent:#2f66c4;--surface-1:#fff;--surface-2:#f2f2ef;--border:#dcdcd6;--border-strong:#b8b8b0;--bg-success:#e6f4ec;--bg-accent:#e8effc;--bg-warning:#faf0d9;--bg-danger:#fbe9e7;--font-mono:ui-monospace,Menlo,monospace}',
  'html[data-theme="dark"]{color-scheme:dark;--text-primary:#ececea;--text-secondary:#9f9f98;--text-accent:#82abec;--surface-1:#262624;--surface-2:#302f2c;--border:#3e3e3a;--border-strong:#55554f;--bg-success:#143122;--bg-accent:#16283f;--bg-warning:#382c13;--bg-danger:#3a1d19}',
  'html,body{margin:0;background:var(--surface-1);overflow:hidden}',
].join('\n');

/* The host already draws a rounded, framed cell around the app iframe, so the
 * card renders flush inside it: no own border/radius/margin (which read as a
 * cheap nested box). Template-only override — rc.css keeps the frame for the
 * hook-rule path, where the card floats bare in the chat column. */
const FLUSH_CSS = '.rc{margin:0;border:none;border-radius:0;background:transparent}';

/* English/LTR cards: the kit is Persian-first (text-align:right, RTL arrows),
 * so the bridge stamps dir on #card from the content's majority script and
 * this template-only block mirrors the sided rules, matching what the report
 * shell's --lang en extra does. Same trigger set as skills/report/build.py. */
const LTR_CSS = [
  '.rc[dir=ltr]{text-align:left;font-family:Inter,system-ui,-apple-system,sans-serif}',
  '.rc[dir=ltr] thead th,.rc[dir=ltr] tbody td{text-align:left}',
  ".rc[dir=ltr] .cta::after{content:'\\2192'}",
  '.rc[dir=ltr] .flow .s:not(:last-child)::before{transform:translateY(-50%) rotate(225deg)}',
].join('\n');

/* LAZY KIT (4.20.0). The template used to inline the whole pre-@REPORT sheet
 * because a predeclared ui:// resource is served static, before any card content
 * exists, so it could not be tailored per card. The sheet is no longer WHERE the
 * tailoring happens: the template now carries BASE only, and the app asks the
 * server for the component snippets a given card's HTML actually needs
 * (read_kit, same app-only channel as read_brand). That is genuine pay-per-use,
 * it keeps the card offline-safe (the CSS comes from this server, not a CDN),
 * and it takes the 30KB ceiling off the critical path for good.
 *
 * htmlFile mode is why the CSS cannot simply ride along in the tool result: the
 * server never sees that HTML (the app reads the file itself via read_card_file),
 * so only the app can ask, and it asks once it holds the HTML either way.
 *
 * BASE is everything above the first @TAG. @REPORT is a tier divider with no CSS
 * of its own, and @PRINT never ships to an iframe. */
const KIT_BASE = KIT_CSS.split('/*@')[0];
const KIT_TAG_RE = /\/\*@([A-Z]+)/;

/* One entry per @TAG, in SHEET ORDER (order is preserved on delivery so every
 * specificity-tie invariant in the sheet still holds, e.g. @CARD's chip restore
 * following its own child inversion). */
const KIT_SNIPPETS = (() => {
  const out = [];
  for (const part of KIT_CSS.split(/(?=\/\*@)/)) {
    const m = part.match(KIT_TAG_RE);
    if (!m) continue;
    out.push({ tag: m[1], css: part });
  }
  return out;
})();

/* Detectors: a component ships when the card's HTML uses one of its class tokens
 * or element names. Tokens are matched exactly (parsed out of class attributes),
 * not by substring, so `class="cards c2"` cannot be missed and `.src` cannot be
 * triggered by an unrelated word. Over-inclusion costs bytes; a MISS renders a
 * component unstyled, so anything ambiguous is listed deliberately. */
const KIT_DETECT = {
  TABLE: { cls: ['scroll-table', 'wide'], tags: ['table', 'thead', 'tbody', 'th', 'td'] },
  ZEBRA: { cls: ['zebra', 'dense'], tags: [] },
  KV: { cls: ['kv'], tags: [] },
  KPI: { cls: ['grid', 'kpi', 'trend'], tags: [] },
  BARS: { cls: ['bars', 'bar', 'duo'], tags: [] },
  SPARK: { cls: ['spark'], tags: ['polyline', 'polygon'] },
  FLOW: { cls: ['flow'], tags: [] },
  TL: { cls: ['tl'], tags: [] },
  HUB: { cls: ['hub', 'tree'], tags: [] },
  BADGE: { cls: ['badge'], tags: [] },
  CTA: { cls: ['cta', 'btns'], tags: ['button'] },
  CARD: { cls: ['cards', 'card', 'pick'], tags: [] },
  BOX: { cls: ['box', 'lbl'], tags: [] },
  COLS: { cls: ['cols'], tags: [] },
  QUOTE: { cls: [], tags: ['blockquote', 'cite'] },
  SRC: { cls: ['src'], tags: [] },
  NUMBERED: { cls: ['numbered'], tags: [] },
  SECTIONS: { cls: ['sections'], tags: [] },
  TABS: { cls: ['tabs'], tags: [] },
  DONUT: { cls: ['donut', 'donut-w', 'leg'], tags: [] },
  FOLD: { cls: ['fold'], tags: ['details', 'summary'] },
  ICON: { cls: ['ic'], tags: [] },
  FIG: { cls: [], tags: ['figure', 'figcaption', 'img'] },
  /* `live` is listed next to `preview` deliberately: it never appears without it
   * today, but a miss on either renders the frame at full desktop width, with no
   * lid over it and no radius joining it to the card above. */
  PREVIEW: { cls: ['preview', 'live'], tags: [] },
};
/* A snippet may lean on BASE and on what it declares here, never on a sibling
 * happening to be present: @BOX takes its panel + child inversion from @CARD,
 * and @ZEBRA restyles rows @TABLE has to have drawn first. */
const KIT_NEEDS = { BOX: ['CARD'], ZEBRA: ['TABLE'] };

function kitTokens(html) {
  const cls = new Set();
  const tags = new Set();
  const s = String(html);
  let m;
  const cre = /class\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  while ((m = cre.exec(s))) {
    for (const t of String(m[1] !== undefined ? m[1] : m[2]).split(/\s+/)) if (t) cls.add(t);
  }
  const tre = /<\s*([a-zA-Z][a-zA-Z0-9-]*)/g;
  while ((m = tre.exec(s))) tags.add(m[1].toLowerCase());
  return { cls, tags };
}

/* Sources stay heavily commented - they ARE the documentation - but comments and
 * newlines have no business on the wire. Var names stay long here (unlike the
 * template, which aliases them): the aliases are defined on .rc inside the
 * template's own copy of BASE, and a delivered snippet should not depend on that
 * assembly detail to resolve its colours. */
function kitMin(css) {
  return css.replace(/\/\*[^]*?\*\//g, '').replace(/\n+/g, '').trim();
}

/* The CSS for one card: BASE is already in the template, so only snippets ship. */
function kitFor(html) {
  const { cls, tags } = kitTokens(html);
  const want = new Set();
  const add = (tag) => {
    if (want.has(tag)) return;
    want.add(tag);
    for (const dep of KIT_NEEDS[tag] || []) add(dep);
  };
  for (const { tag } of KIT_SNIPPETS) {
    const d = KIT_DETECT[tag];
    if (!d) continue;
    if (d.cls.some((c) => cls.has(c)) || d.tags.some((t) => tags.has(t))) add(tag);
  }
  return kitMin(KIT_SNIPPETS.filter((s) => want.has(s.tag)).map((s) => s.css).join(''));
}
/* @import is only valid before all other rules; the kit's Vazirmatn import
 * would die mid-sheet after PALETTE, so imports are hoisted to the top of the
 * template <style> (and Inter added for LTR cards). */
const KIT_BODY = KIT_BASE.replace(/\/\*[^]*?\*\//g, '');
/* Line-anchored: the Google Fonts URL itself contains semicolons (wght@400;500;...),
 * so matching up to the first ';' truncates mid-url and the leftover garbage
 * eats the kit's first rule via CSS error recovery. Imports sit one per line. */
const KIT_IMPORTS = (KIT_BODY.match(/@import[^\n]+/g) || []).join('\n') +
  "\n@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap');";
/* rc.css keeps one rule per line for diffability; newlines are pure padding
 * to the CSS tokenizer, so assembly strips them (~70 chars of 30KB budget). */
const KIT_NL = KIT_BODY.replace(/@import[^\n]+/g, '').replace(/\n+/g, '');
/* Assembly-time compression, template copy only (sources and the report/hosted
 * paths keep the long names): the kit's hottest var() tokens are aliased once
 * on .rc and every use shrinks to var(--xx). Frees ~0.3KB of the 30KB host
 * ceiling, which pays for the per-code-block copy button (4.11.0). Longest
 * pattern first so `.5px solid var(--border)` collapses before the name pass;
 * alias definitions are injected AFTER the passes so they keep the long names. */
const KIT_ALIASES = [
  [':.5px solid var(--border)', ':var(--bd)', '--bd:.5px solid var(--border);'],
  ['var(--text-secondary)', 'var(--ts)', '--ts:var(--text-secondary);'],
  ['var(--text-accent)', 'var(--ta)', '--ta:var(--text-accent);'],
  ['var(--border-strong)', 'var(--bs)', '--bs:var(--border-strong);'],
  ['var(--surface-2)', 'var(--s2)', '--s2:var(--surface-2);'],
];
const KIT_RULES = KIT_ALIASES.reduce((css, [long, short]) => css.split(long).join(short), KIT_NL)
  .replace('.rc{', '.rc{' + KIT_ALIASES.map((a) => a[2]).join(''));

/* JSON-RPC-over-postMessage bridge, per SEP-1865: ui/initialize handshake,
 * then render on ui/notifications/tool-input (arguments.html). sendPrompt()
 * maps CTA buttons onto ui/message so kit buttons keep working. */
const BRIDGE_JS = [
  "(function(){",
  "var nextId=1,pending={},LOG=[];window.__rcLog=LOG;",
  "/* Signature: an assembly-time constant lifted from rc.css's @sig line, mounted as the last child of #card so every #card exporter (png / html / markdown / text / email) carries it with no per-format code. noSig is the project opt-out, delivered on the read_kit reply below. */",
  "var SIG='" + SIG_HTML + "',noSig=false;",
  "function tap(d,m){try{LOG.push(Date.now()%1000000+d+(m.method||('#'+m.id))+(m&&m.error?'!'+String(m.error.code||''):''));if(LOG.length>80)LOG.shift()}catch(e){}}",
  "function send(m){tap('>',m);window.parent.postMessage(m,'*')}",
  "function rpc(method,params,cb){var id=nextId++;if(cb)pending[id]=cb;send({jsonrpc:'2.0',id:id,method:method,params:params||{}})}",
  "function notify(method,params){send({jsonrpc:'2.0',method:method,params:params||{}})}",
  "/* ui/message param shape differs across host snapshots: try the content-array form, then the single-object form; if both are rejected, copy the prompt text so the user can paste it, and keep the errors for the alt-click diagnostics dump. */",
  "window.sendPrompt=function(t){var text=String(t);var shapes=[{role:'user',content:[{type:'text',text:text}]},{role:'user',content:{type:'text',text:text}}];var errs=[];",
  "(function tryNext(i){if(i>=shapes.length){window.__rcErrs=(window.__rcErrs||[]).concat(errs);",
  "if(window.__rcCopy){window.__rcCopy(text,function(ok){if(window.__rcToast)window.__rcToast(ok?'refused ('+errs[errs.length-1]+') - copied, paste it':'rejected: '+errs[errs.length-1])})}else if(window.__rcToast)window.__rcToast('rejected: '+errs[errs.length-1]);return}",
  "rpc('ui/message',shapes[i],function(res,err){if(err){errs.push(String(err.code||'')+' '+String(err.message||'').slice(0,80));tryNext(i+1)}})})(0)};",
  "/* Host CSP in MCP Apps iframes blocks inline onclick attributes (unlike the old widget host), so CTA clicks are re-dispatched by delegation; blocked attributes leave .onclick null, which doubles as the no-double-fire guard. */",
  "document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('#card [onclick]');if(!b||b.onclick)return;var m=String(b.getAttribute('onclick')).match(/^\\s*sendPrompt\\((['\"])([\\s\\S]*?)\\1\\)\\s*;?\\s*$/);if(m)window.sendPrompt(m[2])});",
  "var finalGot=false,partialTimer=null;",
  "/* +2 covers fractional line-height rounding; overflow:hidden kills any residual scrollbar. Fonts (Vazirmatn) land late and change the height, so re-fit once they settle. */",
  "/* The menu is position:fixed, so an OPEN menu adds nothing to scrollHeight and would clip on short cards (overflow:hidden kills scrolling too). While open, the iframe grows to the menu's bottom edge; menu.js pings __rcFit on every open/close. */",
  "/* Measure the .items panel itself: #rcmenu's own rect is just the dots button, absolute children never grow it. */",
  "function fit(){var h=document.documentElement.scrollHeight;var m=document.getElementById('rcmenu');var it=m&&m.querySelector('.items');if(it&&m.className.indexOf('open')>-1){var b=it.getBoundingClientRect().bottom+10;if(b>h)h=b}notify('ui/notifications/size-changed',{height:Math.ceil(h)+2})}",
  "window.__rcFit=fit;",
  "/* Card direction follows the content's majority script (the kit is Persian-first, ties go RTL); .rc[dir=ltr] overrides in the template CSS mirror the sided rules. code/pre spans are stripped BEFORE counting: paths and commands are direction-neutral, and one long /Users/... path outvoting the Persian prose flipped whole cards to LTR (field bug, 4.6.1). */",
  "function dirOf(h){var t=String(h).replace(/<(code|pre)[^>]*>[^]*?<\\/\\1>/gi,' ').replace(/<[^>]*>/g,' ');var r=(t.match(/[\\u0591-\\u07FF\\uFB1D-\\uFDFD\\uFE70-\\uFEFC]/g)||[]).length;var l=(t.match(/[A-Za-z]/g)||[]).length;return r>=l?'rtl':'ltr'}",
  "/* Lazy kit (4.20.0): the template carries BASE only, so the component CSS for THIS card is fetched by posting its html to the app-only read_kit tool (same channel as read_brand) and mounted BEFORE the first paint — mounting after would flash unstyled tables and kpis. The <style> node is created at load, not on first use, so the brand style always lands after it and keeps winning. Two failure modes are covered: an error or empty reply paints on BASE alone (readable, and RTL still correct), and a host that never answers is capped by the deadline below, after which a late reply still mounts and restyles in place. */",
  "var kitCss='',kitEl=(function(){var s=document.createElement('style');s.id='rckit';document.head.appendChild(s);return s})();",
  "function kMount(t){if(t===kitCss)return;kitCss=t;kitEl.textContent=t}",
  "function kApply(html,cb){var done=false;function go(){if(done)return;done=true;cb()}setTimeout(go,1500);",
  "/* The same reply carries the project's signature opt-out (.readable/brand.json \"signature\":false) as a leading '!'. It rides THIS call because the first paint already blocks on it, so the flag is known before draw: no flash, no race. The tool-input arguments cannot carry it (they are the model's, and the model must never spend tokens on this), and structuredContent on tool-result lands AFTER the first paint. A host that never answers keeps the default, which is the safe direction. */",
  "rpc('tools/call',{name:'read_kit',arguments:{html:html,brand:bLoaded||''}},function(res,err){var c=!err&&res&&!res.isError&&res.content,t=c&&c[0]&&c[0].text;if(typeof t==='string'){noSig=t.charAt(0)==='!';kMount(noSig?t.slice(1):t)}go()})}",
  "function draw(html){var c=document.getElementById('card');c.setAttribute('dir',dirOf(html));c.innerHTML=html+(noSig?'':SIG);fit();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit)}",
  "function paint(html){if(!html)return;kApply(html,function(){draw(html)})}",
  "function render(html,isFinal){if(isFinal){finalGot=true;if(partialTimer){clearTimeout(partialTimer);partialTimer=null}paint(html);return}",
  "if(finalGot)return;if(partialTimer)clearTimeout(partialTimer);partialTimer=setTimeout(function(){if(!finalGot)paint(html)},700)}",
  "/* htmlFile mode: the call carries only a path, so the bridge pulls the content itself through the app-only read_card_file tool (host tools/call, same channel as render_email) — the HTML never crosses the model's context. tool-input and tool-result both announce the path; a double fetch is idempotent (render(t,true) repaints the same content), so no dedupe guard is spent on it. */",
  "function fCard(p){if(!p)return;rpc('tools/call',{name:'read_card_file',arguments:{path:p}},function(res,err){var c=!err&&res&&!res.isError&&res.content,t=c&&c[0]&&c[0].text;if(t)render(t,true);else if(window.__rcToast)window.__rcToast('card file read failed')})}",
  "/* The 4.3.5 stall auto-dump (save_card at 5s without input) is gone: the lifecycle bug it chased was fixed in 4.3.8, and its bytes now pay for the Email row. __rcLog + alt-click diagnostics remain. */",
  "function applyTheme(ctx){if(ctx&&ctx.theme)document.documentElement.setAttribute('data-theme',ctx.theme==='dark'?'dark':'light')}",
  "window.__rcRpc=rpc;",
  "/* Project brand (4.13.0): when a call carries a brand dir, fetch its normalized css through the app-only read_brand tool (same channel as htmlFile) and mount it as a late <style> — variable overrides win by source order. One-shot per iframe (bLoaded guard), so no element reuse; palette swaps don't change height and a brand font swap re-fits via the body ResizeObserver. A failed read silently keeps the default look. */",
  "var bLoaded=null;",
  "function bApply(p){if(!p||p===bLoaded)return;bLoaded=p;rpc('tools/call',{name:'read_brand',arguments:{dir:p}},function(res,err){var c=!err&&res&&!res.isError&&res.content,t=c&&c[0]&&c[0].text;if(!t)return;var s=document.createElement('style');s.id='rcbrand';s.textContent=t;document.head.appendChild(s);fit()})}",
  "/* Host adapter for the shared menu (assets/menu.js): email HTML renders server-side through the render_email tool, which runs the SAME assets/email.js the standalone report inlines. It renders there rather than here because the ui:// template must stay under the host's ~30KB resource ceiling. The brand dir rides along so a branded card exports in its own colours instead of the kit blue — the transform resolves every literal from that brand's css. */",
  "window.__rcEmail=function(cb){rpc('tools/call',{name:'render_email',arguments:{html:document.getElementById('card').innerHTML,theme:'light',brand:bLoaded||''}},function(res,err){var t=!err&&res&&!res.isError&&res.content&&res.content[0]&&res.content[0].text;if(t)cb(t,null);else cb(null,err?String(err.code||'')+' '+String(err.message||'').slice(0,60):'render failed')})};",
  "window.addEventListener('message',function(e){var m=e.data;if(typeof m==='string'){try{m=JSON.parse(m)}catch(err){return}}if(!m||m.jsonrpc!=='2.0')return;tap('<',m);",
  "/* A response is a message carrying result or error for a pending id. Do NOT discriminate on the absence of 'method': at least one real host echoes the method field in its responses, and treating those as requests silently kills the ui/initialize handshake, which keeps the iframe visibility:hidden forever (anthropics/claude-ai-mcp#61). */",
  "if(m.id!=null&&pending[m.id]&&(('result' in m)||('error' in m))){var cb=pending[m.id];delete pending[m.id];cb(m.result,m.error);return}",
  "if(m.method==='ui/notifications/tool-input'&&m.params&&m.params.arguments){var a=m.params.arguments;if(a.brand)bApply(a.brand);if(a.html)render(a.html,true);else fCard(a.htmlFile)}",
  "else if(m.method==='ui/notifications/tool-input-partial'&&m.params&&m.params.arguments){render(m.params.arguments.html,false)}",
  "else if(m.method==='ui/notifications/tool-result'&&m.params&&m.params.structuredContent){var s=m.params.structuredContent;if(s.brand)bApply(s.brand);if(s.html)render(s.html,true);else fCard(s.htmlFile)}",
  "else if(m.method&&m.method.indexOf('host-context-changed')!==-1&&m.params){applyTheme(m.params.hostContext||m.params)}",
  "else if(m.id!=null&&m.method){send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'not supported'}})}",
  "});",
  "var PVS=['2026-01-26','2025-11-25','2025-06-18'];",
  "(function initTry(i){rpc('ui/initialize',{protocolVersion:PVS[i],appCapabilities:{availableDisplayModes:['inline']}},function(res,err){",
  "if(err&&i+1<PVS.length){initTry(i+1);return}",
  "if(res){window.__rcHost=res;applyTheme(res.hostContext)}",
  "notify('ui/notifications/initialized',{});});})(0);",
  "new ResizeObserver(fit).observe(document.body);",
  "})();",
].filter(function (l) { return l.slice(0, 2) !== '/*'; }).join('');

/* Card menu (5x2 copy/download matrix): single-sourced from assets/menu.js,
 * shared verbatim with the standalone report shell (skills/report/build.py).
 * Self-installing IIFE; comment lines are dropped and the rest joined with
 * no separator to stay under the host's ~30KB resource ceiling. Menu.js's
 * style contract (one statement per line, block comments on their own
 * lines) makes that join safe. */
const MENU_CANDIDATES = [
  path.join(__dirname, '..', 'assets', 'menu.js'), // plugin layout
  path.join(__dirname, 'menu.js'), // bundled layout (.mcpb extension)
];
const MENU_SRC = fs.readFileSync(MENU_CANDIDATES.find((p) => fs.existsSync(p)), 'utf8')
  .replace(/\r\n/g, '\n').split('\n').filter((l) => l.slice(0, 2) !== '/*').join('');

/* Assembly-time JS squeeze, template copy only (sources keep the long names,
 * same move as the kit var aliases): the script opens with a few tiny globals
 * and every dotted host-object use shrinks. `document.`/`window.` collapse to
 * D./W.; on top of that the four hottest DOM methods get one-letter helpers —
 * createElement (always on document) and getElementById (always on document)
 * fold by plain substring, querySelectorAll/querySelector (called on many
 * elements) fold by a receiver regex (All first, so the shorter name cannot
 * eat the longer one). Last pass: every ANONYMOUS function literal becomes an
 * arrow. That is only safe because neither source uses `this` or the
 * `arguments` object (the `arguments` in here are MCP tool-call payload keys),
 * and it is worth ~0.4KB across the ~65 callbacks; named declarations keep the
 * keyword, since the regex needs `(` straight after it. Frees ~1.2KB of the
 * 30KB host ceiling, which pays for the pointer-tracked export controls
 * (4.16.0). test.js parse-checks AND behavior-checks the squeezed script. */
function squeezeJs(js) {
  const s = js.split('document.').join('D.').split('window.').join('W.')
    .split('D.createElement(').join('CE(')
    .split('D.getElementById(').join('G(')
    .replace(/([\w$]+)\.querySelectorAll\(/g, 'Q($1,')
    .replace(/([\w$]+)\.querySelector\(/g, 'S($1,')
    .replace(/\bfunction\s*\(([^)]*)\)\s*\{/g, '($1)=>{')
    .replace(/\(([\w$]+)\)=>\{/g, '$1=>{');
  return 'var D=document,W=window,CE=t=>D.createElement(t),G=i=>D.getElementById(i),Q=(e,s)=>e.querySelectorAll(s),S=(e,s)=>e.querySelector(s);' + s;
}

const TEMPLATE_HTML =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>\n' +
  KIT_IMPORTS + '\n' + PALETTE + '\n' + KIT_RULES + '\n' + FLUSH_CSS + '\n' + LTR_CSS +
  '\n</style></head><body><div class="rc" id="card" dir="rtl"><p>…</p></div>' +
  '<script>' + squeezeJs(BRIDGE_JS + MENU_SRC) + '</script></body></html>';

const TOOL = {
  name: 'card',
  description:
    'ALWAYS use this tool to deliver ANY reply written in Persian or another RTL language (plain RTL chat text scrambles; this renders it as a correct styled card), and PREFER it for English conversational, explanatory, or structured answers too. Skip it only for replies dominated by code blocks, diffs, or logs. Call it exactly once per reply, with the ENTIRE reply as the html argument; the call IS the reply, so output no reply text before or after it. Build the html from these blocks only: <h2> once as title, <p class="lead"> intro, <h3> sections, <p>, <ul>/<ol>, <li class="ok|no">, callouts <div class="cal tip|note|warn|danger"><div>…</div></div>, <table><thead><tbody> (long tables, 100+ rows: wrap as <div class="scroll-table"><table>…</table></div> for a scrollbox with pinned header; add class "wide" to the wrapper when columns are many/wide: cells stay on one line and the box scrolls sideways), <span class="badge ok|warn|info">, key-values <div class="kv"><div><b>k</b><span>v</span></div>…</div>, KPI cards <div class="grid c3|c2"><div class="kpi"><div class="l">label</div><div class="n">1.2M<span class="trend up">18%</span></div></div></div>, bars <div class="bars"><div class="bar"><span class="l">l</span><span class="t"><i style="width:72%"></i></span><span class="v">72%</span></div></div>, trend sparkline <div class="spark"><svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="0,26 25,19 50,22 75,10 100,4"/></svg><div class="x"><span>old</span><span>new</span></div></div> (time series: x evenly spaced 0..100 oldest→newest, y inverted 2≈max 28≈min, computed from the data; optional area: prepend <polygon points="0,30 …same points… 100,30"/>; optional second series: append <polyline class="s2" points="…"/>), flow <div class="flow"><span class="s">step</span>…</div>, timeline <div class="tl"><div><b>t</b>text</div>…</div>, cards <div class="cards"><div class="card"><h4>title<span class="badge ok">chip</span></h4><p>…</p></div>…</div> for repeatable units that each hold a small story (add c2 for exactly two per row, and <div class="card pick"> for a recommended option), one full-width standout block <div class="box"> with an optional <div class="lbl">eyebrow</div>, side-by-side blocks <div class="cols"><div>…</div><div>…</div></div> for pros vs cons, quotations <blockquote><p>text</p><cite>source</cite></blockquote>, a caption under a table or chart <div class="src">source: …</div>, icons <i class="ic NAME"></i> that inherit the surrounding text colour and size (in a heading the icon replaces the section dot), NAME one of check x alert info clock user file folder code terminal git db zap shield search link, only where it carries meaning, <code> around every inline path/URL/code token, <pre><code>…</code></pre> for multiline code (renders LTR), optional CTA buttons <div class="btns"><button class="cta" onclick="sendPrompt(\'…\')">label</button></div>. NO <style>, NO <script>, NO wrapper div: the template styles everything, light and dark. Short answers are fine as plain <p> paragraphs inside the card. Table or cards: a TABLE wins when many attributes are compared across few options and column alignment matters; CARDS win when each option has a narrative that must read as a unit; a strong comparison often uses both. Open with the substance: NO cover-page preamble (no owner/subject/prepared-by/audience/date/status kv block at the top) — the first line is the answer itself, the <h2> already titles it. ' +
    'FILE MODE: when a background worker/delegate has ALREADY written its report as card-block HTML to a file ' +
    'ending in -card.html, pass htmlFile (the absolute path) INSTEAD of html — the card renders straight from ' +
    'the file and its HTML never passes through your context. Do not read the file or copy its content into ' +
    'html. Pass exactly one of html | htmlFile. ' +
    'BRAND: if the session rule announces a project brand dir, ALSO pass brand (that absolute path) on every call — the card then renders in the project\'s own palette.',
  inputSchema: {
    type: 'object',
    properties: {
      html: {
        type: 'string',
        description: 'The full reply content as building-block HTML (no <style>, no wrapper). Exactly one of html | htmlFile.',
      },
      htmlFile: {
        type: 'string',
        description: 'Absolute path to a pre-written *-card.html report file (e.g. a background worker\'s output). The card renders from the file; never copy its content into html. Exactly one of html | htmlFile.',
      },
      brand: {
        type: 'string',
        description: 'Absolute path to the project\'s .readable brand dir. Pass it on every call when the session rule announces one; omit otherwise.',
      },
    },
  },
  _meta: { ui: { resourceUri: CARD_URI, visibility: ['model', 'app'] } },
};

/* App-only tool: the card menu calls this through the host (tools/call) to
 * save an export to disk with a real, verifiable path. Not for the model.
 * pick (4.12.0): on macOS the server opens the native save panel (osascript
 * "choose file name") defaulting to the project root, ACKs the RPC first
 * ("picking: dir") so the card UI never waits on the dialog, then writes
 * wherever the user chose. READABLE_SAVE_DIR skips the panel entirely. */
const SAVE_TOOL = {
  name: 'save_card',
  description:
    'Internal: saves a card export (PNG/HTML/Markdown/text) to disk for the card UI menu. Called by the embedded card interface, never by the assistant.',
  inputSchema: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'base file name, e.g. readable-card.png' },
      content: { type: 'string', description: 'file content (utf8 text or base64)' },
      encoding: { type: 'string', enum: ['utf8', 'base64'] },
      pick: { type: 'boolean', description: 'macOS: let the user choose the location in the native save panel (default location = first workspace root)' },
    },
    required: ['filename', 'content'],
  },
};

/* render_email: the card's side of the shared email transform (assets/email.js).
 * Email clients are not browsers - Gmail strips <style> on forward, Outlook
 * renders through Word - so the card is rebuilt as table-based, inline-styled
 * HTML with literal colors, and every pseudo-element decoration materialized
 * as a real character. It runs HERE rather than in the card because the ui://
 * template must stay under the host's ~30KB resource ceiling. The brand arg is
 * the card's own .readable dir, so a branded card exports in its own colours. */
const EMAIL_TOOL = {
  name: 'render_email',
  description:
    'Internal: renders card content HTML as email-client-ready inline-styled HTML for the card UI menu (Email copy/download). Called by the embedded card interface, never by the assistant.',
  inputSchema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'card content HTML (building blocks)' },
      theme: { type: 'string', enum: ['light', 'dark'] },
      brand: { type: 'string', description: 'absolute path to the project .readable dir' },
    },
    required: ['html'],
  },
};

/* copy_text (4.11.1): app-only clipboard bridge. Inside the sandboxed MCP Apps
 * iframe, page-level clipboard writes are swallowed (navigator.clipboard is
 * permission-blocked and execCommand('copy') still RETURNS TRUE while writing
 * nothing), so every Copy button lied with a green check. The card UI now
 * copies through this tool: the server runs as a local process and pipes the
 * text into the OS clipboard helper. The browser path stays as the fallback
 * for hosts without tools/call (standalone reports are unaffected). */
const COPY_TOOL = {
  name: 'copy_text',
  description:
    'Internal: copies text to the system clipboard for the card UI menu. Called by the embedded card interface, never by the assistant.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'plain text to copy' } },
    required: ['text'],
  },
};

/* read_fonts (4.14.1): base64-embedded @font-face css for the kit fonts. An SVG
 * rendered via Image->canvas (the PNG export) CANNOT load an external @import
 * font — it rasterizes in a system fallback (Vazirmatn -> Tahoma), which is why
 * copied images looked "wrong font". The fix is to inline the actual font bytes.
 * The card UI can't afford the fetch+base64 code inside the 30KB template, so
 * the server (which owns the kit imports and has real network) does it here and
 * hands back ready @font-face css the card mounts before export. Offline -> ''
 * (graceful fallback to the system font, same as before). Not for the model. */
const FONTS_TOOL = {
  name: 'read_fonts',
  description:
    'Internal: returns base64-embedded @font-face CSS (the kit web fonts) so the card UI can inline real font bytes into PNG exports. Called by the embedded card interface, never by the assistant.',
  inputSchema: { type: 'object', properties: {} },
};

/* read_kit (4.20.0): the component half of the kit, selected for one card.
 * The template carries BASE; the app posts the card HTML here and gets back only
 * the snippets that HTML uses. Not for the model - it never sees or sends CSS.
 * Since 5.2.0 the reply also carries the project's signature opt-out as a
 * leading '!', because this is the one app-only call the first paint waits on. */
const KIT_TOOL = {
  name: 'read_kit',
  description:
    'Internal: returns the kit component CSS a specific card needs, selected from its HTML. Called by the embedded card interface, never by the assistant.',
  inputSchema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'The card content HTML to select component CSS for.' },
      brand: { type: 'string', description: 'The card call\'s .readable brand dir, if any; carries the signature opt-out.' },
    },
  },
};

const FONT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/* Vazirmatn is an Arabic-script face; keep only the subsets a Persian/English
 * card actually uses so the embedded payload stays a few hundred KB, not MBs. */
const FONT_SUBSETS = ['arabic', 'latin', 'latin-ext'];
let fontCache = null;

async function fetchText(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ctrl.signal });
    return r.ok ? await r.text() : '';
  } finally { clearTimeout(t); }
}

/* Fetch each kit @import sheet (Google Fonts, woff2 via the browser UA), then
 * for every kept @font-face swap its gstatic url for a data: URI of the actual
 * bytes. Cached after the first success; a fully offline run returns '' and is
 * not cached, so a later online export can still embed. */
async function embedFonts() {
  if (fontCache) return fontCache;
  const urls = [];
  KIT_IMPORTS.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) => { urls.push(u); return _; });
  let out = '';
  for (const u of urls) {
    let sheet = '';
    try { sheet = await fetchText(u, { 'user-agent': FONT_UA }); } catch (e) { sheet = ''; }
    if (!sheet) continue;
    const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(sheet))) {
      const subset = m[1], body = m[2];
      if (subset && FONT_SUBSETS.indexOf(subset) < 0) continue;
      const um = body.match(/url\((https:\/\/[^)]+\.woff2)\)/);
      if (!um) continue;
      let data = '';
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 8000);
        const fr = await fetch(um[1], { signal: ctrl.signal });
        clearTimeout(to);
        if (fr.ok) data = 'data:font/woff2;base64,' + Buffer.from(await fr.arrayBuffer()).toString('base64');
      } catch (e) { data = ''; }
      if (!data) continue;
      out += '@font-face{' + body.replace(um[1], data) + '}';
    }
  }
  if (out) fontCache = out;
  return out;
}

/* Every child process this server starts is handed a UTF-8 ctype (5.7.0).
 *
 * The server is spawned by a GUI app, so it inherits no LANG and no LC_*: the
 * environment a desktop app hands its children has no locale in it at all.
 * macOS command line tools read that as Mac OS Roman, so pbcopy took perfectly
 * good UTF-8 bytes on stdin, decoded each one as a MacRoman character, and put
 * the result on the clipboard. Copying a Persian card produced
 * "ŸÖÿ≥ÿ™ŸÜÿØ" where "مستند" was written: two bytes per letter, each byte
 * shown as its own glyph. The bytes leaving node were never wrong; the
 * transcoding at the far end was. osascript decodes its -e script the same way,
 * which mangled a Persian default filename in the save panel and could hand
 * back a mangled path to write to.
 *
 * LC_CTYPE is the one variable that decides this, so it is the one we set. */
function utf8Env(extra) {
  return Object.assign({}, process.env, { LC_CTYPE: 'UTF-8' }, extra || null);
}

/* READABLE_COPY_CMD overrides the helper (tests use `cat` so runs never touch
 * the developer's real clipboard). clip.exe reads UTF-16LE; the text is encoded
 * as bare UTF-16LE with NO BOM — a leading BOM (U+FEFF) is pasted as a literal
 * zero-width character, which showed up as a stray glyph beside every copy and
 * mangled Persian snippets (field bug on Windows). Everywhere else the input is
 * an explicit UTF-8 Buffer, so node's default string encoding never gets a
 * vote either. */
function copyText(text) {
  const { spawnSync } = require('child_process');
  const env = process.env.READABLE_COPY_CMD;
  const cands = env ? [env.split(' ')] :
    process.platform === 'darwin' ? [['pbcopy']] :
    process.platform === 'win32' ? [['clip']] :
    [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '-ib']];
  const input = !env && process.platform === 'win32'
    ? Buffer.from(text, 'utf16le')
    : Buffer.from(text, 'utf8');
  for (const [cmd, ...args] of cands) {
    const r = spawnSync(cmd, args, { input, env: utf8Env() });
    if (!r.error && r.status === 0) return cmd;
  }
  throw new Error('no clipboard helper worked');
}

/* read_card_file: the app-side half of the card tool's htmlFile mode (4.6).
 * The bridge fetches the file content through the host (tools/call), so the
 * HTML reaches the iframe without ever entering the model's context — the
 * measured alternative (structuredContent.html) is echoed back to the model
 * verbatim by the desktop host. Guardrails: absolute path, *-card.html name,
 * size cap, and the same no-<style>/<script> rule as inline cards. */
const READ_TOOL = {
  name: 'read_card_file',
  description:
    'Internal: returns the content of a pre-written *-card.html report file for the card UI to render (the card tool\'s htmlFile mode). Called by the embedded card interface, never by the assistant.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'absolute path ending in -card.html' },
    },
    required: ['path'],
  },
};

const CARD_FILE_MAX = 256 * 1024;

function readCardFile(p) {
  const abs = String(p);
  if (!path.isAbsolute(abs)) throw new Error('htmlFile must be an absolute path');
  if (!/-card\.html$/.test(path.basename(abs))) throw new Error('htmlFile must end with -card.html');
  let st;
  try { st = fs.statSync(abs); } catch (e) { throw new Error('htmlFile not found: ' + abs); }
  if (!st.isFile()) throw new Error('htmlFile is not a regular file');
  if (st.size > CARD_FILE_MAX) throw new Error('htmlFile too large (max 256KB)');
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.trim()) throw new Error('htmlFile is empty');
  if (/<\s*(style|script)\b/i.test(text)) throw new Error('htmlFile must not contain <style> or <script>');
  return text;
}

/* brand (4.13.0; guessing tightened in 4.13.1): a project can carry a
 * committable .readable/brand.css (palette-variable overrides, light +
 * dark) that reskins its cards. The desktop app runs ONE server for every
 * open project and may report them all as roots, so the explicit per-call
 * dir (announced per-project by the plugin's SessionStart hook) is the only
 * session-accurate source; brandDirFor guesses server-side ONLY when the
 * guess is unambiguous (a lone root, or a project cwd on CLI plugin
 * spawns). The bridge fetches the css through read_brand (app-only), so it
 * never enters the model's context; structuredContent carries only the
 * dir path. */
const BRAND_TOOL = {
  name: 'read_brand',
  description:
    'Internal: returns a project\'s .readable brand layer (normalized CSS) for the card UI to apply. Called by the embedded card interface, never by the assistant.',
  inputSchema: {
    type: 'object',
    properties: {
      dir: { type: 'string', description: 'absolute path of the project\'s .readable dir' },
    },
    required: ['dir'],
  },
};

const BRAND_CSS_MAX = 16 * 1024;
const brandCache = new Map(); // dir -> { key, css }

function brandDirOk(d) {
  return typeof d === 'string' && d.trim() !== '' && path.isAbsolute(d) &&
    path.basename(d) === '.readable' && fs.existsSync(path.join(d, 'brand.css'));
}

/* Explicit call arg first. Otherwise guess only when the guess is
 * unambiguous: a lone workspace root, or (rootless spawn) a bounded walk up
 * from cwd, which stops before home and / so a stray ~/.readable can never
 * brand everything. With several roots open, one shared server serves every
 * session and cannot attribute a call to a project, so it must not guess at
 * all: 4.13.0 guessed here and skinned one project's cards with a parallel
 * project's brand. */
function brandDirFor(explicit) {
  if (brandDirOk(explicit)) return path.resolve(String(explicit));
  if (clientRoots.length > 1) return null;
  if (clientRoots.length === 1) {
    const c = path.join(clientRoots[0], '.readable');
    return brandDirOk(c) ? c : null;
  }
  let d = process.cwd();
  if (!d || d === '/' || d === os.homedir()) return null;
  for (let i = 0; i < 8; i++) {
    const c = path.join(d, '.readable');
    if (brandDirOk(c)) return c;
    const up = path.dirname(d);
    if (up === d || up === os.homedir() || up === '/') break;
    d = up;
  }
  return null;
}

/* The letterhead is a .rc::before rule, so it ships INSIDE the brand css at
 * runtime and costs the 30KB template ceiling nothing. The wordmark renders as
 * the pseudo's text content; a logo rides as a data-URI — a currentColor mark
 * uses -webkit-mask so it tints to the text color and theme-flips (logo-only
 * case), otherwise a background-image keeps the mark's own colors. It sits at
 * the very top of the card, above the title, and is invisible to every #card
 * exporter (pseudo-elements never serialize), mirroring the report whose .brand
 * header lives outside #card. Trusted (committed config) but hardened: the svg
 * loses its xml prolog, comments, any <script>, every on*= handler and any
 * javascript: url before it ever reaches the iframe. */
function brandHeadCss(dir) {
  let meta = {};
  const mf = path.join(dir, 'brand.json');
  try { if (fs.existsSync(mf)) meta = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { meta = {}; }
  const wordmark = String(meta.wordmark || meta.name || '');
  let uri = '', mono = false;
  const lf = path.join(dir, String(meta.logo || 'logo.svg'));
  try {
    if (fs.existsSync(lf) && path.extname(lf) === '.svg' && fs.statSync(lf).size <= 8 * 1024) {
      const svg = fs.readFileSync(lf, 'utf8')
        .replace(/<\?xml[^]*?\?>|<!--[^]*?-->|<script[^]*?<\/script>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript:/gi, '').replace(/[\r\n\t]+/g, ' ').trim();
      mono = /currentColor/i.test(svg);
      uri = 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27') + '")';
    }
  } catch (e) { uri = ''; }
  if (!wordmark && !uri) return '';
  const label = '"' + wordmark.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const bgPos = '.rc[dir=rtl]::before{background-position:right center}.rc[dir=ltr]::before{background-position:left center}';
  if (uri && wordmark) {
    return '.rc::before{content:' + label + ';display:block;font-weight:800;font-size:14.5px;line-height:24px;color:var(--text-primary);margin-bottom:14px;padding-inline-start:32px;background:' + uri + ' no-repeat;background-size:24px 24px}' + bgPos;
  }
  if (uri) {
    if (mono) return '.rc::before{content:"";display:block;height:24px;margin-bottom:14px;background:var(--text-primary);-webkit-mask:' + uri + ' no-repeat center/24px;mask:' + uri + ' no-repeat center/24px}';
    return '.rc::before{content:"";display:block;height:24px;margin-bottom:14px;background:' + uri + ' no-repeat left center/24px}.rc[dir=rtl]::before{background-position:right center}';
  }
  return '.rc::before{content:' + label + ';display:block;font-weight:800;font-size:14.5px;color:var(--text-primary);margin-bottom:12px}';
}

/* The css lands in a <style> tag inside the card iframe: '<' never appears in
 * valid CSS, so stripping it kills any </style> breakout. @import lines are
 * dropped except Google Fonts (the one host the iframe CSP is known to allow,
 * it already serves Vazirmatn/Inter), and bare [data-theme="dark"] selectors
 * are raised to html[data-theme="dark"] so they tie with the template palette
 * and win by source order. The letterhead ::before rule rides along only when
 * the brand has a logo/wordmark, so a plain palette brand pays nothing extra. */
function brandParts(dir) {
  if (!brandDirOk(dir)) throw new Error('dir must be an absolute path to a project .readable dir containing brand.css');
  const p = path.join(dir, 'brand.css');
  const st = fs.statSync(p);
  if (st.size > BRAND_CSS_MAX) throw new Error('brand.css too large (max 16KB)');
  const mtime = (f) => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch (e) { return 0; } };
  const key = st.mtimeMs + ':' + st.size + ':' + mtime('brand.json') + ':' + mtime('logo.svg');
  const hit = brandCache.get(dir);
  if (hit && hit.key === key) return hit;
  let css = fs.readFileSync(p, 'utf8').replace(/</g, '');
  const imports = (css.match(/@import[^\n]+/g) || []).filter((l) => l.indexOf('fonts.googleapis') !== -1);
  css = css.replace(/@import[^\n]+/g, '');
  css = css.replace(/(^|[}\s,])\[data-theme=/g, '$1html[data-theme=');
  css = imports.concat([css]).join('\n');
  const head = brandHeadCss(dir);
  if (head) css += '\n' + head;
  const parts = { key, css };
  brandCache.set(dir, parts);
  return parts;
}

/* One app-only call: read_brand returns the normalized palette css, with the
 * letterhead ::before rule already folded in when the brand has one. The bridge
 * mounts it as a late <style>; the model never sees it. */
function readBrand(dir) { return brandParts(dir).css; }

/* SIGNATURE OPT-OUT (5.2.0): "signature": false in the project's
 * .readable/brand.json. One mechanism for both paths (build.py reads the same
 * key), committable, and it sits with the identity that raises the question in
 * the first place - a brand layer is what turns a report into someone else's
 * client-facing document. Resolution reuses brandDirFor, so an explicit dir
 * wins and an empty one still gets the unambiguous lone-root/cwd guess; a
 * missing or malformed brand.json means opted IN, never a hard failure. */
function sigOff(dir) {
  const d = brandDirFor(dir);
  if (!d) return false;
  try {
    const f = path.join(d, 'brand.json');
    return fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).signature === false;
  } catch (e) { return false; }
}

/* The email transform is not written here: assets/email.js is THE single
 * source, shared verbatim with the standalone report (skills/report/build.py
 * inlines the same file). Until 5.4.0 each host carried its own adapter and
 * they drifted apart; the only thing this side owns now is resolving the
 * project brand into the palette the transform paints with. */
const EMAIL_CANDIDATES = [
  path.join(__dirname, '..', 'assets', 'email.js'), // plugin layout
  path.join(__dirname, 'email.js'), // bundled layout (.mcpb extension)
];
const renderEmail = require(EMAIL_CANDIDATES.find((p) => fs.existsSync(p)));

/* A branded card used to export with no brand at all: the transform's palette
 * was a hardcoded map, so the one artifact most likely to leave the building
 * left it in someone else's colours. The brand css the card itself is wearing
 * is fed in instead, and email.js resolves every literal from it. Never
 * throws: an unbrandable dir is simply the default palette. */
function emailBrand(dir) {
  try {
    const d = brandDirFor(dir);
    return d ? brandParts(d).css : '';
  } catch (e) {
    return '';
  }
}

function saveDir() {
  if (process.env.READABLE_SAVE_DIR) return process.env.READABLE_SAVE_DIR;
  // A lone workspace root (MCP roots/list) is the session's project; with
  // several open projects the caller is unknown, so fall through rather than
  // dropping the file into whichever root happens to be listed first.
  if (clientRoots.length === 1 && fs.existsSync(clientRoots[0])) return clientRoots[0];
  const cwd = process.cwd();
  // Plugin-spawned servers inherit the project dir; app-spawned ones sit at /.
  if (cwd && cwd !== '/' && cwd !== os.homedir()) return cwd;
  return path.join(os.homedir(), 'Downloads');
}

/* Keeps Unicode letters (Persian card titles stay Persian on disk); strips
 * path separators and control chars, spaces become dashes. */
function cleanName(filename) {
  const clean = String(filename).normalize('NFC').replace(/\s+/g, ' ').trim()
    .replace(/[^\p{L}\p{N} ._-]+/gu, '_').replace(/ /g, '-').replace(/^[._-]+/, '').slice(0, 80);
  if (!clean) throw new Error('bad filename');
  return clean;
}

function saveCard(filename, content, encoding) {
  const clean = cleanName(filename);
  const dir = saveDir();
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(clean);
  const base = clean.slice(0, clean.length - ext.length);
  let target = path.join(dir, clean);
  for (let n = 1; fs.existsSync(target); n++) target = path.join(dir, base + '-' + n + ext);
  fs.writeFileSync(target, Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8'));
  return target;
}

/* macOS native save panel from this faceless node process: osascript's
 * "choose file name" (StandardAdditions, no TCC prompt). The RPC was already
 * ACKed, so cancel (-128) or failure only logs to stderr; the dialog itself
 * is the user feedback. Replace-confirmation is the dialog's, so no -1 suffix
 * loop here. */
function pickAndSave(filename, content, encoding, dir) {
  const clean = cleanName(filename);
  if (!fs.existsSync(dir)) dir = path.join(os.homedir(), 'Downloads');
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = 'POSIX path of (choose file name with prompt "Save card export" default name "' +
    esc(clean) + '" default location POSIX file "' + esc(dir) + '")';
  // encoding + LC_CTYPE both matter here: the first decodes the path osascript
  // hands back, the second decides how osascript reads the Persian default
  // filename we just wrote into the script. See utf8Env.
  require('child_process').execFile('/usr/bin/osascript', ['-e', script], { timeout: 180000, encoding: 'utf8', env: utf8Env() }, (err, out) => {
    try {
      if (err) {
        const cancel = String(err.message || '').indexOf('-128') !== -1;
        process.stderr.write('[readable-card] save picker ' + (cancel ? 'cancelled' : 'failed: ' + String(err.message).slice(0, 120)) + '\n');
        return;
      }
      const target = String(out).trim();
      if (!target) return;
      fs.writeFileSync(target, Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8'));
      process.stderr.write('[readable-card] save_card picked -> ' + target + '\n');
    } catch (e) {
      try { process.stderr.write('[readable-card] picked save failed: ' + String(e && e.message) + '\n'); } catch (e2) {}
    }
  });
}

const CARD_RESOURCE = {
  uri: CARD_URI,
  name: 'readable_card_template',
  description: 'readable RTL card template (kit CSS + MCP Apps bridge)',
  mimeType: UI_MIME,
  _meta: {
    ui: {
      csp: {
        resourceDomains: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        connectDomains: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      },
      permissions: { clipboardWrite: {} },
      prefersBorder: false,
    },
  },
};

let clientSupportsUi = false;
let clientSupportsRoots = false;
let clientRoots = [];

/* WHICH surface is on the other end (6.3.0)? Every client calls itself
 * claude-ai/0.1.0, and the same name negotiates MCP Apps on one connection and
 * not on the next: one machine's log held 163 YES against 45 NO in a day, all
 * under that one name. From the outside that reads as a coin flip, and a whole
 * afternoon can go into guessing which surface a given session was. The parent
 * process knows, so ask it once and put it in the handshake line beside the
 * answer. Cheap, best-effort, and it never blocks the handshake: no parent, no
 * ps, or a slow ps, all just yield "?". */
let spawnedByCache = null;
function spawnedBy() {
  if (spawnedByCache !== null) return spawnedByCache;
  spawnedByCache = '?';
  try {
    const ppid = process.ppid;
    if (!ppid) return spawnedByCache;
    const r = require('child_process').spawnSync(
      process.platform === 'win32' ? 'wmic' : 'ps',
      process.platform === 'win32'
        ? ['process', 'where', 'ProcessId=' + ppid, 'get', 'Name']
        : ['-p', String(ppid), '-o', 'args='],
      { encoding: 'utf8', timeout: 2000 }
    );
    const line = String((r && r.stdout) || '').trim().split('\n')[0] || '';
    // The interesting part is which app/binary it is, not the full argv, and a
    // full argv here would put the user's paths into a log they may paste.
    const m = line.match(/([^\/\\ ]+)(?:\.app\/Contents\/[^ ]*)?\s*$/) ||
              line.match(/([^\/\\]+)$/);
    const app = (line.match(/\/([^\/]+)\.app\//) || [])[1];
    spawnedByCache = (app || (m && m[1]) || '?').slice(0, 40) + '/pid' + ppid;
  } catch (e) { /* diagnostics must never break the handshake */ }
  return spawnedByCache;
}

/* Can this host actually paint a card? Everything about the card tool hangs off
 * this one answer: whether the tool is listed, and whether a call to it is
 * honoured or refused. It is deliberately a function and not a captured
 * boolean, because the handshake sets clientSupportsUi after this module
 * loads. */
function uiReady() {
  return clientSupportsUi || process.env.READABLE_FORCE_UI === '1';
}

/* Server->client requests (roots/list). Zero-dep mirror of the bridge's rpc:
 * ids are prefixed so they can never collide with a client request id. */
let srvNextId = 1;
const srvPending = {};
function request(method, params, cb) {
  const id = 'rc' + srvNextId++;
  srvPending[id] = cb;
  write({ jsonrpc: '2.0', id, method, params: params || {} });
}

function rootPath(uri) {
  try {
    const u = new URL(String(uri));
    if (u.protocol !== 'file:') return null;
    const p = decodeURIComponent(u.pathname);
    return process.platform === 'win32' ? p.replace(/^\/([A-Za-z]:)/, '$1') : p;
  } catch (e) { return null; }
}

function refreshRoots() {
  if (!clientSupportsRoots) return;
  request('roots/list', {}, (res, err) => {
    clientRoots = (!err && res && Array.isArray(res.roots) ? res.roots : [])
      .map((r) => rootPath(r && r.uri)).filter(Boolean);
    try { process.stderr.write('[readable-card] roots=' + JSON.stringify(clientRoots) + '\n'); } catch (e) {}
  });
}

function handle(msg) {
  const { id, method, params } = msg;
  // Responses to our own requests: keyed on the pending id, not on the
  // absence of `method` (the bridge learned some peers echo it back).
  if (id != null && srvPending[id] && (('result' in msg) || ('error' in msg))) {
    const cb = srvPending[id];
    delete srvPending[id];
    if (cb) cb(msg.result, msg.error);
    return;
  }
  const respond = (result) => write({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize': {
      const ext = params && params.capabilities && params.capabilities.extensions;
      const ui = ext && ext[UI_EXT];
      clientSupportsUi = Boolean(ui && Array.isArray(ui.mimeTypes) && ui.mimeTypes.indexOf(UI_MIME) !== -1);
      clientSupportsRoots = Boolean(params && params.capabilities && params.capabilities.roots);
      try {
        const ci = (params && params.clientInfo) || {};
        process.stderr.write('[readable-card] client=' + (ci.name || '?') + '/' + (ci.version || '?') +
          ' mcp-apps=' + (clientSupportsUi ? 'YES' : 'NO') +
          ' roots=' + (clientSupportsRoots ? 'YES' : 'NO') +
          ' spawnedBy=' + spawnedBy() +
          ' extensions=' + JSON.stringify(ext ? Object.keys(ext) : []) + '\n');
      } catch (e) { /* logging must never break the handshake */ }
      respond({
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_FALLBACK,
        capabilities: {
          tools: {},
          resources: {},
          extensions: { [UI_EXT]: { mimeTypes: [UI_MIME] } },
        },
        serverInfo: SERVER_INFO,
      });
      return;
    }
    case 'tools/list': {
      // The card tool is offered ONLY to a host that negotiated MCP Apps.
      // Anywhere else it cannot paint, and an unrenderable card tool is worse
      // than no card tool at all: the model calls it, the user sees the raw
      // HTML echoed back, and the actual reply is never written. Absent from
      // the list it cannot be called, and a tool search for it correctly finds
      // nothing instead of half-finding a tool that lies. READABLE_FORCE_UI=1
      // is the escape hatch for a host whose handshake lands late.
      const tools = uiReady() ? [TOOL] : [];
      respond({ tools: tools.concat([SAVE_TOOL, EMAIL_TOOL, READ_TOOL, COPY_TOOL, BRAND_TOOL, FONTS_TOOL, KIT_TOOL]) });
      return;
    }
    case 'tools/call': {
      if (params && params.name === 'copy_text') {
        const a = params.arguments || {};
        if (typeof a.text !== 'string') return fail(-32602, 'text (string) is required');
        try {
          respond({ content: [{ type: 'text', text: 'copied via ' + copyText(a.text) }] });
        } catch (e) {
          respond({ isError: true, content: [{ type: 'text', text: 'copy failed: ' + String(e && e.message) }] });
        }
        return;
      }
      if (params && params.name === 'save_card') {
        const a = params.arguments || {};
        if (typeof a.filename !== 'string' || typeof a.content !== 'string') return fail(-32602, 'filename and content are required');
        try {
          // Native save panel: ACK before the dialog so the card UI never
          // waits on the user; READABLE_SAVE_DIR (tests, power users) and
          // non-mac hosts keep the direct write.
          if (a.pick === true && process.platform === 'darwin' && !process.env.READABLE_SAVE_DIR) {
            const dir = saveDir();
            respond({ content: [{ type: 'text', text: 'picking: ' + dir }] });
            pickAndSave(a.filename, a.content, a.encoding, dir);
            return;
          }
          const saved = saveCard(a.filename, a.content, a.encoding);
          try { process.stderr.write('[readable-card] save_card -> ' + saved + '\n'); } catch (e) {}
          respond({ content: [{ type: 'text', text: saved }] });
        } catch (e) {
          respond({ isError: true, content: [{ type: 'text', text: 'save failed: ' + String(e && e.message) }] });
        }
        return;
      }
      if (params && params.name === 'render_email') {
        const a = params.arguments || {};
        if (typeof a.html !== 'string' || !a.html.trim()) return fail(-32602, 'html (string) is required');
        if (/<\s*(style|script)\b/i.test(a.html)) return fail(-32602, 'html must not contain <style> or <script>');
        respond({ content: [{ type: 'text', text: renderEmail(a.html, { theme: a.theme, brand: emailBrand(a.brand) }) }] });
        return;
      }
      if (params && params.name === 'read_kit') {
        const a = params.arguments || {};
        if (typeof a.html !== 'string') return fail(-32602, 'html (string) is required');
        try {
          // A leading '!' tells the bridge this project opted out of the
          // signature. It rides THIS reply because the first paint already
          // blocks on it, so the flag lands before draw with no flash.
          respond({ content: [{ type: 'text', text: (sigOff(a.brand) ? '!' : '') + kitFor(a.html) }] });
        } catch (e) {
          respond({ isError: true, content: [{ type: 'text', text: 'kit select failed: ' + String(e && e.message) }] });
        }
        return;
      }
      if (params && params.name === 'read_fonts') {
        embedFonts().then(
          (css) => respond({ content: [{ type: 'text', text: css }] }),
          (e) => respond({ isError: true, content: [{ type: 'text', text: 'font embed failed: ' + String(e && e.message) }] })
        );
        return;
      }
      if (params && params.name === 'read_brand') {
        const a = params.arguments || {};
        if (typeof a.dir !== 'string' || !a.dir.trim()) return fail(-32602, 'dir (string) is required');
        try {
          respond({ content: [{ type: 'text', text: readBrand(a.dir) }] });
        } catch (e) {
          respond({ isError: true, content: [{ type: 'text', text: 'brand read failed: ' + String(e && e.message) }] });
        }
        return;
      }
      if (params && params.name === 'read_card_file') {
        const a = params.arguments || {};
        if (typeof a.path !== 'string' || !a.path.trim()) return fail(-32602, 'path (string) is required');
        try {
          respond({ content: [{ type: 'text', text: readCardFile(a.path) }] });
        } catch (e) {
          respond({ isError: true, content: [{ type: 'text', text: 'read failed: ' + String(e && e.message) }] });
        }
        return;
      }
      if (!params || params.name !== 'card') return fail(-32602, 'unknown tool');
      // A host that cannot paint gets a REFUSAL, not a note. The note was the
      // bug: a successful result carrying "this did not render" reads as
      // success, the html rides structuredContent into the transcript as raw
      // markup, and the model signs off with "card delivered above" over a
      // reply the user never saw. An error cannot be mistaken for delivery.
      if (!uiReady()) {
        return fail(-32011, 'this host has no MCP Apps UI, so a card cannot be rendered here and nothing was shown to the user. Deliver the whole reply as text instead (Persian/RTL: BiDi-safe plain text), and do not call this tool again in this conversation.');
      }
      const html = params.arguments && params.arguments.html;
      const htmlFile = params.arguments && params.arguments.htmlFile;
      // Resolve the project brand once per call: explicit arg, else an
      // unambiguous lone-root/cwd guess (never across parallel projects).
      // The result rides structuredContent as a path only; the bridge pulls
      // the css itself, so branding costs the model nothing.
      const brand = brandDirFor(params.arguments && params.arguments.brand);
      if (typeof htmlFile === 'string' && htmlFile.trim()) {
        if (typeof html === 'string' && html.trim()) return fail(-32602, 'pass exactly one of html | htmlFile, not both');
        // Validate now so the model gets an actionable error while it can still
        // fall back to the html argument; the bridge re-reads via read_card_file.
        try { readCardFile(htmlFile); } catch (e) { return fail(-32602, String(e && e.message) + ' — fix the file or pass the content as html'); }
        try { process.stderr.write('[readable-card] tools/call card, htmlFile=' + htmlFile + ', brand=' + (brand || 'none') + '\n'); } catch (e) {}
        respond({ content: [{ type: 'text', text: 'Card rendered by the host UI from the file. Do not repeat the content as text.' }], structuredContent: brand ? { htmlFile: htmlFile, brand } : { htmlFile: htmlFile } });
        return;
      }
      if (typeof html !== 'string' || !html.trim()) return fail(-32602, 'html (string) is required (or htmlFile for a pre-written *-card.html)');
      if (/<\s*(style|script)\b/i.test(html)) return fail(-32602, 'html must not contain <style> or <script>; send content only');
      try { process.stderr.write('[readable-card] tools/call card, html=' + html.length + 'B, brand=' + (brand || 'none') + '\n'); } catch (e) {}
      respond({ content: [{ type: 'text', text: 'Card rendered by the host UI. Do not repeat the content as text.' }], structuredContent: brand ? { html, brand } : { html } });
      return;
    }
    case 'resources/list':
      respond({ resources: [CARD_RESOURCE] });
      return;
    case 'resources/read': {
      if (!params || params.uri !== CARD_URI) return fail(-32002, 'unknown resource');
      respond({
        contents: [{ uri: CARD_URI, mimeType: UI_MIME, text: TEMPLATE_HTML, _meta: CARD_RESOURCE._meta }],
      });
      return;
    }
    case 'ping':
      respond({});
      return;
    case 'notifications/initialized':
    case 'notifications/roots/list_changed':
      refreshRoots();
      return;
    default:
      if (id != null) fail(-32601, 'method not found: ' + method);
    // other notifications (cancelled, …) are ignored by design
  }
}

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

/* The banner exists to say WHICH build the host loaded, so its version is read
 * off the manifest, never typed in. As a literal it drifted: it still said
 * 4.14.1 after 4.16.0 shipped, i.e. it lied exactly when you reach for it.
 * Same layout probe as KIT_CANDIDATES/MENU_CANDIDATES, except existence is not
 * enough here (a file can be present and unparsable), so each candidate is
 * tried through the parse; the .mcpb manifest carries `version` too, so one
 * field name covers both layouts. */
const VERSION_CANDIDATES = [
  path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), // plugin layout
  path.join(__dirname, 'manifest.json'), // bundled layout (.mcpb extension)
];
function readVersion() {
  for (const p of VERSION_CANDIDATES) {
    try {
      const v = JSON.parse(fs.readFileSync(p, 'utf8')).version;
      if (v) return String(v);
    } catch (e) { /* absent or unparsable: try the next layout */ }
  }
  return 'unknown';
}

try { process.stderr.write('[readable-card] build ' + readVersion() + ' file=' + __filename + '\n'); } catch (e) {}
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
    return;
  }
  try {
    handle(msg);
  } catch (e) {
    if (msg && msg.id != null) write({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(e && e.message) } });
  }
});
rl.on('close', () => process.exit(0));
