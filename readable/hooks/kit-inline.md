<!-- TIER 2 KIT, OFFLINE. Same kit as kit.md with every component inline, for a host that cannot reach a CDN. Read on demand by hooks/rule.md; never injected at SessionStart. -->
<readable-widget-kit>
Deliver the reply as ONE mcp__visualize__show_widget call. Do NOT call read_me; there is no design work to do. The widget must be fully self-contained: no scripts of any kind and no external resources; the single exception is the Google Fonts @import already inside the kit, which degrades to system fonts when unreachable. widget_code is EXACTLY this skeleton (copy the BASE style block verbatim, never edit it), then your reply as HTML in place of CONTENT, then </div>:

<div class="rc" dir="rtl">
<style>
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800&display=swap');
.rc{--ca:var(--text-accent);--cb:color-mix(in srgb,var(--text-accent) 55%,var(--surface-1));--cc:color-mix(in srgb,var(--text-accent) 28%,var(--surface-1));--cd:#d96666;font-family:Vazirmatn,Tahoma,sans-serif;font-size:11.5px;line-height:1.9;color:var(--text-primary);background:var(--surface-1);border:.5px solid var(--border);border-radius:14px;padding:1.2rem 1.4rem;text-align:start;margin:.5rem 0}
.rc>:first-child{margin-top:0}.rc>:last-child{margin-bottom:0}
.rc h2{font-weight:800;font-size:1.35em;margin:0 0 .15em}
.rc h2::after{content:'';display:block;width:28px;height:2.5px;border-radius:2px;background:var(--text-accent);margin-top:.45em}
.rc h3{display:flex;align-items:center;gap:8px;font-weight:700;font-size:1.1em;margin:1.4em 0 .45em}
.rc h3::before{content:'';width:7px;height:7px;margin-inline-end:calc(1em - 7px);border-radius:2px;background:var(--text-accent);flex:0 0 auto}
.rc h4{font-weight:700;font-size:1em;margin:1em 0 .3em}
.rc p{margin:.6em 0}.rc .lead{color:var(--text-secondary);font-size:1.05em}
.rc p,.rc li,.rc h2,.rc h4,.rc td,.rc th,.rc .kpi,.rc .tl div{unicode-bidi:plaintext}
.rc strong{font-weight:700}
.rc code{display:inline-block;direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono);font-size:.85em;color:var(--text-accent);background:var(--surface-2);border:.5px solid var(--border);border-radius:5px;padding:1px 5px}
.rc a{color:var(--text-accent);text-decoration:none}.rc a:hover{border-bottom:1px solid currentColor}
.rc ul,.rc ol{padding-inline-start:1.5em;margin:.5em 0}.rc li{margin:.35em 0;position:relative}
.rc ul{list-style:none}.rc ul>li::before{content:'';position:absolute;inset-inline-start:-1.1em;top:.68em;width:4px;height:4px;border-radius:50%;background:var(--text-accent)}
.rc ol{list-style:decimal}.rc ol>li::marker{color:var(--text-accent);font-weight:700}
.rc li.ok::before,.rc li.no::before{content:'✓';background:none;width:auto;height:auto;top:0;inset-inline-start:-1.35em;font-weight:800;font-size:1em;line-height:inherit;color:var(--ca)}
.rc li.no::before{content:'✕';color:var(--cd)}
.rc .cal{display:flex;gap:9px;padding:9px 12px;border-radius:11px;margin:.8em 0;border-inline-start:3px solid var(--border-strong)}.rc .cal>div{min-width:0}.rc .cal p{margin:.15em 0}
.rc .cal.tip,.rc .cal.note{background:var(--bg-accent);border-color:var(--ca)}.rc .cal.warn,.rc .cal.danger{background:var(--bg-danger);border-color:var(--cd)}
.rc hr{border:none;border-top:.5px solid var(--border);margin:1.3em 0}
.rc pre{direction:ltr;text-align:left;unicode-bidi:isolate;font-family:var(--font-mono);font-size:.85em;background:var(--surface-2);border:.5px solid var(--border);border-radius:9px;padding:10px 12px;overflow-x:auto;line-height:1.6;margin:.8em 0}.rc pre code{display:block;border:none;background:none;padding:0}
.rc .sig{margin-top:1.6em;padding-top:.7em;border-top:.5px solid var(--border);font-size:.8em;color:var(--text-secondary);text-align:end}
.rc .sig a{color:inherit}
</style>
CONTENT
</div>

