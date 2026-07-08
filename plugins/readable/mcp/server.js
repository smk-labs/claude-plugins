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
const KIT_CSS = fs.readFileSync(KIT_CANDIDATES.find((p) => fs.existsSync(p)), 'utf8');

/* Host CSS variables do not exist inside the sandboxed MCP Apps iframe,
 * so the template ships its own palette and switches on hostContext.theme. */
const PALETTE = [
  ':root{--ca:#0f9d58;--cb:#3f8ac9;--cc:#e0a52e;--cd:#d96666;--text-primary:#1f1f1f;--text-secondary:#6f6f6a;--text-accent:#2f66c4;--surface-1:#fff;--surface-2:#f2f2ef;--border:#dcdcd6;--border-strong:#b8b8b0;--bg-success:#e6f4ec;--bg-accent:#e8effc;--bg-warning:#faf0d9;--bg-danger:#fbe9e7;--font-mono:ui-monospace,Menlo,monospace}',
  'html[data-theme="dark"]{--text-primary:#ececea;--text-secondary:#9f9f98;--text-accent:#82abec;--surface-1:#262624;--surface-2:#302f2c;--border:#3e3e3a;--border-strong:#55554f;--bg-success:#143122;--bg-accent:#16283f;--bg-warning:#382c13;--bg-danger:#3a1d19}',
  'html,body{margin:0;background:transparent}',
].join('\n');

/* JSON-RPC-over-postMessage bridge, per SEP-1865: ui/initialize handshake,
 * then render on ui/notifications/tool-input (arguments.html). sendPrompt()
 * maps CTA buttons onto ui/message so kit buttons keep working. */
