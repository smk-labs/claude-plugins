'use strict';
/**
 * The card iframe's own script: a JSON-RPC-over-postMessage bridge per SEP-1865.
 *
 * ui/initialize handshake, then render on ui/notifications/tool-input. It is
 * authored as an array of lines because the LINE is the unit of two things: the
 * comments (whole lines of their own, dropped on the way out — they document the
 * bridge for maintainers and would otherwise spend the host's ~30KB resource
 * ceiling), and the assembly-time squeeze in template.js.
 *
 * js(sig) takes the signature markup rather than reading it, so the bridge has
 * no idea where rc.css lives and the tests can render it with any signature.
 */
module.exports = { js };

function js(sig) {
  if (typeof sig !== 'string' || sig.indexOf("'") !== -1) {
    throw new Error('bridge: signature must be a single-quote-free string');
  }
  return LINES(sig).filter((l) => l.slice(0, 2) !== '/*').join('');
}

function LINES(SIG_HTML) {
  return [
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
  "/* Measure the CARD, never documentElement.scrollHeight. The root element's scrollHeight is floored by its own viewport, so once the host grows the iframe to H the measurement can never report less than H again: a one-way ratchet. Zoom out, or widen the pane so fewer lines wrap, and the card kept the taller frame with a slab of empty space under the text that nothing could reclaim. #card is a normal block with margin:0 on html, body and .rc, so its rect bottom IS the content height, and it shrinks. */",
  "/* Measure the .items panel itself: #rcmenu's own rect is just the dots button, absolute children never grow it. */",
  "function fit(){var c=document.getElementById('card');var h=c?c.getBoundingClientRect().bottom+(window.scrollY||0):document.body.getBoundingClientRect().height;var m=document.getElementById('rcmenu');var it=m&&m.querySelector('.items');if(it&&m.className.indexOf('open')>-1){var b=it.getBoundingClientRect().bottom+10;if(b>h)h=b}notify('ui/notifications/size-changed',{height:Math.ceil(h)+2})}",
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
  "/* Observe the card as well as the body: body is what changes width when the pane is resized, #card is what changes height when the content reflows, and a shrink has to be heard as reliably as a growth or the frame stays tall. */",
  "(function(){var ro=new ResizeObserver(fit);ro.observe(document.body);var c=document.getElementById('card');if(c)ro.observe(c)})();",
  "})();",
  ];
}