CONTENT always ENDS with this exact line, last thing inside the card, copied verbatim and never edited or translated (it is the readable signature; every other path injects it automatically, and this is the one path where you type it):
<div class="sig">created by readable · <a href="https://github.com/smk-labs" target="_blank" rel="noopener">github.com/smk-labs</a></div>

BASE already styles all text content, so these blocks need nothing extra: <h2> once as the title; <h3> per section; <p>; <p class="lead"> for a muted intro line; <ul>/<ol>; status items <li class="ok">/<li class="no">; callouts <div class="cal tip|note|warn|danger"><div>text</div></div>; <a>; <strong>; <hr> sparingly; and <code> wrapped around every path, command, URL, and code token (it renders LTR-isolated).

The icon set is deliberately absent from this path: its snippet carries a 2KB inline SVG sprite, and transcribing that verbatim is a corruption risk no icon is worth. Icons are available on the card and report paths, where the CSS is injected rather than copied.

Everything else is pay-per-use. Each component below has a CSS snippet: for EVERY component CONTENT uses, copy its snippet verbatim into the same <style>, right before </style>. Snippets are independent, order does not matter, never edit them. If unsure whether a component is used, include its snippet (missing CSS renders unstyled); never paste a snippet for a component CONTENT does not use.

TABLE — comparison tables, plain <table><thead><tbody>; 10+ row stat tables get <table class="zebra dense"> (striped rows + tight padding, combinable); long tables (100+ rows) get wrapped as <div class="scroll-table"><table>...</table></div> (scrollbox with pinned header, expands fully in print); very wide tables get <div class="scroll-table wide"> (cells stay on one line, box scrolls sideways, wraps again in print):
.rc table{border-collapse:collapse;width:100%;margin:.8em 0;font-size:.96em}
.rc thead th{color:var(--text-secondary);font-weight:700;font-size:.88em;border-bottom:1.5px solid var(--border-strong);padding:5px 10px;text-align:start}
.rc tbody td{padding:7px 10px;border-bottom:.5px solid var(--border);text-align:start}
.rc tbody tr:last-child td{border-bottom:none}.rc tbody tr:hover td{background:var(--surface-2)}
.rc .scroll-table{max-height:82vh;overflow:auto;border:1px solid var(--border);border-radius:11px;margin:.8em 0}.rc .scroll-table table{margin:0}
.rc .scroll-table thead th{position:sticky;top:0;z-index:2;background:var(--surface-2);box-shadow:0 1px 0 var(--border)}
.rc .scroll-table.wide table{width:max-content;min-width:100%;white-space:nowrap}
@media print{.rc .scroll-table{max-height:none;overflow:visible;border:none}.rc .scroll-table thead th{position:static;box-shadow:none}.rc .scroll-table.wide table{width:100%;white-space:normal}}
.rc table.zebra tbody tr:nth-child(2n) td{background:var(--surface-2)}
.rc table.zebra tbody tr:hover td{background:var(--border)}
.rc table.dense{font-size:.9em}.rc table.dense thead th,.rc table.dense tbody td{padding:4px 8px}

BADGE — status chips <span class="badge ok|warn|info">, mostly inside table cells:
.rc .badge{display:inline-block;font-size:.78em;font-weight:700;padding:1px 9px;border-radius:20px;background:var(--surface-2);color:var(--text-secondary)}
.rc .badge.ok,.rc .badge.info{background:var(--bg-accent);color:var(--ca)}.rc .badge.warn{background:var(--bg-danger);color:var(--cd)}

KV — key-value rows <div class="kv"><div><b>label</b><span>value</span></div>...</div>:
.rc .kv{margin:.8em 0}.rc .kv>div{display:flex;justify-content:space-between;gap:14px;padding:6px 2px;border-bottom:.5px solid var(--border)}.rc .kv>div:last-child{border:none}.rc .kv b{color:var(--text-secondary);font-weight:400}.rc .kv span{font-weight:500}

