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

/* The kit's @REPORT tail (components the chat rule does not offer:
 * zebra/dense tables, kpi footnote, duo bars, donut) is cut here to keep
 * the template under the host's 30KB resource ceiling. Relocating donut
 * there (4.8.0) paid for scroll-table in the chat tier. The report shell
 * and the hosted @import ship the full sheet. */
const KIT_CHAT = KIT_CSS.split('/*@REPORT')[0];
/* @import is only valid before all other rules; the kit's Vazirmatn import
 * would die mid-sheet after PALETTE, so imports are hoisted to the top of the
 * template <style> (and Inter added for LTR cards). */
const KIT_BODY = KIT_CHAT.replace(/\/\*[^]*?\*\//g, '');
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
  "function paint(html){if(!html)return;var c=document.getElementById('card');c.setAttribute('dir',dirOf(html));c.innerHTML=html;fit();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit)}",
  "function render(html,isFinal){if(isFinal){finalGot=true;if(partialTimer){clearTimeout(partialTimer);partialTimer=null}paint(html);return}",
  "if(finalGot)return;if(partialTimer)clearTimeout(partialTimer);partialTimer=setTimeout(function(){if(!finalGot)paint(html)},700)}",
  "/* htmlFile mode: the call carries only a path, so the bridge pulls the content itself through the app-only read_card_file tool (host tools/call, same channel as render_email) — the HTML never crosses the model's context. tool-input and tool-result both announce the path; a double fetch is idempotent (render(t,true) repaints the same content), so no dedupe guard is spent on it. */",
  "function fCard(p){if(!p)return;rpc('tools/call',{name:'read_card_file',arguments:{path:p}},function(res,err){var c=!err&&res&&!res.isError&&res.content,t=c&&c[0]&&c[0].text;if(t)render(t,true);else if(window.__rcToast)window.__rcToast('card file read failed')})}",
  "/* The 4.3.5 stall auto-dump (save_card at 5s without input) is gone: the lifecycle bug it chased was fixed in 4.3.8, and its bytes now pay for the Email row. __rcLog + alt-click diagnostics remain. */",
  "function applyTheme(ctx){if(ctx&&ctx.theme)document.documentElement.setAttribute('data-theme',ctx.theme==='dark'?'dark':'light')}",
  "window.__rcRpc=rpc;",
  "/* Project brand (4.13.0): when a call carries a brand dir, fetch its normalized css through the app-only read_brand tool (same channel as htmlFile) and mount it as a late <style> — variable overrides win by source order. One-shot per iframe (bLoaded guard), so no element reuse; palette swaps don't change height and a brand font swap re-fits via the body ResizeObserver. A failed read silently keeps the default look. */",
  "var bLoaded=null;",
  "function bApply(p){if(!p||p===bLoaded)return;bLoaded=p;rpc('tools/call',{name:'read_brand',arguments:{dir:p}},function(res,err){var c=!err&&res&&!res.isError&&res.content,t=c&&c[0]&&c[0].text;if(!t)return;var s=document.createElement('style');s.id='rcbrand';s.textContent=t;document.head.appendChild(s)})}",
  "/* Host adapter for the shared menu (assets/menu.js): email HTML renders server-side (render_email tool, static style map) because the ui:// template must stay under the host's ~30KB resource ceiling. The report shell swaps in a computed-style walker instead. */",
  "window.__rcEmail=function(cb){rpc('tools/call',{name:'render_email',arguments:{html:document.getElementById('card').innerHTML,theme:'light'}},function(res,err){var t=!err&&res&&!res.isError&&res.content&&res.content[0]&&res.content[0].text;if(t)cb(t,null);else cb(null,err?String(err.code||'')+' '+String(err.message||'').slice(0,60):'render failed')})};",
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
 * same move as the kit var aliases): the script opens with two tiny globals
 * and every dotted host-object use shrinks. Property positions only — bare
 * `document`/`window` tokens (none today) would stay long and still work.
 * Frees ~0.4KB of the 30KB host ceiling, which pays for project brands
 * (4.13.0). test.js parse-checks the squeezed script. */
function squeezeJs(js) {
  return 'var D=document,W=window;' + js.split('document.').join('D.').split('window.').join('W.');
}

