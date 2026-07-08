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
const KIT_CSS = fs.readFileSync(KIT_CANDIDATES.find((p) => fs.existsSync(p)), 'utf8');

/* Host CSS variables do not exist inside the sandboxed MCP Apps iframe,
 * so the template ships its own palette and switches on hostContext.theme. */
const PALETTE = [
  ':root{--text-primary:#1f1f1f;--text-secondary:#6f6f6a;--text-accent:#2f66c4;--surface-1:#fff;--surface-2:#f2f2ef;--border:#dcdcd6;--border-strong:#b8b8b0;--bg-success:#e6f4ec;--bg-accent:#e8effc;--bg-warning:#faf0d9;--bg-danger:#fbe9e7;--font-mono:ui-monospace,Menlo,monospace}',
  'html[data-theme="dark"]{--text-primary:#ececea;--text-secondary:#9f9f98;--text-accent:#82abec;--surface-1:#262624;--surface-2:#302f2c;--border:#3e3e3a;--border-strong:#55554f;--bg-success:#143122;--bg-accent:#16283f;--bg-warning:#382c13;--bg-danger:#3a1d19}',
  'html,body{margin:0;background:transparent}',
].join('\n');

/* JSON-RPC-over-postMessage bridge, per SEP-1865: ui/initialize handshake,
 * then render on ui/notifications/tool-input (arguments.html). sendPrompt()
 * maps CTA buttons onto ui/message so kit buttons keep working. */
const BRIDGE_JS = [
  "(function(){",
  "var nextId=1,pending={};",
  "function send(m){window.parent.postMessage(m,'*')}",
  "function rpc(method,params,cb){var id=nextId++;if(cb)pending[id]=cb;send({jsonrpc:'2.0',id:id,method:method,params:params||{}})}",
  "function notify(method,params){send({jsonrpc:'2.0',method:method,params:params||{}})}",
  "window.sendPrompt=function(t){rpc('ui/message',{role:'user',content:{type:'text',text:String(t)}})};",
  "var rendered=false;",
  "function render(html){if(rendered||!html)return;rendered=true;document.getElementById('card').innerHTML=html;notify('ui/notifications/size-changed',{height:document.documentElement.scrollHeight});}",
  "function applyTheme(ctx){if(ctx&&ctx.theme)document.documentElement.setAttribute('data-theme',ctx.theme==='dark'?'dark':'light')}",
  "window.__rcRpc=rpc;",
  "window.addEventListener('message',function(e){var m=e.data;if(typeof m==='string'){try{m=JSON.parse(m)}catch(err){return}}if(!m||m.jsonrpc!=='2.0')return;",
  "if(m.id!=null&&pending[m.id]){var cb=pending[m.id];delete pending[m.id];cb(m.result,m.error);return}",
  "if(m.method==='ui/notifications/tool-input'&&m.params&&m.params.arguments){render(m.params.arguments.html)}",
  "else if(m.method==='ui/notifications/tool-result'&&m.params&&m.params.structuredContent){render(m.params.structuredContent.html)}",
  "else if(m.method&&m.method.indexOf('host-context-changed')!==-1&&m.params){applyTheme(m.params.hostContext||m.params)}",
  "else if(m.id!=null&&m.method){send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'not supported'}})}",
  "});",
  "rpc('ui/initialize',{protocolVersion:'" + PROTOCOL_FALLBACK + "',appCapabilities:{availableDisplayModes:['inline']}},function(res){if(res){applyTheme(res.hostContext)}notify('ui/notifications/initialized',{});});",
  "new ResizeObserver(function(){notify('ui/notifications/size-changed',{height:document.documentElement.scrollHeight})}).observe(document.body);",
  "})();",
].join('');

/* Card menu (copy image / save HTML), replacing the affordances the
 * show_widget host chrome used to provide. Lives entirely in the template:
 * zero output tokens per reply. PNG export is hand-rolled (no html2canvas):
 * card HTML + collected CSS go into an SVG foreignObject, fonts are
 * best-effort inlined as data: URIs, then canvas -> blob -> clipboard.
 * HTML export uses the spec's ui/download-file first, <a download> second,
 * clipboard text last. */