KPI — stat cards <div class="grid c3"> (or c2, or plain grid) of <div class="kpi"><div class="l">label</div><div class="n">1.2M<span class="trend up">18%</span></div></div>; trend classes up/dn; optional compact caveat <div class="f">one short line</div> last inside the kpi:
.rc .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px;margin:.8em 0}.rc .grid.c2{grid-template-columns:1fr 1fr}.rc .grid.c3{grid-template-columns:1fr 1fr 1fr}
.rc .kpi{background:var(--surface-2);border:.5px solid var(--border);border-radius:11px;padding:11px 13px}
.rc .kpi .l{font-size:.82em;color:var(--text-secondary);margin-bottom:3px}
.rc .kpi .n{font-size:1.8em;font-weight:800;line-height:1.2;color:var(--text-primary)}
.rc .trend{display:inline-block;font-size:.55em;font-weight:700;padding:1px 8px;border-radius:20px;vertical-align:2px;margin-inline-start:7px}
.rc .trend.up{background:var(--bg-accent);color:var(--ca)}.rc .trend.up::before{content:'▲ '}
.rc .trend.dn{background:var(--bg-danger);color:var(--cd)}.rc .trend.dn::before{content:'▼ '}
.rc .kpi .f{font-size:.74em;color:var(--text-secondary);line-height:1.7;margin-top:3px}

BARS — horizontal bars <div class="bars"><div class="bar"><span class="l">label</span><span class="t"><i style="width:72%"></i></span><span class="v">72%</span></div>...</div>; two-metric bar (total + subset overlay): <div class="bar duo"> with TWO <i> in the track (first total, second subset, widths % of the row max), value like "98h / 51h", and both colors named once in a legend first inside .bars: <div class="leg"><span class="a"><i></i>total</span><span class="b"><i></i>subset</span></div>:
.rc .bars{margin:.8em 0}.rc .bar{display:flex;align-items:center;gap:10px;margin:.45em 0}.rc .bar .l{flex:0 0 auto;min-width:4.5em;color:var(--text-secondary)}.rc .bar .t{flex:1;height:7px;background:var(--surface-2);border-radius:4px;overflow:hidden}.rc .bar .t i{display:block;height:100%;background:var(--text-accent);border-radius:4px}.rc .bar .v{flex:0 0 auto;font-weight:700;font-size:.9em}
.rc .bar.duo .t{position:relative}.rc .bar.duo .t i{background:var(--ca)}.rc .bar.duo .t i+i{position:absolute;inset-inline-start:0;top:0;background:var(--cb)}
.rc .bars .leg{display:flex;flex-flow:row wrap;gap:4px 16px;margin:.2em 0 .5em;font-size:.9em}
.rc .leg>span{display:flex;align-items:center;gap:8px}
.rc .leg i{width:9px;height:9px;border-radius:3px;flex:0 0 auto}
.rc .leg .a i{background:var(--ca)}.rc .leg .b i{background:var(--cb)}.rc .leg .c i{background:var(--cc)}.rc .leg .d i{background:var(--cd)}