const BRIDGE_JS = [
  "(function(){",
  "var nextId=1,pending={},LOG=[];window.__rcLog=LOG;",
  "function tap(d,m){try{LOG.push(Date.now()%1000000+d+(m.method||('#'+m.id))+(('result' in (m||{}))?'+r':'')+(m&&m.error?'+e':''));if(LOG.length>80)LOG.shift()}catch(e){}}",
  "function send(m){tap('>',m);window.parent.postMessage(m,'*')}",
  "function rpc(method,params,cb){var id=nextId++;if(cb)pending[id]=cb;send({jsonrpc:'2.0',id:id,method:method,params:params||{}})}",
  "function notify(method,params){send({jsonrpc:'2.0',method:method,params:params||{}})}",
  "/* ui/message param shape differs across host snapshots: try the content-array form, then the single-object form; if both are rejected, copy the prompt text so the user can paste it, and keep the errors for the alt-click diagnostics dump. */",
  "window.sendPrompt=function(t){var text=String(t);var shapes=[{role:'user',content:[{type:'text',text:text}]},{role:'user',content:{type:'text',text:text}}];var errs=[];",
  "(function tryNext(i){if(i>=shapes.length){window.__rcErrs=(window.__rcErrs||[]).concat(errs);",
  "if(window.__rcCopy){window.__rcCopy(text,function(ok){if(window.__rcToast)window.__rcToast(ok?'host refused ui/message ('+errs[errs.length-1]+') - message copied, paste it in the chat box':'ui/message rejected: '+errs[errs.length-1])})}else if(window.__rcToast)window.__rcToast('ui/message rejected: '+errs[errs.length-1]);return}",
  "rpc('ui/message',shapes[i],function(res,err){if(err){errs.push(String(err.code||'')+' '+String(err.message||'').slice(0,80));tryNext(i+1)}})})(0)};",
  "/* Host CSP in MCP Apps iframes blocks inline onclick attributes (unlike the old widget host), so CTA clicks are re-dispatched by delegation; blocked attributes leave .onclick null, which doubles as the no-double-fire guard. */",
  "document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('#card [onclick]');if(!b||b.onclick)return;var m=String(b.getAttribute('onclick')).match(/^\\s*sendPrompt\\((['\"])([\\s\\S]*?)\\1\\)\\s*;?\\s*$/);if(m)window.sendPrompt(m[2])});",
  "var rendered=false;",
  "function render(html){if(rendered||!html)return;rendered=true;document.getElementById('card').innerHTML=html;notify('ui/notifications/size-changed',{height:document.documentElement.scrollHeight});}",
  "window.__rcGotInput=false;",
  "/* If the lifecycle stalls (no tool input within 5s), dump the message log to disk through save_card so the failure is diagnosable without reaching into the iframe. */",
  "setTimeout(function(){if(window.__rcGotInput)return;try{rpc('tools/call',{name:'save_card',arguments:{filename:'rc-diagnostics.json',content:JSON.stringify({build:'4.3.5',log:LOG,host:window.__rcHost||null,rendered:rendered,vis:document.visibilityState},null,1),encoding:'utf8'}},function(){})}catch(e){}},5000);",
  "function applyTheme(ctx){if(ctx&&ctx.theme)document.documentElement.setAttribute('data-theme',ctx.theme==='dark'?'dark':'light')}",
  "window.__rcRpc=rpc;",
  "window.addEventListener('message',function(e){var m=e.data;if(typeof m==='string'){try{m=JSON.parse(m)}catch(err){return}}if(!m||m.jsonrpc!=='2.0')return;tap('<',m);",
  "/* A response is a message carrying result or error for a pending id. Do NOT discriminate on the absence of 'method': at least one real host echoes the method field in its responses, and treating those as requests silently kills the ui/initialize handshake, which keeps the iframe visibility:hidden forever (anthropics/claude-ai-mcp#61). */",
  "if(m.id!=null&&pending[m.id]&&(('result' in m)||('error' in m))){var cb=pending[m.id];delete pending[m.id];cb(m.result,m.error);return}",
  "if(m.method==='ui/notifications/tool-input'&&m.params&&m.params.arguments){window.__rcGotInput=true;render(m.params.arguments.html)}",
  "else if(m.method==='ui/notifications/tool-result'&&m.params&&m.params.structuredContent){render(m.params.structuredContent.html)}",
  "else if(m.method&&m.method.indexOf('host-context-changed')!==-1&&m.params){applyTheme(m.params.hostContext||m.params)}",
  "else if(m.id!=null&&m.method){send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'not supported'}})}",
  "});",
  "rpc('ui/initialize',{protocolVersion:'" + PROTOCOL_FALLBACK + "',appCapabilities:{availableDisplayModes:['inline']}},function(res){if(res){window.__rcHost=res;applyTheme(res.hostContext)}notify('ui/notifications/initialized',{});});",
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
  '#rcmenu .items{display:none;position:absolute;right:0;top:34px;background:var(--surface-1);border:.5px solid var(--border-strong);border-radius:12px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.28)}',
  '#rcmenu.open .items{display:block}',
  '#rcmenu .row{display:flex;align-items:center;border-radius:8px;padding:2px 4px}',
  '#rcmenu .row:hover{background:var(--surface-2)}',
  '#rcmenu .fmt{flex:1;display:flex;align-items:center;gap:11px;font-size:14px;color:var(--text-primary);white-space:nowrap;padding:7px 4px 7px 2px;min-width:132px}',
  '#rcmenu .fmt svg{width:17px;height:17px;flex:0 0 auto;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.75}',
  '#rcmenu .act{width:30px;height:30px;margin:0 2px;border-radius:7px;border:none;background:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
  '#rcmenu .act:hover{background:var(--surface-1);color:var(--text-primary);box-shadow:inset 0 0 0 .5px var(--border-strong)}',
  '#rcmenu .act .ic{display:inline-flex;align-items:center;justify-content:center}',
  '#rcmenu .act svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
  '#rcmenu .act.ok{color:var(--ca)}#rcmenu .act.err{color:#e05555}',
  '.rcspin{width:12px;height:12px;border:2px solid var(--border-strong);border-top-color:var(--text-accent);border-radius:50%;animation:rcspin .7s linear infinite;display:inline-block}',
  '@keyframes rcspin{to{transform:rotate(360deg)}}',
  '#rctoast{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);max-width:92%;background:var(--text-primary);color:var(--surface-1);font-size:12px;font-family:system-ui,sans-serif;padding:5px 12px;border-radius:14px;opacity:0;transition:opacity .2s;pointer-events:none;direction:ltr;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
].join('\n');