/* Menu design mirrors the host's code-block popover: dark rounded panel,
 * stroke icons + labels, roomy rows. Labels stay English (LTR panel). */
const MENU_CSS = [
  '#rcmenu{position:fixed;top:8px;right:8px;z-index:9;font-family:system-ui,sans-serif;direction:ltr}',
  '#rcmenu .dots{width:30px;height:30px;border-radius:8px;border:.5px solid var(--border);background:var(--surface-2);color:var(--text-secondary);cursor:pointer;font-size:16px;line-height:1;opacity:.4;padding:0}',
  '#rcmenu:hover .dots,#rcmenu.open .dots{opacity:1}',
  '#rcmenu .items{display:none;position:absolute;right:0;top:34px;background:var(--surface-1);border:.5px solid var(--border-strong);border-radius:12px;padding:6px;min-width:208px;box-shadow:0 8px 24px rgba(0,0,0,.28)}',
  '#rcmenu.open .items{display:block}',
  '#rcmenu .items button{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:none;border:none;padding:10px 13px;border-radius:8px;font-size:14px;font-family:inherit;color:var(--text-primary);cursor:pointer;white-space:nowrap}',
  '#rcmenu .items button:hover{background:var(--surface-2)}',
  '#rcmenu .items svg{width:17px;height:17px;flex:0 0 auto;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.75}',
  '#rctoast{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);background:var(--text-primary);color:var(--surface-1);font-size:12px;font-family:system-ui,sans-serif;padding:5px 12px;border-radius:14px;opacity:0;transition:opacity .2s;pointer-events:none}',
].join('\n');

const I = {
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  code: '<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  filetext: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  type: '<svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};

const MENU_HTML =
  '<div id="rcmenu"><button class="dots" title="card menu">⋯</button><div class="items">' +
  '<button data-act="copyimg">' + I.image + 'Copy image</button>' +
  '<button data-act="copyhtml">' + I.code + 'Copy HTML</button>' +
  '<button data-act="copymd">' + I.filetext + 'Copy Markdown</button>' +
  '<button data-act="copytext">' + I.type + 'Copy text</button>' +
  '<button data-act="pngdl">' + I.download + 'Download PNG</button>' +
  '<button data-act="savehtml">' + I.download + 'Save HTML</button>' +
  '</div></div><div id="rctoast"></div>';