const TEMPLATE_HTML =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>\n' +
  KIT_IMPORTS + '\n' + PALETTE + '\n' + KIT_RULES + '\n' + FLUSH_CSS + '\n' + LTR_CSS +
  '\n</style></head><body><div class="rc" id="card" dir="rtl"><p>…</p></div>' +
  '<script>' + squeezeJs(BRIDGE_JS + MENU_SRC) + '</script></body></html>';

const TOOL = {
  name: 'card',
  description:
    'ALWAYS use this tool to deliver ANY reply written in Persian or another RTL language (plain RTL chat text scrambles; this renders it as a correct styled card), and PREFER it for English conversational, explanatory, or structured answers too. Skip it only for replies dominated by code blocks, diffs, or logs. Call it exactly once per reply, with the ENTIRE reply as the html argument; the call IS the reply, so output no reply text before or after it. Build the html from these blocks only: <h2> once as title, <p class="lead"> intro, <h3> sections, <p>, <ul>/<ol>, <li class="ok|no">, callouts <div class="cal tip|note|warn|danger"><div>…</div></div>, <table><thead><tbody> (long tables, 100+ rows: wrap as <div class="scroll-table"><table>…</table></div> for a scrollbox with pinned header; add class "wide" to the wrapper when columns are many/wide: cells stay on one line and the box scrolls sideways), <span class="badge ok|warn|info">, key-values <div class="kv"><div><b>k</b><span>v</span></div>…</div>, KPI cards <div class="grid c3|c2"><div class="kpi"><div class="l">label</div><div class="n">1.2M<span class="trend up">18%</span></div></div></div>, bars <div class="bars"><div class="bar"><span class="l">l</span><span class="t"><i style="width:72%"></i></span><span class="v">72%</span></div></div>, trend sparkline <div class="spark"><svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="0,26 25,19 50,22 75,10 100,4"/></svg><div class="x"><span>old</span><span>new</span></div></div> (time series: x evenly spaced 0..100 oldest→newest, y inverted 2≈max 28≈min, computed from the data; optional area: prepend <polygon points="0,30 …same points… 100,30"/>; optional second series: append <polyline class="s2" points="…"/>), flow <div class="flow"><span class="s">step</span>…</div>, timeline <div class="tl"><div><b>t</b>text</div>…</div>, <code> around every inline path/URL/code token, <pre><code>…</code></pre> for multiline code (renders LTR), optional CTA buttons <div class="btns"><button class="cta" onclick="sendPrompt(\'…\')">label</button></div>. NO <style>, NO <script>, NO wrapper div: the template styles everything, light and dark. Short answers are fine as plain <p> paragraphs inside the card. ' +
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

/* render_email: server-side email transform (4.4). Email clients strip
 * <style> and classes, so the card is rebuilt as inline-styled HTML: a
 * static class->style map with the palette resolved to literal colors (the
 * server owns rc.css, so the map is written down instead of measured),
 * pseudo-element decorations materialized as real spans (list glyphs, h2
 * underline bar, h3 square, trend arrows, flow arrows), flex/grid flattened
 * to block, interactive bits dropped. Transform decisions ported from the
 * 4.3.0 in-template emailHtml() (commit 8beb7e1). */
const EMAIL_TOOL = {
  name: 'render_email',
  description:
    'Internal: renders card content HTML as email-client-ready inline-styled HTML for the card UI menu (Email copy/download). Called by the embedded card interface, never by the assistant.',
  inputSchema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'card content HTML (building blocks)' },
      theme: { type: 'string', enum: ['light', 'dark'] },
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

/* READABLE_COPY_CMD overrides the helper (tests use `cat` so runs never touch
 * the developer's real clipboard). clip.exe only accepts UTF-16LE. */
function copyText(text) {
  const { spawnSync } = require('child_process');
  const env = process.env.READABLE_COPY_CMD;
  const cands = env ? [env.split(' ')] :
    process.platform === 'darwin' ? [['pbcopy']] :
    process.platform === 'win32' ? [['clip']] :
    [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '-ib']];
  const input = !env && process.platform === 'win32' ? Buffer.from('﻿' + text, 'utf16le') : text;
  for (const [cmd, ...args] of cands) {
    const r = spawnSync(cmd, args, { input });
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

/* The css lands in a <style> tag inside the card iframe: '<' never appears in
 * valid CSS, so stripping it kills any </style> breakout. @import lines are
 * dropped except Google Fonts (the one host the iframe CSP is known to allow,
 * it already serves Vazirmatn/Inter), and bare [data-theme="dark"] selectors
 * are raised to html[data-theme="dark"] so they tie with the template palette
 * and win by source order. */
function readBrand(dir) {
  if (!brandDirOk(dir)) throw new Error('dir must be an absolute path to a project .readable dir containing brand.css');
  const p = path.join(dir, 'brand.css');
  const st = fs.statSync(p);
  if (st.size > BRAND_CSS_MAX) throw new Error('brand.css too large (max 16KB)');
  const key = st.mtimeMs + ':' + st.size;
  const hit = brandCache.get(dir);
  if (hit && hit.key === key) return hit.css;
  let css = fs.readFileSync(p, 'utf8').replace(/</g, '');
  const imports = (css.match(/@import[^\n]+/g) || []).filter((l) => l.indexOf('fonts.googleapis') !== -1);
  css = css.replace(/@import[^\n]+/g, '');
  css = css.replace(/(^|[}\s,])\[data-theme=/g, '$1html[data-theme=');
  css = imports.concat([css]).join('\n');
  brandCache.set(dir, { key, css });
  return css;
}

const EMAIL_PAL = {
  light: { tx: '#1f1f1f', sub: '#6f6f6a', ac: '#2f66c4', s1: '#ffffff', s2: '#f2f2ef', bd: '#dcdcd6', bs: '#b8b8b0', gok: '#e6f4ec', gac: '#e8effc', gwa: '#faf0d9', gda: '#fbe9e7' },
  dark: { tx: '#ececea', sub: '#9f9f98', ac: '#82abec', s1: '#262624', s2: '#302f2c', bd: '#3e3e3a', bs: '#55554f', gok: '#143122', gac: '#16283f', gwa: '#382c13', gda: '#3a1d19' },
};
const EMAIL_CA = '#0f9d58', EMAIL_CB = '#3f8ac9', EMAIL_CD = '#d96666';
const EMAIL_MONO = 'ui-monospace,Menlo,monospace';
const EMAIL_VOID = { br: 1, hr: 1, img: 1 };

/* Minimal tag walker for the card's constrained building-block HTML
 * (already validated upstream: no <style>/<script>). Zero dependencies. */
function emailParse(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<!--[^]*?-->|<\/([a-zA-Z][a-zA-Z0-9]*)\s*>|<([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      const t = m[1].toLowerCase();
      let n = cur;
      while (n && n.tag !== t) n = n.parent;
      if (n && n.parent) cur = n.parent;
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const attrs = {};
      const ar = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let am;
      while ((am = ar.exec(m[3] || ''))) attrs[am[1].toLowerCase()] = am[2] != null ? am[2] : am[3] != null ? am[3] : am[4] || '';
      const node = { tag: tag, attrs: attrs, children: [], parent: cur };
      cur.children.push(node);
      if (!EMAIL_VOID[tag] && m[4] !== '/') cur = node;
    } else if (m[5]) {
      cur.children.push({ text: m[5] });
    }
  }
  return root;
}

/* Email direction follows the content's majority script, same rule as the
 * template bridge (ties go RTL: the tool is Persian-first). code/pre spans
 * are stripped before counting — paths and commands are direction-neutral
 * and must not outvote the prose (same 4.6.1 fix as the bridge dirOf). */
function emailDir(html) {
  const t = String(html)
    .replace(/<(code|pre)[^>]*>[^]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  const r = (t.match(/[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g) || []).length;
  const l = (t.match(/[A-Za-z]/g) || []).length;
  return r >= l ? 'rtl' : 'ltr';
}

function renderEmail(html, theme) {
  const P = EMAIL_PAL[theme === 'dark' ? 'dark' : 'light'];
  const DIR = emailDir(html);
  const R = DIR === 'rtl';
  const S = R ? 'right' : 'left'; // physical side of inline-start
  const E = R ? 'left' : 'right'; // physical side of inline-end
  const has = (n, c) => (' ' + ((n.attrs && n.attrs['class']) || '') + ' ').indexOf(' ' + c + ' ') !== -1;

  function children(n, ctx) {
    let last = null;
    for (const c of n.children) if (c.tag) last = c;
    let out = '';
    for (const c of n.children) out += emit(c, n, Object.assign({}, ctx, { isLast: c === last }));
    return out;
  }

  /* .flow: the kit draws the arrows as ::after; here they become real spans between steps */
  function flowChildren(n, ctx) {
    let out = '', first = true;
    for (const c of n.children) {
      if (!c.tag) continue;
      if (!first) out += '<span style="color:' + P.ac + ';padding:0 6px">' + (R ? '\u2190' : '\u2192') + '</span>';
      out += emit(c, n, ctx);
      first = false;
    }
    return out;
  }

  function emit(n, parent, ctx) {
    if (n.text != null) return n.text;
    const tag = n.tag;
    const p = (c) => parent != null && has(parent, c);

    /* interactive + undrawable bits are dropped (spark is SVG: email clients strip it) */
    if (has(n, 'btns') || has(n, 'cta') || tag === 'button' || has(n, 'spark')) return '';

    let st = '', dir = DIR, pre = '', post = '', inner = null, next = ctx;

    if (tag === 'h2') {
      st = 'font-weight:800;font-size:15.5px;margin:0 0 2px;unicode-bidi:plaintext';
      post = '<div style="width:28px;height:3px;background:' + P.ac + ';border-radius:2px;margin-top:6px"></div>';
    } else if (tag === 'h3') {
      st = 'font-weight:700;font-size:12.7px;margin:18px 0 6px';
      pre = '<span style="display:inline-block;width:7px;height:7px;background:' + P.ac + ';border-radius:2px;margin-' + E + ':8px"></span>';
    } else if (tag === 'h4') {
      st = 'font-weight:700;font-size:11.5px;margin:12px 0 3px;unicode-bidi:plaintext';
    } else if (tag === 'p') {
      st = 'margin:' + (ctx.cal ? '2px' : '7px') + ' 0;unicode-bidi:plaintext';
      if (has(n, 'lead')) st += ';color:' + P.sub + ';font-size:12.1px';
    } else if (has(n, 'badge')) {
      const bset = has(n, 'ok') ? [P.gok, EMAIL_CA] : has(n, 'warn') ? [P.gwa, '#c98a1a'] : has(n, 'info') ? [P.gac, EMAIL_CB] : [P.s2, P.sub];
      st = 'display:inline-block;font-size:9px;font-weight:700;padding:1px 9px;border-radius:20px;background:' + bset[0] + ';color:' + bset[1];
    } else if (has(n, 'trend')) {
      const up = has(n, 'up');
      st = 'display:inline-block;font-size:11.4px;font-weight:700;padding:1px 8px;border-radius:12px;vertical-align:2px;margin-' + S + ':7px;background:' + (up ? P.gok : P.gda) + ';color:' + (up ? EMAIL_CA : EMAIL_CD);
      pre = up ? '▲ ' : '▼ ';
    } else if (tag === 'strong' || (tag === 'b' && !ctx.kvRow && !ctx.tlRow)) {
      st = 'font-weight:700';
    } else if (tag === 'b' && ctx.kvRow) {
      st = 'color:' + P.sub + ';font-weight:400';
    } else if (tag === 'b' && ctx.tlRow) {
      st = 'display:block;font-weight:700';
    } else if (tag === 'code' && parent && parent.tag === 'pre') {
      dir = 'ltr'; st = 'display:block';
    } else if (tag === 'code') {
      dir = 'ltr';
      st = 'display:inline-block;direction:ltr;font-family:' + EMAIL_MONO + ';font-size:9.8px;color:' + P.ac + ';background:' + P.s2 + ';border:.5px solid ' + P.bd + ';border-radius:5px;padding:1px 5px';
    } else if (tag === 'a') {
      st = 'color:' + P.ac + ';text-decoration:none';
    } else if (tag === 'ul') {
      st = 'list-style:none;padding:0 ' + (R ? '17px 0 0' : '0 0 17px') + ';margin:6px 0';
    } else if (tag === 'ol') {
      st = 'padding:0 ' + (R ? '17px 0 0' : '0 0 17px') + ';margin:6px 0';
    } else if (tag === 'li') {
      st = 'margin:4px 0;unicode-bidi:plaintext';
      if (has(n, 'ok')) pre = '<span style="color:' + EMAIL_CA + ';font-weight:800">✓&nbsp;</span>';
      else if (has(n, 'no')) pre = '<span style="color:#e05555;font-weight:800">✕&nbsp;</span>';
      else if (parent && parent.tag === 'ul') pre = '<span style="color:' + P.ac + '">•&nbsp;</span>';
    } else if (has(n, 'cal')) {
      const edge = has(n, 'tip') ? EMAIL_CA : has(n, 'note') ? EMAIL_CB : has(n, 'warn') ? '#c98a1a' : has(n, 'danger') ? '#d64545' : P.bs;
      const fill = has(n, 'tip') ? P.gok : has(n, 'note') ? P.gac : has(n, 'warn') ? P.gwa : has(n, 'danger') ? P.gda : P.s2;
      st = 'display:block;background:' + fill + ';border-' + S + ':3px solid ' + edge + ';border-radius:10px;padding:9px 12px;margin:9px 0';
      next = Object.assign({}, ctx, { cal: true });
    } else if (tag === 'hr') {
      st = 'border:none;border-top:.5px solid ' + P.bd + ';margin:15px 0';
    } else if (tag === 'pre') {
      dir = 'ltr';
      st = 'direction:ltr;text-align:left;font-family:' + EMAIL_MONO + ';font-size:9.8px;background:' + P.s2 + ';border:.5px solid ' + P.bd + ';border-radius:8px;padding:10px 12px;line-height:1.6;margin:8px 0;white-space:pre-wrap';
    } else if (tag === 'table') {
      st = 'border-collapse:collapse;width:100%;margin:9px 0;font-size:11px';
    } else if (tag === 'tr') {
      next = Object.assign({}, ctx, { lastRow: Boolean(ctx.isLast && parent && parent.tag === 'tbody') });
    } else if (tag === 'th') {
      st = 'color:' + P.sub + ';font-weight:700;font-size:9.7px;border-bottom:1.5px solid ' + P.bs + ';padding:5px 10px;text-align:' + S;
    } else if (tag === 'td') {
      st = 'padding:7px 10px;text-align:' + S + ';unicode-bidi:plaintext' + (ctx.lastRow ? '' : ';border-bottom:.5px solid ' + P.bd);
    } else if (has(n, 'kv')) {
      st = 'margin:9px 0';
      next = Object.assign({}, ctx, { kv: true });
    } else if (ctx.kv && tag === 'div') {
      st = 'display:block;padding:6px 2px' + (ctx.isLast ? '' : ';border-bottom:.5px solid ' + P.bd);
      next = Object.assign({}, ctx, { kv: false, kvRow: true });
    } else if (ctx.kvRow && tag === 'span') {
      st = 'font-weight:500';
    } else if (has(n, 'grid')) {
      st = 'margin:9px 0';
    } else if (has(n, 'kpi')) {
      st = 'display:block;background:' + P.s2 + ';border:.5px solid ' + P.bd + ';border-radius:11px;padding:11px 13px;margin:0 0 8px;unicode-bidi:plaintext';
    } else if (has(n, 'l') && p('kpi')) {
      st = 'font-size:9.4px;color:' + P.sub + ';margin-bottom:3px';
    } else if (has(n, 'n') && p('kpi')) {
      st = 'font-size:20.7px;font-weight:800;line-height:1.2';
    } else if (has(n, 'bars')) {
      st = 'margin:9px 0';
    } else if (has(n, 'bar') && p('bars')) {
      st = 'display:block;margin:5px 0';
    } else if (has(n, 'l') && p('bar')) {
      st = 'display:inline-block;min-width:52px;margin-' + E + ':10px;color:' + P.sub;
    } else if (has(n, 't') && p('bar')) {
      st = 'display:inline-block;width:220px;height:7px;background:' + P.s2 + ';border-radius:4px;vertical-align:middle';
    } else if (tag === 'i' && p('t')) {
      const w = (String((n.attrs && n.attrs.style) || '').match(/width\s*:\s*([\d.]+%)/) || [])[1] || '0%';
      st = 'display:block;width:' + w + ';height:7px;background:' + P.ac + ';border-radius:4px';
    } else if (has(n, 'v') && p('bar')) {
      st = 'display:inline-block;font-weight:700;font-size:10.4px;margin-' + S + ':10px';
    } else if (has(n, 'flow')) {
      st = 'margin:10px 2px';
      inner = flowChildren(n, next);
    } else if (has(n, 's') && p('flow')) {
      st = 'display:inline-block;background:' + P.s2 + ';border:.5px solid ' + P.bd + ';border-radius:9px;padding:5px 13px;font-weight:500';
    } else if (has(n, 'tl')) {
      st = 'margin:10px 3px;padding:0 ' + (R ? '16px 0 0' : '0 0 16px');
      next = Object.assign({}, ctx, { tl: true });
    } else if (ctx.tl && tag === 'div') {
      st = 'margin:9px 0;unicode-bidi:plaintext';
      next = Object.assign({}, ctx, { tl: false, tlRow: true });
    }

    if (EMAIL_VOID[tag]) return '<' + tag + (st ? ' style="' + st + '"' : '') + '>';
    if (inner == null) inner = children(n, next);
    let keep = '';
    if (tag === 'a' && n.attrs.href) keep = ' href="' + String(n.attrs.href).replace(/"/g, '&quot;') + '"';
    if (n.attrs.colspan) keep += ' colspan="' + n.attrs.colspan + '"';
    if (n.attrs.rowspan) keep += ' rowspan="' + n.attrs.rowspan + '"';
    return '<' + tag + ' dir="' + dir + '"' + keep + (st ? ' style="' + st + '"' : '') + '>' + pre + inner + post + '</' + tag + '>';
  }

  const rootStyle = 'font-family:' + (R ? 'Vazirmatn,Tahoma,sans-serif' : 'Inter,system-ui,-apple-system,sans-serif') +
    ';font-size:11.5px;line-height:1.9;color:' + P.tx +
    ';background:' + P.s1 + ';border:.5px solid ' + P.bd + ';border-radius:14px;padding:19px 22px;text-align:' + S + ';direction:' + DIR;
  return '<div dir="' + DIR + '" style="' + rootStyle + '">' + children(emailParse(html), {}) + '</div>';
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
  require('child_process').execFile('/usr/bin/osascript', ['-e', script], { timeout: 180000 }, (err, out) => {
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
    case 'tools/list':
      respond({ tools: [TOOL, SAVE_TOOL, EMAIL_TOOL, READ_TOOL, COPY_TOOL, BRAND_TOOL] });
      return;
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
        respond({ content: [{ type: 'text', text: renderEmail(a.html, a.theme) }] });
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
        try { process.stderr.write('[readable-card] tools/call card, mcp-apps=' + (clientSupportsUi ? 'YES' : 'NO') + ', htmlFile=' + htmlFile + ', brand=' + (brand || 'none') + '\n'); } catch (e) {}
        const fileNote = clientSupportsUi
          ? 'Card rendered by the host UI from the file. Do not repeat the content as text.'
          : 'Host did not negotiate MCP Apps UI; the card was NOT rendered and the user saw nothing. Read the file and deliver its content another way (plain text, or show_widget with the readable kit), and stop calling this tool in this conversation.';
        respond({ content: [{ type: 'text', text: fileNote }], structuredContent: brand ? { htmlFile: htmlFile, brand } : { htmlFile: htmlFile } });
        return;
      }
      if (typeof html !== 'string' || !html.trim()) return fail(-32602, 'html (string) is required (or htmlFile for a pre-written *-card.html)');
      if (/<\s*(style|script)\b/i.test(html)) return fail(-32602, 'html must not contain <style> or <script>; send content only');
      try { process.stderr.write('[readable-card] tools/call card, mcp-apps=' + (clientSupportsUi ? 'YES' : 'NO') + ', html=' + html.length + 'B, brand=' + (brand || 'none') + '\n'); } catch (e) {}
      const note = clientSupportsUi
        ? 'Card rendered by the host UI. Do not repeat the content as text.'
        : 'Host did not negotiate MCP Apps UI; the card was NOT rendered and the user saw nothing. Repeat the reply now as plain text (if an inline HTML widget tool like show_widget exists, use it with the readable kit instead), and stop calling this tool in this conversation.';
      respond({ content: [{ type: 'text', text: note }], structuredContent: brand ? { html, brand } : { html } });
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

try { process.stderr.write('[readable-card] build 4.13.0 file=' + __filename + '\n'); } catch (e) {}
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