const I = {
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  code: '<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  filetext: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  type: '<svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};

/* One row per FORMAT with identical naming; two action columns (Copy,
 * Download) so every format is exportable both ways, symmetrically. */
function menuRow(icon, label, copyAct, dlAct) {
  return '<div class="row"><span class="fmt">' + icon + label + '</span>' +
    '<button class="act" data-act="' + copyAct + '" title="Copy ' + label + '"><span class="ic">' + I.copy + '</span></button>' +
    '<button class="act" data-act="' + dlAct + '" title="Download ' + label + '"><span class="ic">' + I.download + '</span></button></div>';
}

const MENU_HTML =
  '<div id="rcmenu"><button class="dots" title="card menu">⋯</button><div class="items">' +
  menuRow(I.image, 'Image', 'copyimg', 'dlpng') +
  menuRow(I.code, 'HTML', 'copyhtml', 'dlhtml') +
  menuRow(I.filetext, 'Markdown', 'copymd', 'dlmd') +
  menuRow(I.type, 'Text', 'copytext', 'dltxt') +
  menuRow(I.mail, 'Email', 'copyemail', 'dlemail') +
  '</div></div><div id="rctoast"></div>';

const MENU_JS = [
  "(function(){",
  "var VARS=['--text-primary','--text-secondary','--text-accent','--surface-1','--surface-2','--border','--border-strong','--bg-success','--bg-accent','--bg-warning','--bg-danger','--font-mono','--page-bg'];",
  "var ICON_OK='<svg viewBox=\"0 0 24 24\" style=\"stroke-width:2.5\"><polyline points=\"20 6 9 17 4 12\"/></svg>';",
  "var ICON_ERR='<svg viewBox=\"0 0 24 24\" style=\"stroke-width:2.5\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg>';",
  "var menu=document.getElementById('rcmenu');",
  "menu.querySelector('.dots').addEventListener('click',function(e){e.stopPropagation();if(e.altKey){clipText(JSON.stringify({host:window.__rcHost||null,errors:window.__rcErrs||[]},null,1),function(ok){toast(ok?'diagnostics copied':'diagnostics copy failed')});return}menu.classList.toggle('open')});",
  "document.addEventListener('click',function(e){if(!menu.contains(e.target))menu.classList.remove('open')});",
  "function toast(t){var el=document.getElementById('rctoast');el.textContent=t;el.style.opacity='1';clearTimeout(el._t);el._t=setTimeout(function(){el.style.opacity='0'},3400)}",
  "window.__rcToast=toast;",
  "function theme(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light'}",
  "function collectCss(){var out='',els=document.querySelectorAll('style');for(var i=0;i<els.length;i++)out+=els[i].textContent+'\\n';return out}",
  "function varCss(cls){var cs=getComputedStyle(document.documentElement),out='.'+cls+'{';for(var i=0;i<VARS.length;i++){var v=cs.getPropertyValue(VARS[i]);if(v)out+=VARS[i]+':'+v.trim()+';'}return out+'}'}",
  "function exportHtml(){var card=document.getElementById('card');return '<!DOCTYPE html>\\n<html data-theme=\"'+theme()+'\"><head><meta charset=\"utf-8\"><title>readable card</title><style>\\n'+collectCss()+'\\n#rcmenu,#rctoast{display:none}\\n</style></head><body style=\"margin:16px\">'+card.outerHTML+'</body></html>'}",
  "/* Email export: clients strip <style> and classes, so every element gets its computed styles inlined (resolved against the LIGHT palette), pseudo-element decorations become real spans, and interactive bits are dropped. Pasteable into Gmail/Mail as rendered rich text. */",
  "var EMAIL_PROPS=['color','background-color','font-family','font-size','font-weight','font-style','line-height','text-align','direction','unicode-bidi','padding-top','padding-bottom','padding-left','padding-right','margin-top','margin-bottom','margin-left','margin-right','border-radius','border-top','border-bottom','border-left','border-right','vertical-align','white-space','letter-spacing','border-collapse'];",
  "function emailHtml(){var root=document.documentElement,prev=root.getAttribute('data-theme');root.setAttribute('data-theme','light');",
  "try{var card=document.getElementById('card');",
  "var srcEls=[card].concat([].slice.call(card.querySelectorAll('*')));",
  "var clone=card.cloneNode(true);",
  "var dstEls=[clone].concat([].slice.call(clone.querySelectorAll('*')));",
  "var rtl=(getComputedStyle(card).direction==='rtl');var accent=getComputedStyle(card).getPropertyValue('--text-accent').trim()||'#2f66c4';",
  "var jobs=[];",
  "for(var i=0;i<srcEls.length;i++){var s=srcEls[i],d=dstEls[i],cs=getComputedStyle(s),st='';",
  "for(var q=0;q<EMAIL_PROPS.length;q++){var v=cs.getPropertyValue(EMAIL_PROPS[q]);if(v&&v!=='none'&&v!=='normal'&&v!=='auto'&&v.indexOf('0px none')===-1)st+=EMAIL_PROPS[q]+':'+v+';'}",
  "var disp=cs.getPropertyValue('display');if(disp&&disp!=='inline'&&disp!=='block')st+='display:'+((disp.indexOf('flex')>-1||disp.indexOf('grid')>-1)?'block':disp)+';';",
  "if(s.style&&s.style.width&&s.style.width.indexOf('%')>-1)st+='width:'+s.style.width+';background:'+cs.getPropertyValue('background-color')+';display:block;';",
  "var cls=s.className||'';var tag=s.tagName;",
  "if(/(^| )t( |$)/.test(cls)&&s.parentNode&&/(^| )bar( |$)/.test(s.parentNode.className||''))st+='width:220px;height:7px;display:inline-block;';",
  "if(s.style&&s.style.width&&s.style.width.indexOf('%')>-1)st+='height:7px;';",
  "d.setAttribute('style',st);d.removeAttribute('class');d.removeAttribute('onclick');d.removeAttribute('id');",
  "var dr=cs.getPropertyValue('direction');if(dr)d.setAttribute('dir',dr);",
  "if(tag==='H2')jobs.push(['h2',d]);else if(tag==='H3')jobs.push(['h3',d]);",
  "else if(tag==='LI'){if(/(^| )ok( |$)/.test(cls))jobs.push(['ok',d]);else if(/(^| )no( |$)/.test(cls))jobs.push(['no',d]);else if(s.parentNode.tagName==='UL')jobs.push(['dot',d])}",
  "else if(/(^| )trend( |$)/.test(cls))jobs.push([/(^| )up( |$)/.test(cls)?'up':'dn',d]);",
  "else if(/(^| )flow( |$)/.test(cls))jobs.push(['flow',d]);",
  "else if(/(^| )donut( |$)/.test(cls))jobs.push(['kill',d]);",
  "else if(/(^| )btns( |$)/.test(cls))jobs.push(['kill',d]);",
  "else if(tag==='I'&&/(^| )leg( |$)/.test(s.parentNode.parentNode?s.parentNode.parentNode.className||'':''))jobs.push(['sw',d,cs.getPropertyValue('background-color')]);",
  "}",
  "function mk(html){var t=document.createElement('span');t.innerHTML=html;return t.firstChild}",
  "for(var j=0;j<jobs.length;j++){var kind=jobs[j][0],el=jobs[j][1];",
  "if(kind==='kill'){el.parentNode&&el.parentNode.removeChild(el)}",
  "else if(kind==='h2'){el.appendChild(mk('<div style=\"width:28px;height:3px;background:'+accent+';border-radius:2px;margin-top:6px\"></div>'))}",
  "else if(kind==='h3'){el.insertBefore(mk('<span style=\"display:inline-block;width:7px;height:7px;background:'+accent+';border-radius:2px;margin-'+(rtl?'left':'right')+':8px\"></span>'),el.firstChild)}",
  "else if(kind==='ok'){el.insertBefore(mk('<span style=\"color:#0f9d58;font-weight:800\">\u2713&nbsp;</span>'),el.firstChild);el.style.listStyle='none'}",
  "else if(kind==='no'){el.insertBefore(mk('<span style=\"color:#e05555;font-weight:800\">\u2715&nbsp;</span>'),el.firstChild);el.style.listStyle='none'}",
  "else if(kind==='dot'){el.insertBefore(mk('<span style=\"color:'+accent+'\">\u2022&nbsp;</span>'),el.firstChild);el.style.listStyle='none'}",
  "else if(kind==='up'){el.insertBefore(document.createTextNode('\u25b2 '),el.firstChild)}",
  "else if(kind==='dn'){el.insertBefore(document.createTextNode('\u25bc '),el.firstChild)}",
  "else if(kind==='sw'){el.setAttribute('style',(el.getAttribute('style')||'')+'display:inline-block;width:9px;height:9px;border-radius:3px;background:'+jobs[j][2])}",
  "else if(kind==='flow'){var kids=[].slice.call(el.children);for(var k=1;k<kids.length;k++){el.insertBefore(mk('<span style=\"color:'+accent+';padding:0 6px\">'+(rtl?'\u2190':'\u2192')+'</span>'),kids[k])}}",
  "}",
  "return clone.outerHTML}finally{if(prev)root.setAttribute('data-theme',prev);else root.removeAttribute('data-theme')}}",
  "function richCopy(html,plain,cb){",
  "if(navigator.clipboard&&window.ClipboardItem){try{navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]).then(function(){cb(true)},function(){cb(legacy())});return}catch(e){}}",
  "cb(legacy());",
  "function legacy(){try{var d=document.createElement('div');d.contentEditable='true';d.style.position='fixed';d.style.opacity='0';d.style.left='-9999px';d.innerHTML=html;document.body.appendChild(d);var r=document.createRange();r.selectNodeContents(d);var sel=getSelection();sel.removeAllRanges();sel.addRange(r);var ok=document.execCommand('copy');sel.removeAllRanges();d.remove();return ok}catch(e){return false}}}",
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
  "var ORIG={};",
  "function setState(btn,st,lb){var act=btn.getAttribute('data-act');var ic=btn.querySelector('.ic'),lbl=btn.querySelector('.lb');if(!ORIG[act])ORIG[act]=[ic.innerHTML,lbl?lbl.textContent:''];",
  "btn.classList.remove('busy','ok','err');clearTimeout(btn._t);",
  "if(st==='idle'){ic.innerHTML=ORIG[act][0];if(lbl)lbl.textContent=ORIG[act][1];return}",
  "btn.classList.add(st);",
  "if(st==='busy'){ic.innerHTML='<span class=\"rcspin\"></span>'}else{ic.innerHTML=st==='ok'?ICON_OK:ICON_ERR}",
  "if(lb){if(lbl)lbl.textContent=lb;else if(st==='err')toast(lb)}",
  "if(st!=='busy')btn._t=setTimeout(function(){setState(btn,'idle')},2600)}",
  "function clipText(t,cb){function legacy(){try{var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();var ok=document.execCommand('copy');ta.remove();return ok}catch(e){return false}}",
  "if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){cb(true)},function(){cb(legacy())})}else cb(legacy())}",
  "function b64(blob,cb){var r=new FileReader();r.onload=function(){cb(String(r.result).split(',')[1]||'')};r.onerror=function(){cb(null)};r.readAsDataURL(blob)}",
  "function saveFile(name,text,blob,btn,verb){",
  "function finish(ok,lb,info){setState(btn,ok?'ok':'err',lb);if(info)toast(info)}",
  "function viaAnchor(){try{var u=URL.createObjectURL(blob||new Blob([text],{type:'text/plain;charset=utf-8'}));var a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},1500);finish(true,'Downloaded','Browser download: '+name)}catch(e){finish(false,'Failed','download blocked: '+e.message)}}",
  "function viaDownloadFile(payload){if(!window.__rcRpc){viaAnchor();return}window.__rcRpc('ui/download-file',{contents:[payload]},function(res,err){if(err)viaAnchor();else finish(true,'Saved','Sent to host downloads')})}",
  "function hostPayload(bb){var rsc={uri:'file:///'+name,mimeType:blob?'image/png':(name.slice(-3)==='.md'?'text/markdown':(name.slice(-5)==='.html'?'text/html':'text/plain'))};if(bb)rsc.blob=bb;else rsc.text=text;return {type:'resource',resource:rsc}}",
  "function go(content,enc,bb){if(!window.__rcRpc){viaAnchor();return}window.__rcRpc('tools/call',{name:'save_card',arguments:{filename:name,content:content,encoding:enc}},function(res,err){",
  "if(!err&&res&&!res.isError&&res.content&&res.content[0]&&res.content[0].text&&res.content[0].text.charAt(0)==='/'){finish(true,verb,'Saved: '+res.content[0].text);return}",
  "viaDownloadFile(hostPayload(bb))})}",
  "if(blob)b64(blob,function(bb){if(bb==null){finish(false,'Failed','encode failed');return}go(bb,'base64',bb)});else go(text,'utf8',null)}",
  "function inlineFonts(){var css=collectCss(),m=css.match(/@import url\\('([^']+)'\\)/);if(!m)return Promise.resolve('');",
  "return fetch(m[1]).then(function(r){return r.text()}).then(function(fc){var urls=[],re=/url\\((https:[^)]+)\\)/g,x;while((x=re.exec(fc))&&urls.length<8)if(urls.indexOf(x[1])<0)urls.push(x[1]);",
  "return Promise.all(urls.map(function(u){return fetch(u).then(function(r){return r.arrayBuffer()}).then(function(b){var bin='',a=new Uint8Array(b);for(var i=0;i<a.length;i++)bin+=String.fromCharCode(a[i]);return[u,'data:font/woff2;base64,'+btoa(bin)]}).catch(function(){return[u,u]})})).then(function(pairs){for(var i=0;i<pairs.length;i++)fc=fc.split(pairs[i][0]).join(pairs[i][1]);return fc})}).catch(function(){return''})}",
  "function makeSvg(useFonts,cb){var card=document.getElementById('card');var r=card.getBoundingClientRect(),w=Math.ceil(r.width),h=Math.ceil(r.height);",
  "function build(fontCss){var css=(collectCss().replace(/@import url\\([^)]*\\)\\s*;?/g,'')+fontCss+varCss('rcexport')).replace(/]]>/g,'');",
  "css=css.replace(/&/g,'&amp;').replace(/</g,'&lt;');",
  "var xhtml=new XMLSerializer().serializeToString(card);",
  "var svg='<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"'+w+'\" height=\"'+h+'\"><foreignObject width=\"100%\" height=\"100%\"><div xmlns=\"http://www.w3.org/1999/xhtml\" class=\"rcexport\"><style>'+css+'</style>'+xhtml+'</div></foreignObject></svg>';cb(svg,w,h)}",
  "if(useFonts)inlineFonts().then(function(fc){if(fc&&fc.length>420000)fc='';build(fc||'')});else build('')}",
  "function pngBlob(cb){function attempt(useFonts,next){makeSvg(useFonts,function(svg,w,h){",
  "var img=new Image();",
  "img.onload=function(){try{var c=document.createElement('canvas'),s=2;c.width=w*s;c.height=h*s;var x=c.getContext('2d');x.scale(s,s);x.drawImage(img,0,0);c.toBlob(function(b){if(b)cb(b,null);else next('canvas export blocked')},'image/png')}catch(e){next('canvas: '+e.message)}};",
  "img.onerror=function(){next('svg render failed')};",
  "img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)})}",
  "attempt(true,function(e1){attempt(false,function(e2){cb(null,e2||e1)})})}",
  "function act(kind,btn){setState(btn,'busy');",
  "if(kind==='copytext'){clipText(document.getElementById('card').innerText,function(ok){setState(btn,ok?'ok':'err',ok?'Copied':'Failed')});return}",
  "if(kind==='copymd'){clipText(toMd(),function(ok){setState(btn,ok?'ok':'err',ok?'Copied':'Failed')});return}",
  "if(kind==='copyhtml'){clipText(exportHtml(),function(ok){setState(btn,ok?'ok':'err',ok?'Copied':'Failed')});return}",
  "if(kind==='copyimg'){pngBlob(function(b,err){if(!b){setState(btn,'err','Failed');toast('image: '+err);return}",
  "if(navigator.clipboard&&window.ClipboardItem){navigator.clipboard.write([new ClipboardItem({'image/png':b})]).then(function(){setState(btn,'ok','Copied')},function(){saveFile('readable-card.png',null,b,btn,'Saved instead')})}else saveFile('readable-card.png',null,b,btn,'Saved instead')});return}",
  "if(kind==='dlpng'){pngBlob(function(b,err){if(!b){setState(btn,'err','Failed');toast('image: '+err);return}saveFile('readable-card.png',null,b,btn,'Saved')});return}",
  "if(kind==='copyemail'){richCopy(emailHtml(),toMd(),function(ok){setState(btn,ok?'ok':'err',ok?'Copied':'Failed');if(ok)toast('paste into your email compose window')});return}",
  "if(kind==='dlemail'){saveFile('readable-card.email.html','<!DOCTYPE html><html dir=\"'+(getComputedStyle(document.getElementById('card')).direction)+'\"><head><meta charset=\"utf-8\"><title>readable card</title></head><body style=\"margin:0;padding:16px;background:#ffffff\">'+emailHtml()+'</body></html>',null,btn,'Saved');return}",
  "if(kind==='dlhtml'){saveFile('readable-card.html',exportHtml(),null,btn,'Saved');return}",
  "if(kind==='dlmd'){saveFile('readable-card.md',toMd(),null,btn,'Saved');return}",
  "if(kind==='dltxt'){saveFile('readable-card.txt',document.getElementById('card').innerText,null,btn,'Saved');return}}",
  "menu.querySelector('.items').addEventListener('click',function(e){e.stopPropagation();var b=e.target.closest('button');if(b&&!b.classList.contains('busy'))act(b.getAttribute('data-act'),b)});",
  "window.__rcCopy=clipText;",
  "window.__rcExport={md:toMd,html:exportHtml,png:pngBlob,email:emailHtml};",
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

/* App-only tool: the card menu calls this through the host (tools/call) to
 * save an export to disk with a real, verifiable path. Not for the model. */
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
    },
    required: ['filename', 'content'],
  },
};