const MENU_JS = [
  "(function(){",
  "var VARS=['--text-primary','--text-secondary','--text-accent','--surface-1','--surface-2','--border','--border-strong','--bg-success','--bg-accent','--bg-warning','--bg-danger','--font-mono','--page-bg'];",
  "var menu=document.getElementById('rcmenu');",
  "menu.querySelector('.dots').addEventListener('click',function(e){e.stopPropagation();menu.classList.toggle('open')});",
  "document.addEventListener('click',function(){menu.classList.remove('open')});",
  "function toast(t){var el=document.getElementById('rctoast');el.textContent=t;el.style.opacity='1';setTimeout(function(){el.style.opacity='0'},2200)}",
  "function theme(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light'}",
  "function collectCss(){var out='',els=document.querySelectorAll('style');for(var i=0;i<els.length;i++)out+=els[i].textContent+'\\n';return out}",
  "function varCss(cls){var cs=getComputedStyle(document.documentElement),out='.'+cls+'{';for(var i=0;i<VARS.length;i++){var v=cs.getPropertyValue(VARS[i]);if(v)out+=VARS[i]+':'+v.trim()+';'}return out+'}'}",
  "function exportHtml(){var card=document.getElementById('card');return '<!DOCTYPE html>\\n<html data-theme=\"'+theme()+'\"><head><meta charset=\"utf-8\"><title>readable card</title><style>\\n'+collectCss()+'\\n#rcmenu,#rctoast{display:none}\\n</style></head><body style=\"margin:16px\">'+card.outerHTML+'</body></html>'}",
  "function inlineFonts(){var css=collectCss(),m=css.match(/@import url\\('([^']+)'\\)/);if(!m)return Promise.resolve('');",
  "return fetch(m[1]).then(function(r){return r.text()}).then(function(fc){var urls=[],re=/url\\((https:[^)]+)\\)/g,x;while((x=re.exec(fc))&&urls.length<8)if(urls.indexOf(x[1])<0)urls.push(x[1]);",
  "return Promise.all(urls.map(function(u){return fetch(u).then(function(r){return r.arrayBuffer()}).then(function(b){var bin='',a=new Uint8Array(b);for(var i=0;i<a.length;i++)bin+=String.fromCharCode(a[i]);return[u,'data:font/woff2;base64,'+btoa(bin)]}).catch(function(){return[u,u]})})).then(function(pairs){for(var i=0;i<pairs.length;i++)fc=fc.split(pairs[i][0]).join(pairs[i][1]);return fc})}).catch(function(){return''})}",
  "function cardToPng(cb){var card=document.getElementById('card');var r=card.getBoundingClientRect(),w=Math.ceil(r.width),h=Math.ceil(r.height);",
  "inlineFonts().then(function(fontCss){var css=collectCss().replace(/@import[^;]+;/g,'')+fontCss+varCss('rcexport');",
  "var xhtml=new XMLSerializer().serializeToString(card);",
  "var svg='<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"'+w+'\" height=\"'+h+'\"><foreignObject width=\"100%\" height=\"100%\"><div xmlns=\"http://www.w3.org/1999/xhtml\" class=\"rcexport\"><style>'+css.replace(/]]>/g,'')+'</style>'+xhtml+'</div></foreignObject></svg>';",
  "var img=new Image();img.onload=function(){try{var c=document.createElement('canvas'),s=2;c.width=w*s;c.height=h*s;var x=c.getContext('2d');x.scale(s,s);x.drawImage(img,0,0);c.toBlob(function(b){cb(b)},'image/png')}catch(e){cb(null)}};img.onerror=function(){cb(null)};",
  "img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)})}",
  "function dl(blob,name){var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},1500)}",
  "function inlineMd(el){var out='';el.childNodes.forEach(function(n){if(n.nodeType===3){out+=n.textContent;return}if(n.nodeType!==1)return;var t=n.tagName;",
  "if(t==='CODE')out+='`'+n.textContent+'`';else if(t==='STRONG'||t==='B')out+='**'+inlineMd(n)+'**';else if(t==='A')out+='['+inlineMd(n)+']('+(n.getAttribute('href')||'')+')';else if(t==='BR')out+='\\n';else out+=inlineMd(n)});return out.replace(/[ \\t]+/g,' ')}",
  "function rowMd(tr,tag){var cells=[];tr.querySelectorAll(tag).forEach(function(c){cells.push(inlineMd(c).trim()||' ')});return '| '+cells.join(' | ')+' |'}",
  "function toMd(){var card=document.getElementById('card'),L=[];",
  "card.childNodes.forEach(function(n){if(n.nodeType!==1)return;var t=n.tagName,c=n.className||'';",
  "if(t==='H2')L.push('# '+inlineMd(n).trim());",
  "else if(t==='H3')L.push('## '+inlineMd(n).trim());",
  "else if(t==='H4')L.push('### '+inlineMd(n).trim());",
  "else if(t==='P')L.push(inlineMd(n).trim());",
  "else if(t==='HR')L.push('---');",
  "else if(t==='PRE')L.push('```\\n'+n.textContent.replace(/\\n$/,'')+'\\n```');",
  "else if(t==='UL'||t==='OL'){var i=0;n.querySelectorAll(':scope>li').forEach(function(li){i++;var p=t==='OL'?i+'. ':'- ';var cc=li.className||'';if(cc.indexOf('ok')>-1)p+='\\u2713 ';else if(cc.indexOf('no')>-1)p+='\\u2715 ';L.push(p+inlineMd(li).trim())})}",
  "else if(t==='TABLE'){var h=n.querySelector('thead tr');if(h){L.push(rowMd(h,'th'));L.push('|'+' --- |'.repeat(h.querySelectorAll('th').length))}n.querySelectorAll('tbody tr').forEach(function(tr){L.push(rowMd(tr,'td'))})}",
  "else if(c.indexOf('cal')>-1){var kind=(c.match(/tip|note|warn|danger/)||[''])[0];L.push('> '+(kind?'['+kind.toUpperCase()+'] ':'')+inlineMd(n).trim())}",
  "else if(c.indexOf('kv')>-1){n.querySelectorAll(':scope>div').forEach(function(d){var k=d.querySelector('b'),v=d.querySelector('span');L.push('- **'+(k?inlineMd(k).trim():'')+':** '+(v?inlineMd(v).trim():''))})}",
  "else if(c.indexOf('grid')>-1){n.querySelectorAll('.kpi').forEach(function(k){var l=k.querySelector('.l'),v=k.querySelector('.n'),tr=k.querySelector('.trend');var val=v?v.childNodes[0]?v.childNodes[0].textContent.trim():'':'';L.push('- **'+(l?l.textContent.trim():'')+':** '+val+(tr?' ('+tr.textContent.trim()+')':''))})}",
  "else if(c.indexOf('bars')>-1){n.querySelectorAll('.bar').forEach(function(b){var l=b.querySelector('.l'),v=b.querySelector('.v');L.push('- '+(l?l.textContent.trim():'')+': '+(v?v.textContent.trim():''))})}",
  "else if(c.indexOf('donut')>-1){n.querySelectorAll('.leg>span').forEach(function(s){L.push('- '+s.textContent.trim())})}",
  "else if(c.indexOf('flow')>-1){var steps=[];n.querySelectorAll('.s').forEach(function(s){steps.push(s.textContent.trim())});L.push(steps.join(' \\u2192 '))}",
  "else if(c.indexOf('tl')>-1){n.querySelectorAll(':scope>div').forEach(function(d){var b=d.querySelector('b'),rest=d.textContent.replace(b?b.textContent:'','').trim();L.push('- **'+(b?b.textContent.trim():'')+':** '+rest)})}",
  "else if(c.indexOf('btns')>-1){}",
  "else{var tx=inlineMd(n).trim();if(tx)L.push(tx)}});",
  "function lkind(l){return l.charAt(0)==='|'?'t':(/^(- |\\d+\\. )/.test(l)?'l':(l.charAt(0)==='>'?'q':'b'))}",
  "var out='';for(var q=0;q<L.length;q++){if(q>0){var pa=lkind(L[q-1]),cu=lkind(L[q]);out+=(pa===cu&&pa!=='b')?'\\n':'\\n\\n'}out+=L[q]}return out}",
  "function act(kind){menu.classList.remove('open');",
  "if(kind==='copyimg'||kind==='pngdl'){toast('rendering\\u2026');cardToPng(function(b){if(!b){toast('image export failed');return}",
  "if(kind==='pngdl'){dl(b,'readable-card.png');toast('downloading');return}",
  "if(navigator.clipboard&&window.ClipboardItem){navigator.clipboard.write([new ClipboardItem({'image/png':b})]).then(function(){toast('image copied')},function(){dl(b,'readable-card.png');toast('clipboard blocked, downloaded instead')})}else{dl(b,'readable-card.png');toast('downloaded')}});return}",
  "if(kind==='copymd'){navigator.clipboard.writeText(toMd()).then(function(){toast('Markdown copied')},function(){toast('clipboard blocked')});return}",
  "if(kind==='copytext'){navigator.clipboard.writeText(document.getElementById('card').innerText).then(function(){toast('text copied')},function(){toast('clipboard blocked')});return}",
  "var html=exportHtml();",
  "if(kind==='copyhtml'){navigator.clipboard.writeText(html).then(function(){toast('HTML copied')},function(){toast('clipboard blocked')});return}",
  "if(kind==='savehtml'){if(window.__rcRpc){window.__rcRpc('ui/download-file',{contents:[{type:'resource',resource:{uri:'file:///readable-card.html',mimeType:'text/html',text:html}}]},function(res,err){if(err){dl(new Blob([html],{type:'text/html'}),'readable-card.html');toast('saved via download')}else{toast('saved')}})}else{dl(new Blob([html],{type:'text/html'}),'readable-card.html');toast('downloaded')}}}",
  "menu.querySelector('.items').addEventListener('click',function(e){var b=e.target.closest('button');if(b)act(b.getAttribute('data-act'))});",
  "window.__rcExport={md:toMd,html:exportHtml};",
  "})();",
].join('');