SPARK — trend sparkline for a time series (x evenly spaced 0..100 oldest→newest, y inverted so 2≈max and 28≈min, computed from the data; optional area fill: prepend <polygon points="0,30 …the same points… 100,30"/>; optional second series: append <polyline class="s2" points="…"/>; 2-5 x labels): <div class="spark"><svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="0,26 25,19 50,22 75,10 100,4"/></svg><div class="x"><span>فروردین</span><span>تیر</span></div></div>:
.rc .spark{margin:.8em 0}
.rc .spark svg{display:block;width:100%;height:54px}
.rc .spark polyline{fill:none;stroke:var(--text-accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.rc .spark polyline.s2{stroke:var(--cc);stroke-dasharray:5 4}
.rc .spark polygon{fill:var(--text-accent);opacity:.09;stroke:none}
.rc .spark .x{display:flex;justify-content:space-between;direction:ltr;color:var(--text-secondary);font-size:.82em;margin-top:2px}

DONUT — donut chart, 2-4 slices summing to 100, legend classes a/b/c/d: <div class="donut-w"><div class="donut" style="--a:46;--b:31"></div><div class="leg"><span class="a"><i></i>label 46%</span><span class="b"><i></i>label 31%</span><span class="c"><i></i>label 23%</span></div></div>:
.rc .donut-w{display:flex;align-items:center;gap:20px;margin:.9em 0;flex-wrap:wrap}
.rc .donut{width:92px;height:92px;border-radius:50%;flex:0 0 auto;background:conic-gradient(var(--ca) 0 calc(var(--a)*1%),var(--cb) 0 calc((var(--a) + var(--b))*1%),var(--cc) 0 100%);-webkit-mask:radial-gradient(circle,transparent 56%,#000 57%);mask:radial-gradient(circle,transparent 56%,#000 57%)}
.rc .leg{display:flex;flex-direction:column;gap:5px}
.rc .leg>span{display:flex;align-items:center;gap:8px}
.rc .leg i{width:9px;height:9px;border-radius:3px;flex:0 0 auto}
.rc .leg .a i{background:var(--ca)}.rc .leg .b i{background:var(--cb)}.rc .leg .c i{background:var(--cc)}.rc .leg .d i{background:var(--cd)}

FLOW — process steps with automatic arrows <div class="flow"><span class="s">step</span>...</div>:
.rc .flow{display:flex;flex-wrap:wrap;align-items:center;gap:34px;margin:.9em .2em}
.rc .flow .s{position:relative;background:var(--surface-2);border:.5px solid var(--border);border-radius:9px;padding:5px 13px;font-weight:500}
.rc .flow .s:not(:last-child)::after{content:'';position:absolute;inset-inline-end:-28px;top:50%;width:22px;height:1.5px;border-radius:1px;background:var(--text-accent);transform:translateY(-50%)}
.rc .flow .s:not(:last-child)::before{content:'';position:absolute;inset-inline-end:-30px;top:50%;width:6px;height:6px;border-left:1.5px solid var(--text-accent);border-bottom:1.5px solid var(--text-accent);transform:translateY(-50%) rotate(45deg)}

TL — timeline <div class="tl"><div><b>title</b>text</div>...</div>:
.rc .tl{position:relative;margin:.9em .3em;padding-inline-start:1.4em}
.rc .tl::before{content:'';position:absolute;inset-inline-start:.28em;top:.5em;bottom:.5em;width:1.5px;background:var(--border-strong)}
.rc .tl>div{position:relative;margin:.8em 0}
.rc .tl>div::before{content:'';position:absolute;inset-inline-start:-1.34em;top:.5em;width:8px;height:8px;border-radius:50%;background:var(--text-accent);outline:2.5px solid var(--surface-1)}
.rc .tl b{display:block;font-weight:700}

HUB — one thing connected to many, which no other component draws: FLOW is a sequence, TL a chronology, CARD a comparison. `hub` is a centre with up to eight legs, each leg an arrow that carries direction of flow; `hub tree` is a root, branches and leaves with no arrows, for items that GROUP. Flat markup: one <div class="c"> first, then the items as <div class="s">, plus an optional <span> inside either for a muted second line: <div class="hub"><div class="c">centre<span>what it is</span></div><div class="s">reads from this<span>what it holds</span></div><div class="s out">writes to this<span>what it gets</span></div></div>. `out` flips one leg's arrow to point AWAY from the centre, which is the whole difference between "reads from" and "writes to", never a second colour. Keep labels short, a leg is 12em wide. NINE items or more is a tree, not a hub: the ring holds eight. `hub tree` is the same markup plus `tree` on the wrapper, and a branch may nest its own <div class="s"> children, which render as a connected group inside it: <div class="hub tree"><div class="c">root</div><div class="s">branch<span>note</span><div class="s">leaf</div><div class="s">leaf</div></div><div class="s">branch</div></div>:
.rc .hub{--f:1;--o:0;display:grid;grid-template-columns:repeat(3,minmax(0,12em));justify-content:center;gap:44px;margin:.9em 0;text-align:center}
.rc .hub:dir(rtl){--f:-1;--o:100%}
.rc .hub div{position:relative;align-content:center;background:var(--surface-2);border:.5px solid var(--border);border-radius:9px;padding:5px 9px}
.rc .hub .c{grid-area:2/2;background:var(--bg-accent);border-color:var(--ca);font-weight:700}
.rc .hub span{display:block;font-size:.86em;color:var(--text-secondary)}
.rc .hub .s{--x:50%;--y:50%;--r:0deg;--l:44px;--a:0deg;--w:calc(var(--l) - 4px);--d:var(--w)}
.rc .hub .s::before,.rc .hub .s::after,.rc .tree>.c::after{content:var(--k,'');position:absolute;inset-inline-start:var(--x);top:var(--y);border-top:1.5px solid var(--cb)}
.rc .hub .s::before{width:var(--w);margin-top:-.75px;transform-origin:var(--o) 50%;transform:rotate(calc(var(--r)*var(--f)))}
.rc .hub:not(.tree) .s::after{margin:-3px -4px;border:3px solid transparent;border-right:0;border-left:8px solid var(--cb);transform:scaleX(var(--f)) rotate(var(--r)) translateX(var(--d)) rotate(var(--a))}
.rc .hub .out{--a:180deg;--w:var(--l);--d:2px}
.rc .hub:not(.tree)>:nth-child(n+10){--k:none}
.rc .hub>:nth-child(2){--x:100%;--y:100%;--r:45deg;--l:66px}
.rc .hub>:nth-child(3){--y:100%;--r:90deg}
.rc .hub>:nth-child(4){--x:0;--y:100%;--r:135deg;--l:66px}
.rc .hub>:nth-child(5){--x:100%}
.rc .hub>:nth-child(6){--x:0;--r:180deg}
.rc .hub>:nth-child(7){--x:100%;--y:0;--r:-45deg;--l:66px}
.rc .hub>:nth-child(8){--y:0;--r:-90deg}
.rc .hub>:nth-child(9){--x:0;--y:0;--r:-135deg;--l:66px}
@media(max-width:520px){.rc .hub{grid-template-columns:1fr;gap:6px}.rc .hub .c{grid-area:auto}.rc .hub .s{--x:0;--y:50%;--r:180deg;--l:16px;margin-inline-start:16px}}
.rc .tree{grid-template-columns:minmax(6em,12em) auto;grid-template-rows:repeat(40,auto);gap:0 26px;text-align:start}
.rc .tree>.c{grid-area:1/1/-1/2;align-self:center;--x:100%;--y:50%}
.rc .tree>.c::after{width:13px;margin-top:-.75px}
.rc .tree .s{--x:-13px;--y:50%;--r:0deg;--l:13px;margin-block:4px}
.rc .tree .s::after{top:-5px;bottom:-5px;border-top:0;border-inline-start:1.5px solid var(--cb)}
.rc .tree .c+.s::after,.rc .tree .s:first-of-type::after{top:50%}
.rc .tree .s:last-of-type::after{bottom:50%}
.rc .tree .s .s{margin-inline-start:13px}

FOLD — collapsible block <details class="fold"><summary>label</summary>…blocks…</details>, closed by default, native and JS-free; for long content the reader wants on demand (a full run log, a raw payload, a long quote), never as a substitute for sections or tables. Content is normal blocks (<p>, <pre>, <ul>, <table>); one level of nesting is fine:
.rc .fold{margin:.8em 0;border:.5px solid var(--border);border-radius:11px;overflow:hidden}
.rc .fold>summary{display:flex;align-items:center;gap:9px;padding:6px 12px;background:var(--surface-2);color:var(--text-accent);font-weight:700;cursor:pointer;unicode-bidi:plaintext}
.rc .fold>summary::-webkit-details-marker{display:none}
.rc .fold>summary::before{content:'';flex:0 0 auto;width:6px;height:6px;border-top:1.5px solid currentColor;border-inline-end:1.5px solid currentColor;border-start-end-radius:1px;transform:rotate(45deg);transition:transform .15s}
.rc .fold>summary:dir(rtl)::before{transform:rotate(-45deg)}
.rc .fold[open]>summary{border-bottom:.5px solid var(--border)}
.rc .fold[open]>summary::before{transform:rotate(135deg)}
.rc .fold[open]>summary:dir(rtl)::before{transform:rotate(-135deg)}
.rc .fold>:not(summary){margin-inline:12px}
.rc .fold pre{white-space:pre-wrap;word-break:break-word;max-height:52vh;overflow:auto}
.rc .fold .fold>summary{background:none;color:var(--text-secondary)}
@media print{.rc .fold::details-content{content-visibility:visible;display:block}.rc .fold>summary::before{transform:rotate(135deg);transition:none}.rc .fold>summary:dir(rtl)::before{transform:rotate(-135deg)}.rc .fold pre{max-height:none;overflow:visible}}

CTA — closing buttons, max two, only when a natural next step exists: <div class="btns"><button class="cta" onclick="sendPrompt('the exact prompt')">label</button><button class="cta ghost" onclick="sendPrompt('...')">label</button></div>:
.rc .cta{display:inline-flex;align-items:center;gap:6px;background:var(--text-accent);color:var(--surface-1);border:none;border-radius:9px;padding:7px 15px;font-family:inherit;font-size:1em;font-weight:700;cursor:pointer;margin-top:.4em}.rc .cta::after{content:'←';font-weight:400}.rc .cta:hover{opacity:.88}
.rc .btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:.6em}.rc .cta.ghost{background:transparent;color:var(--text-accent);border:1px solid var(--border-strong)}

CARD — a repeatable unit of content with a free-form body (prose, a list, a kv, a badge), in a grid that reflows to one column on a narrow screen and gives every card the same height: <div class="cards"><div class="card"><h4>title<span class="badge ok">chip</span></h4><p>…</p></div>…</div>; add c2 to the wrapper for exactly two per row, which is what a four-option comparison wants (2x2, no orphan card), and mark a recommended or chosen option <div class="card pick">. BOX is the same panel full-width, for one standout block such as an executive summary, with an optional <div class="lbl">eyebrow</div> above its heading. Use a TABLE instead when you compare many attributes across few options and column alignment matters; use cards when each option has a narrative and must read as a unit; a strong comparison often uses cards for the summary and verdict plus a table below for the detail matrix. Never render a four-option comparison as a sideways-scrolling table. Include the badge lines below only if a card contains a badge:
.rc .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));grid-auto-rows:1fr;gap:10px;margin:.9em 0}
.rc .cards.c2{grid-template-columns:repeat(auto-fit,minmax(max(45%,180px),1fr))}
.rc .card,.rc .box{background:var(--surface-2);border:.5px solid var(--border);border-radius:11px;padding:11px 13px}
.rc :is(.card,.box)>:first-child{margin-top:0}.rc :is(.card,.box)>:last-child{margin-bottom:0}
.rc .card h4{margin:0 0 .4em;display:flex;align-items:center;justify-content:space-between;gap:8px}
.rc .card.pick{border-color:var(--text-accent);box-shadow:inset 0 0 0 1px var(--text-accent)}
.rc .box{border-color:var(--border-strong);border-radius:14px;padding:15px 17px;margin:.9em 0}
.rc .lbl{display:inline-block;font-size:.78em;font-weight:700;letter-spacing:.04em;color:var(--text-secondary);background:var(--surface-2);border:.5px solid var(--border);border-radius:20px;padding:1px 11px;margin-bottom:.5em}
.rc :is(.card,.box) :is(.kpi,pre,code,.badge,.lbl,.flow .s,.bar .t,.scroll-table,.scroll-table thead th){background:var(--surface-1)}
.rc :is(.card,.box) tbody tr:hover td{background:var(--surface-1)}
.rc :is(.card,.box) .tl>div::before{outline-color:var(--surface-2)}
.rc :is(.card,.box) .badge.ok,.rc :is(.card,.box) .badge.info{background:var(--bg-accent)}
.rc :is(.card,.box) .badge.warn{background:var(--bg-danger)}
@media print{.rc :is(.card,.box){background:none;border-color:var(--border)}.rc :is(.card,.box) :is(.kpi,.flow .s,.scroll-table thead th,.lbl){background:none}.rc .card,.rc .cols>div{break-inside:avoid}}

