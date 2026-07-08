/* readable card menu - single source of truth for the 5x2 copy/download matrix (Image, Email, HTML, Markdown, Text). */
/* Consumed by BOTH hosts: */
/*   - mcp/server.js inlines it into the ui:// card template (comment lines dropped, rest joined with no separator; the host's ~30KB resource ceiling applies, keep it lean) */
/*   - skills/report/build.py inlines it into the standalone report shell */
/* STYLE CONTRACT: one complete statement (or string-concat chunk) per line; block comments alone on their own lines; no // comments; no blank lines. */
/* HOST ADAPTERS looked up on window at click time (define them anywhere): */
/*   - __rcEmail(cb): produce email-client-ready inline-styled HTML, cb(html, err). Template: render_email RPC (server-side static map). Report: computed-style walker (no server, no ceiling). */
/*   - __rcRpc(method, params, cb) (optional): JSON-RPC bridge to the MCP host. Absent in the report; saves then fall back to <a download>. */
/* Self-installing: injects its own CSS, menu DOM (#rcmenu) and toast (#rctoast) into the page; needs #card to exist. */
(function(){
var CSS='#rcmenu{position:fixed;top:8px;right:8px;z-index:9;font-family:system-ui,sans-serif;direction:ltr}'+
'#rcmenu .dots{width:30px;height:30px;border-radius:8px;border:.5px solid var(--border);background:var(--surface-2);color:var(--text-secondary);cursor:pointer;font-size:16px;line-height:1;opacity:.4;padding:0}'+
'#rcmenu:hover .dots,#rcmenu.open .dots{opacity:1}'+
'#rcmenu .items{display:none;position:absolute;right:0;top:34px;background:var(--surface-1);border:.5px solid var(--border-strong);border-radius:12px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.28)}'+
'#rcmenu.open .items{display:block}'+
'#rcmenu .row{display:flex;align-items:center;border-radius:8px;padding:2px 4px}'+
'#rcmenu .row:hover{background:var(--surface-2)}'+
'#rcmenu .fmt{flex:1;display:flex;align-items:center;gap:11px;font-size:14px;color:var(--text-primary);white-space:nowrap;padding:7px 4px 7px 2px;min-width:132px}'+
'#rcmenu .fmt svg{width:17px;height:17px;flex:0 0 auto;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.75}'+
'#rcmenu .act{width:30px;height:30px;margin:0 2px;border-radius:7px;border:none;background:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}'+
'#rcmenu .act:hover{background:var(--surface-1);color:var(--text-primary);box-shadow:inset 0 0 0 .5px var(--border-strong)}'+
'#rcmenu .act .ic{display:inline-flex;align-items:center;justify-content:center}'+
'#rcmenu .act svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'+
'#rcmenu .act.ok{color:var(--ca,#0f9d58)}#rcmenu .act.err{color:#e05555}'+
'.rcspin{width:12px;height:12px;border:2px solid var(--border-strong);border-top-color:var(--text-accent);border-radius:50%;animation:rcspin .7s linear infinite;display:inline-block}'+
'@keyframes rcspin{to{transform:rotate(360deg)}}'+
'#rctoast{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);max-width:92%;background:var(--text-primary);color:var(--surface-1);font-size:12px;font-family:system-ui,sans-serif;padding:5px 12px;border-radius:14px;opacity:0;transition:opacity .2s;pointer-events:none;direction:ltr;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
var I={image:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
mail:'<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
code:'<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
filetext:'<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
type:'<svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
copy:'<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
download:'<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'};
/* One row per FORMAT with identical naming; two action columns (Copy, Download) so every format is exportable both ways, symmetrically. */
function row(icon,label,copyAct,dlAct){return '<div class="row"><span class="fmt">'+icon+label+'</span>'+'<button class="act" data-act="'+copyAct+'" title="Copy '+label+'"><span class="ic">'+I.copy+'</span></button>'+'<button class="act" data-act="'+dlAct+'" title="Download '+label+'"><span class="ic">'+I.download+'</span></button></div>'}
var css=document.createElement('style');
css.textContent=CSS;
document.head.appendChild(css);
var menu=document.createElement('div');
menu.id='rcmenu';
menu.innerHTML='<button class="dots" title="card menu">⋯</button><div class="items">'+row(I.image,'Image','copyimg','dlpng')+row(I.mail,'Email','copyemail','dlemail')+row(I.code,'HTML','copyhtml','dlhtml')+row(I.filetext,'Markdown','copymd','dlmd')+row(I.type,'Text','copytext','dltxt')+'</div>';
document.body.appendChild(menu);
var toastEl=document.createElement('div');
toastEl.id='rctoast';
document.body.appendChild(toastEl);
var VARS=['--text-primary','--text-secondary','--text-accent','--surface-1','--surface-2','--border','--border-strong','--bg-success','--bg-accent','--bg-warning','--bg-danger','--font-mono','--page-bg'];
var ICON_OK='<svg viewBox="0 0 24 24" style="stroke-width:2.5"><polyline points="20 6 9 17 4 12"/></svg>';
var ICON_ERR='<svg viewBox="0 0 24 24" style="stroke-width:2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
menu.querySelector('.dots').addEventListener('click',function(e){e.stopPropagation();if(e.altKey){clipText(JSON.stringify({host:window.__rcHost||null,errors:window.__rcErrs||[]},null,1),function(ok){toast(ok?'diagnostics copied':'diagnostics copy failed')});return}menu.classList.toggle('open')});
document.addEventListener('click',function(e){if(!menu.contains(e.target))menu.classList.remove('open')});
function toast(t){var el=toastEl;el.textContent=t;el.style.opacity='1';clearTimeout(el._t);el._t=setTimeout(function(){el.style.opacity='0'},3400)}
window.__rcToast=toast;
function theme(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light'}
function collectCss(){var out='',els=document.querySelectorAll('style');for(var i=0;i<els.length;i++)out+=els[i].textContent+'\n';return out}
function varCss(cls){var cs=getComputedStyle(document.documentElement),out='.'+cls+'{';for(var i=0;i<VARS.length;i++){var v=cs.getPropertyValue(VARS[i]);if(v)out+=VARS[i]+':'+v.trim()+';'}return out+'}'}
function exportHtml(){var card=document.getElementById('card');return '<!DOCTYPE html>\n<html data-theme="'+theme()+'"><head><meta charset="utf-8"><title>readable card</title><style>\n'+collectCss()+'\n#rcmenu,#rctoast{display:none}\n</style></head><body style="margin:16px">'+card.outerHTML+'</body></html>'}
/* Email export renders through the host adapter (window.__rcEmail); the rich-text clipboard write carries both flavors (text/html + text/plain markdown), with a contenteditable+execCommand fallback. */
function richCopy(html,plain,cb){function legacy(){try{var d=document.createElement('div');d.contentEditable='true';d.style.cssText='position:fixed;opacity:0;left:-9999px';d.innerHTML=html;document.body.appendChild(d);var r=document.createRange();r.selectNodeContents(d);var s=getSelection();s.removeAllRanges();s.addRange(r);var ok=document.execCommand('copy');s.removeAllRanges();d.remove();return ok}catch(e){return false}}
if(navigator.clipboard&&window.ClipboardItem){try{navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]).then(function(){cb(true)},function(){cb(legacy())});return}catch(e){}}cb(legacy())}
function inlineMd(el){var out='';el.childNodes.forEach(function(n){if(n.nodeType===3){out+=n.textContent;return}if(n.nodeType!==1)return;var t=n.tagName;
if(t==='CODE')out+='`'+n.textContent+'`';else if(t==='STRONG'||t==='B')out+='**'+inlineMd(n)+'**';else if(t==='A')out+='['+inlineMd(n)+']('+(n.getAttribute('href')||'')+')';else if(t==='BR')out+='\n';else out+=inlineMd(n)});return out.replace(/[ \t]+/g,' ')}
function rowMd(tr,tag){var cells=[];tr.querySelectorAll(tag).forEach(function(c){cells.push(inlineMd(c).trim()||' ')});return '| '+cells.join(' | ')+' |'}
function toMd(){var card=document.getElementById('card'),L=[];
card.childNodes.forEach(function(n){if(n.nodeType!==1)return;var t=n.tagName,c=n.className||'';
if(t==='H2')L.push('# '+inlineMd(n).trim());
else if(t==='H3')L.push('## '+inlineMd(n).trim());
else if(t==='H4')L.push('### '+inlineMd(n).trim());
else if(t==='P')L.push(inlineMd(n).trim());
else if(t==='HR')L.push('---');
else if(t==='PRE')L.push('```\n'+n.textContent.replace(/\n$/,'')+'\n```');
else if(t==='UL'||t==='OL'){var i=0;n.querySelectorAll(':scope>li').forEach(function(li){i++;var p=t==='OL'?i+'. ':'- ';var cc=li.className||'';if(cc.indexOf('ok')>-1)p+='✓ ';else if(cc.indexOf('no')>-1)p+='✕ ';L.push(p+inlineMd(li).trim())})}
else if(t==='TABLE'){var h=n.querySelector('thead tr');if(h){L.push(rowMd(h,'th'));L.push('|'+' --- |'.repeat(h.querySelectorAll('th').length))}n.querySelectorAll('tbody tr').forEach(function(tr){L.push(rowMd(tr,'td'))})}
else if(c.indexOf('cal')>-1){var kind=(c.match(/tip|note|warn|danger/)||[''])[0];L.push('> '+(kind?'['+kind.toUpperCase()+'] ':'')+inlineMd(n).trim())}
else if(c.indexOf('kv')>-1){n.querySelectorAll(':scope>div').forEach(function(d){var k=d.querySelector('b'),v=d.querySelector('span');L.push('- **'+(k?inlineMd(k).trim():'')+':** '+(v?inlineMd(v).trim():''))})}
else if(c.indexOf('grid')>-1){n.querySelectorAll('.kpi').forEach(function(k){var l=k.querySelector('.l'),v=k.querySelector('.n'),tr=k.querySelector('.trend');var val=v?v.childNodes[0]?v.childNodes[0].textContent.trim():'':'';L.push('- **'+(l?l.textContent.trim():'')+':** '+val+(tr?' ('+tr.textContent.trim()+')':''))})}
else if(c.indexOf('bars')>-1){n.querySelectorAll('.bar').forEach(function(b){var l=b.querySelector('.l'),v=b.querySelector('.v');L.push('- '+(l?l.textContent.trim():'')+': '+(v?v.textContent.trim():''))})}
else if(c.indexOf('donut')>-1){n.querySelectorAll('.leg>span').forEach(function(s){L.push('- '+s.textContent.trim())})}
else if(c.indexOf('flow')>-1){var steps=[];n.querySelectorAll('.s').forEach(function(s){steps.push(s.textContent.trim())});L.push(steps.join(' → '))}
else if(c.indexOf('tl')>-1){n.querySelectorAll(':scope>div').forEach(function(d){var b=d.querySelector('b'),rest=d.textContent.replace(b?b.textContent:'','').trim();L.push('- **'+(b?b.textContent.trim():'')+':** '+rest)})}
else if(c.indexOf('btns')>-1){}
else{var tx=inlineMd(n).trim();if(tx)L.push(tx)}});
function lkind(l){return l.charAt(0)==='|'?'t':(/^(- |\d+\. )/.test(l)?'l':(l.charAt(0)==='>'?'q':'b'))}
var out='';for(var q=0;q<L.length;q++){if(q>0){var pa=lkind(L[q-1]),cu=lkind(L[q]);out+=(pa===cu&&pa!=='b')?'\n':'\n\n'}out+=L[q]}return out}
var ORIG={};
function setState(btn,st,lb){var act=btn.getAttribute('data-act');var ic=btn.querySelector('.ic'),lbl=btn.querySelector('.lb');if(!ORIG[act])ORIG[act]=[ic.innerHTML,lbl?lbl.textContent:''];
btn.classList.remove('busy','ok','err');clearTimeout(btn._t);
if(st==='idle'){ic.innerHTML=ORIG[act][0];if(lbl)lbl.textContent=ORIG[act][1];return}
btn.classList.add(st);
if(st==='busy'){ic.innerHTML='<span class="rcspin"></span>'}else{ic.innerHTML=st==='ok'?ICON_OK:ICON_ERR}
if(lb){if(lbl)lbl.textContent=lb;else if(st==='err')toast(lb)}
if(st!=='busy')btn._t=setTimeout(function(){setState(btn,'idle')},2600)}
function clipText(t,cb){function legacy(){try{var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();var ok=document.execCommand('copy');ta.remove();return ok}catch(e){return false}}
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){cb(true)},function(){cb(legacy())})}else cb(legacy())}
function b64(blob,cb){var r=new FileReader();r.onload=function(){cb(String(r.result).split(',')[1]||'')};r.onerror=function(){cb(null)};r.readAsDataURL(blob)}
function saveFile(name,text,blob,btn,verb){
function finish(ok,lb,info){setState(btn,ok?'ok':'err',lb);if(info)toast(info)}
function viaAnchor(){try{var u=URL.createObjectURL(blob||new Blob([text],{type:'text/plain;charset=utf-8'}));var a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},1500);finish(true,'Downloaded','Browser download: '+name)}catch(e){finish(false,'Failed','download blocked: '+e.message)}}
function viaDownloadFile(payload){if(!window.__rcRpc){viaAnchor();return}window.__rcRpc('ui/download-file',{contents:[payload]},function(res,err){if(err)viaAnchor();else finish(true,'Saved','Sent to host downloads')})}
function hostPayload(bb){var rsc={uri:'file:///'+name,mimeType:blob?'image/png':(name.slice(-3)==='.md'?'text/markdown':(name.slice(-5)==='.html'?'text/html':'text/plain'))};if(bb)rsc.blob=bb;else rsc.text=text;return {type:'resource',resource:rsc}}
function go(content,enc,bb){if(!window.__rcRpc){viaAnchor();return}window.__rcRpc('tools/call',{name:'save_card',arguments:{filename:name,content:content,encoding:enc}},function(res,err){
if(!err&&res&&!res.isError&&res.content&&res.content[0]&&res.content[0].text&&res.content[0].text.charAt(0)==='/'){finish(true,verb,'Saved: '+res.content[0].text);return}
viaDownloadFile(hostPayload(bb))})}
if(blob)b64(blob,function(bb){if(bb==null){finish(false,'Failed','encode failed');return}go(bb,'base64',bb)});else go(text,'utf8',null)}
function makeSvg(useFonts,cb){var card=document.getElementById('card');var r=card.getBoundingClientRect(),w=Math.ceil(r.width),h=Math.ceil(r.height);
function build(fontCss){var css=(collectCss().replace(/@import url\([^)]*\)\s*;?/g,'')+fontCss+varCss('rcexport')).replace(/]]>/g,'');
css=css.replace(/&/g,'&amp;').replace(/</g,'&lt;');
var xhtml=new XMLSerializer().serializeToString(card);
var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="rcexport"><style>'+css+'</style>'+xhtml+'</div></foreignObject></svg>';cb(svg,w,h)}
build('')}
function pngBlob(cb){function attempt(useFonts,next){makeSvg(useFonts,function(svg,w,h){
var img=new Image();
img.onload=function(){try{var c=document.createElement('canvas'),s=2;c.width=w*s;c.height=h*s;var x=c.getContext('2d');x.scale(s,s);x.drawImage(img,0,0);c.toBlob(function(b){if(b)cb(b,null);else next('canvas export blocked')},'image/png')}catch(e){next('canvas: '+e.message)}};
img.onerror=function(){next('svg render failed')};
img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)})}
attempt(false,function(e1){cb(null,e1)})}
function withEmail(btn,cb){if(!window.__rcEmail){setState(btn,'err','Failed');toast('email export unavailable in this host');return}window.__rcEmail(function(h,err){if(!h){setState(btn,'err','Failed');toast('email: '+err);return}cb(h)})}
function act(kind,btn){setState(btn,'busy');
if(kind==='copytext'){clipText(document.getElementById('card').innerText,function(ok){setState(btn,ok?'ok':'err',ok?'Copied':'Failed')});return}
if(kind==='copymd'){clipText(toMd(),function(ok){setState(btn,ok?'ok':'err',ok?'Copied':'Failed')});return}
if(kind==='copyhtml'){clipText(exportHtml(),function(ok){setState(btn,ok?'ok':'err',ok?'Copied':'Failed')});return}
if(kind==='copyemail'){withEmail(btn,function(h){richCopy(h,toMd(),function(ok){setState(btn,ok?'ok':'err',ok?'Copied':'Failed');if(ok)toast('paste into your email compose window')})});return}
if(kind==='dlemail'){withEmail(btn,function(h){var d=(h.match(/dir="(ltr|rtl)"/)||[])[1]||'rtl';saveFile('readable-card.email.html','<!DOCTYPE html><html dir="'+d+'"><head><meta charset="utf-8"><title>readable card</title></head><body style="margin:0;padding:16px;background:#ffffff">'+h+'</body></html>',null,btn,'Saved')});return}
if(kind==='copyimg'){pngBlob(function(b,err){if(!b){setState(btn,'err','Failed');toast('image: '+err);return}
if(navigator.clipboard&&window.ClipboardItem){navigator.clipboard.write([new ClipboardItem({'image/png':b})]).then(function(){setState(btn,'ok','Copied')},function(){saveFile('readable-card.png',null,b,btn,'Saved instead')})}else saveFile('readable-card.png',null,b,btn,'Saved instead')});return}
if(kind==='dlpng'){pngBlob(function(b,err){if(!b){setState(btn,'err','Failed');toast('image: '+err);return}saveFile('readable-card.png',null,b,btn,'Saved')});return}
if(kind==='dlhtml'){saveFile('readable-card.html',exportHtml(),null,btn,'Saved');return}
if(kind==='dlmd'){saveFile('readable-card.md',toMd(),null,btn,'Saved');return}
if(kind==='dltxt'){saveFile('readable-card.txt',document.getElementById('card').innerText,null,btn,'Saved');return}}
menu.querySelector('.items').addEventListener('click',function(e){e.stopPropagation();var b=e.target.closest('button');if(b&&!b.classList.contains('busy'))act(b.getAttribute('data-act'),b)});
window.__rcCopy=clipText;
window.__rcExport={md:toMd,html:exportHtml,png:pngBlob};
})();