const TEMPLATE_HTML =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>\n' +
  PALETTE + '\n' + KIT_CSS + '\n' + MENU_CSS +
  '\n</style></head><body><div class="rc" id="card" dir="rtl"><p style="color:var(--text-secondary)">…</p></div>' +
  MENU_HTML + '<script>' + BRIDGE_JS + MENU_JS + '</script></body></html>';

const TOOL = {
  name: 'card',
  description:
    'ALWAYS use this tool to deliver ANY reply written in Persian or another RTL language (plain RTL chat text scrambles; this renders it as a correct styled card), and PREFER it for English conversational, explanatory, or structured answers too. Skip it only for replies dominated by code blocks, diffs, or logs. Call it exactly once per reply, with the ENTIRE reply as the html argument; the call IS the reply, so output no reply text before or after it. Build the html from these blocks only: <h2> once as title, <p class="lead"> intro, <h3> sections, <p>, <ul>/<ol>, <li class="ok|no">, callouts <div class="cal tip|note|warn|danger"><div>…</div></div>, <table><thead><tbody>, <span class="badge ok|warn|info">, key-values <div class="kv"><div><b>k</b><span>v</span></div>…</div>, KPI cards <div class="grid c3|c2"><div class="kpi"><div class="l">label</div><div class="n">1.2M<span class="trend up">18%</span></div></div></div>, bars <div class="bars"><div class="bar"><span class="l">l</span><span class="t"><i style="width:72%"></i></span><span class="v">72%</span></div></div>, flow <div class="flow"><span class="s">step</span>…</div>, timeline <div class="tl"><div><b>t</b>text</div>…</div>, <code> around every inline path/URL/code token, <pre><code>…</code></pre> for multiline code (renders LTR), optional CTA buttons <div class="btns"><button class="cta" onclick="sendPrompt(\'…\')">label</button></div>. NO <style>, NO <script>, NO wrapper div: the template styles everything, light and dark. Short answers are fine as plain <p> paragraphs inside the card.',
  inputSchema: {
    type: 'object',
    properties: {
      html: {
        type: 'string',
        description: 'The full reply content as building-block HTML (no <style>, no wrapper).',
      },
    },
    required: ['html'],
  },
  _meta: { ui: { resourceUri: CARD_URI, visibility: ['model', 'app'] } },
};

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