COLS — 2-3 blocks side by side that stack when there is no room, for pros vs cons, before vs after, option vs option: <div class="cols"><div><h4>pros</h4><ul>…</ul></div><div><h4>cons</h4><ul>…</ul></div></div>. Never fake this with a two-row table:
.rc .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:.9em 0}
.rc .cols>div>:first-child{margin-top:0}.rc .cols>div>:last-child{margin-bottom:0}

QUOTE — a real citation, with an optional source line: <blockquote><p>quoted text</p><cite>source</cite></blockquote>. Use this for quotations instead of a `cal note` callout, which means "callout", not "quote". Stays upright on purpose: italic Persian renders badly:
.rc blockquote{margin:.9em 0;padding-inline-start:12px;border-inline-start:2.5px solid var(--border-strong);color:var(--text-secondary);font-style:normal}
.rc blockquote cite{display:block;margin-top:.3em;font-size:.85em;font-style:normal}

SRC — a small caption directly under a table or chart ("source: …", "not measured"), hugging the element above it: <div class="src">source: …</div>:
.rc .src{font-size:.8em;color:var(--text-secondary);margin:-.4em 0 .9em}

NUMBERED — for a long document: wrap everything after the <h2> title and the summary box in <div class="numbered">…</div>. Then h3 takes a section number in place of its square dot and h4 takes an N.M sub-number that resets per section. Only headings that are DIRECT children of the wrapper are numbered, so a card or column <h4> keeps its own title. The numbers come from CSS counters, so NEVER hand-write them; numerals follow the reply's direction (Persian digits in RTL, Latin in LTR):
.rc .numbered{counter-reset:sec}
.rc .numbered>h3{counter-increment:sec;counter-reset:sub}
.rc .numbered>h3::before{content:counter(sec,persian) '.';width:auto;height:auto;margin-inline-end:0;border-radius:0;background:none;color:var(--text-accent);font-weight:800;font-size:1.05em;flex:0 0 auto}
.rc .numbered>h4{counter-increment:sub}
.rc .numbered>h4::before{content:counter(sec,persian) '.' counter(sub,persian);color:var(--text-accent);font-weight:800;margin-inline-end:7px}
.rc:dir(ltr) .numbered>h3::before{content:counter(sec) '.'}
.rc:dir(ltr) .numbered>h4::before{content:counter(sec) '.' counter(sub)}