function saveDir() {
  if (process.env.READABLE_SAVE_DIR) return process.env.READABLE_SAVE_DIR;
  const cwd = process.cwd();
  // Plugin-spawned servers inherit the project dir; app-spawned ones sit at /.
  if (cwd && cwd !== '/' && cwd !== os.homedir()) return cwd;
  return path.join(os.homedir(), 'Downloads');
}

function saveCard(filename, content, encoding) {
  const clean = String(filename).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._]+/, '');
  if (!clean) throw new Error('bad filename');
  const dir = saveDir();
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(clean);
  const base = clean.slice(0, clean.length - ext.length);
  let target = path.join(dir, clean);
  for (let n = 1; fs.existsSync(target); n++) target = path.join(dir, base + '-' + n + ext);
  fs.writeFileSync(target, Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8'));
  return target;
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
      respond({ tools: [TOOL, SAVE_TOOL] });
      return;
    case 'tools/call': {
      if (params && params.name === 'save_card') {
        const a = params.arguments || {};
        if (typeof a.filename !== 'string' || typeof a.content !== 'string') return fail(-32602, 'filename and content are required');
        try {
          const saved = saveCard(a.filename, a.content, a.encoding);
          try { process.stderr.write('[readable-card] save_card -> ' + saved + '\n'); } catch (e) {}
          respond({ content: [{ type: 'text', text: saved }] });
        } catch (e) {
          respond({ isError: true, content: [{ type: 'text', text: 'save failed: ' + String(e && e.message) }] });
        }
        return;
      }
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

try { process.stderr.write('[readable-card] build 4.3.5 file=' + __filename + '\n'); } catch (e) {}
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