function handle(msg) {
  const { id, method, params } = msg;
  const respond = (result) => write({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize': {
      const ext = params && params.capabilities && params.capabilities.extensions;
      const ui = ext && ext[UI_EXT];
      clientSupportsUi = Boolean(ui && Array.isArray(ui.mimeTypes) && ui.mimeTypes.indexOf(UI_MIME) !== -1);
      try {
        const ci = (params && params.clientInfo) || {};
        process.stderr.write('[readable-card] client=' + (ci.name || '?') + '/' + (ci.version || '?') +
          ' mcp-apps=' + (clientSupportsUi ? 'YES' : 'NO') +
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
      respond({ tools: [TOOL] });
      return;
    case 'tools/call': {
      if (!params || params.name !== 'card') return fail(-32602, 'unknown tool');
      const html = params.arguments && params.arguments.html;
      if (typeof html !== 'string' || !html.trim()) return fail(-32602, 'html (string) is required');
      if (/<\s*(style|script)\b/i.test(html)) return fail(-32602, 'html must not contain <style> or <script>; send content only');
      try { process.stderr.write('[readable-card] tools/call card, mcp-apps=' + (clientSupportsUi ? 'YES' : 'NO') + ', html=' + html.length + 'B\n'); } catch (e) {}
      const note = clientSupportsUi
        ? 'Card rendered by the host UI. Do not repeat the content as text.'
        : 'Host did not negotiate MCP Apps UI; the card was NOT rendered and the user saw nothing. Repeat the reply now as plain text (if an inline HTML widget tool like show_widget exists, use it with the readable kit instead), and stop calling this tool in this conversation.';
      respond({ content: [{ type: 'text', text: note }], structuredContent: { html } });
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
    default:
      if (id != null) fail(-32601, 'method not found: ' + method);
    // notifications (initialized, cancelled, …) are ignored by design
  }
}

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

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