SECTIONS — add `sections` beside `numbered` on the same wrapper (<div class="numbered sections">) when the sections are long enough that a reader scrolling fast would miss where one ends. Every direct-child h3 then gets a hairline rule above it, room to breathe and one size up. Nothing per heading, and the section numbers are untouched:
.rc .sections>h3{font-size:1.25em;margin-top:2.4em;padding-top:1.2em;border-top:1px solid var(--border-strong)}
.rc .sections>h3:first-of-type{margin-top:1.4em;padding-top:0;border-top:none}

PREVIEW — a link to ANOTHER DOCUMENT, drawn as a document instead of a kv row: <a class="preview" href="…"><b>title</b><span>one line of context</span><small>host</small></a>. Use it when the link IS the point (a spec, a prototype, a related report); a link inside a sentence stays a plain <a>. The host is the bare domain, no scheme and no path:
.rc .preview{display:block;position:relative;background:var(--surface-2);border:.5px solid var(--border);border-radius:11px;margin:.9em 0}
.rc a.preview{padding:9px 13px;padding-inline-end:30px;color:var(--text-primary)}
.rc .preview b{display:block;font-weight:700;color:var(--text-accent)}
.rc .preview span{display:block;font-size:.92em;color:var(--text-secondary)}
.rc .preview small{display:block;font-size:.78em;color:var(--text-secondary);unicode-bidi:isolate;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.15em}
.rc a.preview::after{content:'';position:absolute;inset-inline-end:13px;top:calc(50% - 4px);width:6px;height:6px;border-top:1.5px solid var(--text-accent);border-inline-end:1.5px solid var(--text-accent);border-start-end-radius:1px;transform:rotate(45deg)}
.rc a.preview:dir(rtl)::after{transform:rotate(-45deg)}
.rc a.preview:hover{border:.5px solid var(--text-accent);background:var(--bg-accent)}

Pick the lightest structure that fits the content: a short conversational answer is plain paragraphs with zero components, and no component is ever used just because the kit has it. When content genuinely benefits, numbers get kpi/bars/spark/donut, sequences get flow/tl, comparisons get a table, list-shaped content gets ul/ol/kv, and one callout may hold the single most important takeaway. A long structured answer reads best opened with <h2> plus one <p class="lead"> and an <h3> per section. One bidi caveat: an RTL line that must START with a Latin token needs &rlm; prefixed (or lead with an RTL word) to stay right-to-left.

The show_widget call IS the whole reply. Output nothing after it: no plain-text version, no summary, no "here is the answer" line. NEVER repeat the content as plain text, even if you suspect the card did not render (it does; plain Persian text would only scramble). If the user says a card came out blank, tell them in one English line to update the readable plugin and restart, and stop; do not paste the answer as plain text.

Keep any unavoidable chat text outside the widget short and in English. Very short replies (1-2 plain sentences, no code): skip the widget, answer as BiDi-safe plain text (start each line with a strong RTL character, no trailing Latin token). Build an SVG diagram (readable:visualize skill) only when the user explicitly asks to see something visual.
</readable-widget-kit>
