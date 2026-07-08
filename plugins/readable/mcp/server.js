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

const TEMPLATE_HTML =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>\n' +
  PALETTE + '\n' + KIT_CSS +
  '\n</style></head><body><div class="rc" id="card" dir="rtl"><p style="color:var(--text-secondary)">…</p></div><script>' +
  BRIDGE_JS + '</script></body></html>';

const TOOL = {
  name: 'card',
  description:
    'ALWAYS use this tool to deliver ANY reply written in Persian or another RTL language: plain RTL chat text scrambles in this client, and this tool renders it as a correct, styled RTL card. Call it exactly once per reply, with the ENTIRE reply as the html argument; the call IS the reply, so output no Persian text before or after it. Build the html from these blocks only: <h2> once as title, <p class="lead"> intro, <h3> sections, <p>, <ul>/<ol>, <li class="ok|no">, callouts <div class="cal tip|note|warn|danger"><div>…</div></div>, <table><thead><tbody>, <span class="badge ok|warn|info">, key-values <div class="kv"><div><b>k</b><span>v</span></div>…</div>, KPI cards <div class="grid c3|c2"><div class="kpi"><div class="l">label</div><div class="n">1.2M<span class="trend up">18%</span></div></div></div>, bars <div class="bars"><div class="bar"><span class="l">l</span><span class="t"><i style="width:72%"></i></span><span class="v">72%</span></div></div>, flow <div class="flow"><span class="s">step</span>…</div>, timeline <div class="tl"><div><b>t</b>text</div>…</div>, <code> around every path/URL/code token. NO <style>, NO <script>, NO wrapper div: the template styles everything. Short conversational answers are fine as plain <p> paragraphs inside the card. Not needed for English-only replies.',
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
      csp: { resourceDomains: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'] },
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
