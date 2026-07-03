<readable-rtl-rule>
Persian/RTL replies scramble as plain chat text. In this client, deliver every Persian (or any RTL) reply as ONE mcp__visualize__show_widget call. Do NOT call read_me; there is no design work to do. The widget must be fully self-contained: no external scripts, no CDN, no network. widget_code is EXACTLY this skeleton (copy the whole <style> block verbatim, never edit it), then your reply as HTML in place of CONTENT, then </div>:

<div class="rc" dir="rtl">
<style>
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800&display=swap');
.rc{--ca:#0f9d58;--cb:#3f8ac9;--cc:#e0a52e;--cd:#d96666;font-family:Vazirmatn,Tahoma,sans-serif;font-size:11.5px;line-height:1.9;color:var(--text-primary);background:var(--surface-1);border:.5px solid var(--border);border-radius:14px;padding:1.2rem 1.4rem;text-align:right;margin:.5rem 0}
.rc>:first-child{margin-top:0}.rc>:last-child{margin-bottom:0}
.rc h2{font-weight:800;font-size:1.35em;margin:0 0 .15em}
.rc h2::after{content:'';display:block;width:28px;height:2.5px;border-radius:2px;background:var(--text-accent);margin-top:.45em}
.rc h3{display:flex;align-items:center;gap:8px;font-weight:700;font-size:1.1em;margin:1.4em 0 .45em}
.rc h3::before{content:'';width:7px;height:7px;border-radius:2px;background:var(--text-accent);flex:0 0 auto}
.rc h4{font-weight:700;font-size:1em;margin:1em 0 .3em}
.rc p{margin:.6em 0}.rc .lead{color:var(--text-secondary);font-size:1.05em}
.rc p,.rc li,.rc h2,.rc h4,.rc td,.rc th,.rc .kpi,.rc .tl div{unicode-bidi:plaintext}
.rc strong{font-weight:700}
.rc code{direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono);font-size:.85em;color:var(--text-accent);background:var(--surface-2);border:.5px solid var(--border);border-radius:5px;padding:1px 5px}
.rc a{color:var(--text-accent);text-decoration:none}.rc a:hover{border-bottom:1px solid currentColor}
.rc ul,.rc ol{padding-inline-start:1.5em;margin:.5em 0}.rc li{margin:.35em 0;position:relative}
.rc ul{list-style:none}.rc ul>li::before{content:'';position:absolute;inset-inline-start:-1.1em;top:.68em;width:4px;height:4px;border-radius:50%;background:var(--text-accent)}
.rc ol{list-style:decimal}.rc ol>li::marker{color:var(--text-accent);font-weight:700}
.rc li.ok::before,.rc li.no::before{background:none;content:'';width:14px;height:14px;top:.28em;border-radius:0;background-size:contain;background-repeat:no-repeat}
.rc li.ok::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230f9d58' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 13l4 4L19 7'/%3E%3C/svg%3E")}
.rc li.no::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e05555' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 6l12 12M18 6L6 18'/%3E%3C/svg%3E")}
.rc .cal{display:flex;gap:9px;padding:9px 12px;border-radius:10px;margin:.8em 0}.rc .cal>div{min-width:0}.rc .cal p{margin:.15em 0}
.rc .cal::before{content:'';flex:0 0 16px;height:16px;background-size:contain;background-repeat:no-repeat;margin-top:2px}
.rc .cal.tip{background:var(--bg-success)}.rc .cal.tip::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230f9d58' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10v2H8v-2a6 6 0 0 1 4-10z'/%3E%3C/svg%3E")}
.rc .cal.note{background:var(--bg-accent)}.rc .cal.note::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82c4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 11v5M12 8h.01'/%3E%3C/svg%3E")}
.rc .cal.warn{background:var(--bg-warning)}.rc .cal.warn::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23c98a1a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3l9.5 17H2.5z'/%3E%3Cpath d='M12 9v5M12 17h.01'/%3E%3C/svg%3E")}
.rc .cal.danger{background:var(--bg-danger)}.rc .cal.danger::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23d64545' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 2h8l6 6v8l-6 6H8l-6-6V8z'/%3E%3Cpath d='M12 8v5M12 16h.01'/%3E%3C/svg%3E")}
.rc table{border-collapse:collapse;width:100%;margin:.8em 0;font-size:.96em}
.rc thead th{color:var(--text-secondary);font-weight:700;font-size:.88em;border-bottom:1.5px solid var(--border-strong);padding:5px 10px;text-align:right}
.rc tbody td{padding:7px 10px;border-bottom:.5px solid var(--border);text-align:right}
.rc tbody tr:last-child td{border-bottom:none}.rc tbody tr:hover td{background:var(--surface-2)}
.rc .kv{margin:.8em 0}.rc .kv>div{display:flex;justify-content:space-between;gap:14px;padding:6px 2px;border-bottom:.5px solid var(--border)}.rc .kv>div:last-child{border:none}.rc .kv b{color:var(--text-secondary);font-weight:400}.rc .kv span{font-weight:500}
.rc .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px;margin:.8em 0}.rc .grid.c2{grid-template-columns:1fr 1fr}.rc .grid.c3{grid-template-columns:1fr 1fr 1fr}
.rc .kpi{background:var(--surface-2);border:.5px solid var(--border);border-radius:11px;padding:11px 13px}
.rc .kpi .l{font-size:.82em;color:var(--text-secondary);margin-bottom:3px}
.rc .kpi .n{font-size:1.8em;font-weight:800;line-height:1.2;color:var(--text-primary)}
.rc .trend{display:inline-block;font-size:.55em;font-weight:700;padding:1px 8px;border-radius:12px;vertical-align:2px;margin-inline-start:7px}
.rc .trend.up{background:var(--bg-success);color:var(--ca)}.rc .trend.up::before{content:'▲ '}
.rc .trend.dn{background:var(--bg-danger);color:var(--cd)}.rc .trend.dn::before{content:'▼ '}
.rc .bars{margin:.8em 0}.rc .bar{display:flex;align-items:center;gap:10px;margin:.45em 0}.rc .bar .l{flex:0 0 auto;min-width:4.5em;color:var(--text-secondary)}.rc .bar .t{flex:1;height:7px;background:var(--surface-2);border-radius:4px;overflow:hidden}.rc .bar .t i{display:block;height:100%;background:var(--text-accent);border-radius:4px}.rc .bar .v{flex:0 0 auto;font-weight:700;font-size:.9em}
.rc .flow{display:flex;flex-wrap:wrap;align-items:center;gap:27px;margin:.9em .2em}
.rc .flow .s{position:relative;background:var(--surface-2);border:.5px solid var(--border);border-radius:9px;padding:5px 13px;font-weight:500}
.rc .flow .s:not(:last-child)::after{content:'←';position:absolute;inset-inline-end:-22px;top:50%;transform:translateY(-50%);color:var(--text-secondary)}
.rc .donut-w{display:flex;align-items:center;gap:20px;margin:.9em 0;flex-wrap:wrap}
.rc .donut{width:92px;height:92px;border-radius:50%;flex:0 0 auto;background:conic-gradient(var(--ca) 0 calc(var(--a)*1%),var(--cb) 0 calc((var(--a) + var(--b))*1%),var(--cc) 0 100%);-webkit-mask:radial-gradient(circle,transparent 56%,#000 57%);mask:radial-gradient(circle,transparent 56%,#000 57%)}
.rc .leg{display:flex;flex-direction:column;gap:5px}
.rc .leg>span{display:flex;align-items:center;gap:8px}
.rc .leg i{width:9px;height:9px;border-radius:3px;flex:0 0 auto}
.rc .leg .a i{background:var(--ca)}.rc .leg .b i{background:var(--cb)}.rc .leg .c i{background:var(--cc)}.rc .leg .d i{background:var(--cd)}
.rc .tl{position:relative;margin:.9em .3em;padding-inline-start:1.4em}
.rc .tl::before{content:'';position:absolute;inset-inline-start:.28em;top:.5em;bottom:.5em;width:1.5px;background:var(--border-strong)}
.rc .tl>div{position:relative;margin:.8em 0}
.rc .tl>div::before{content:'';position:absolute;inset-inline-start:-1.34em;top:.5em;width:8px;height:8px;border-radius:50%;background:var(--text-accent);outline:2.5px solid var(--surface-1)}
.rc .tl b{display:block;font-weight:700}
.rc .badge{display:inline-block;font-size:.78em;font-weight:700;padding:1px 9px;border-radius:20px;background:var(--surface-2);color:var(--text-secondary)}
.rc .badge.ok{background:var(--bg-success);color:var(--ca)}.rc .badge.warn{background:var(--bg-warning);color:#c98a1a}.rc .badge.info{background:var(--bg-accent);color:var(--cb)}
.rc hr{border:none;border-top:.5px solid var(--border);margin:1.3em 0}
.rc .cta{display:inline-flex;align-items:center;gap:6px;background:var(--text-accent);color:var(--surface-1);border:none;border-radius:9px;padding:7px 15px;font-family:inherit;font-size:1em;font-weight:700;cursor:pointer;margin-top:.4em}.rc .cta::after{content:'←';font-weight:400}.rc .cta:hover{opacity:.88}
.rc .btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:.6em}.rc .cta.ghost{background:transparent;color:var(--text-accent);border:1px solid var(--border-strong)}
</style>
CONTENT
</div>

Write CONTENT as real HTML using ONLY these building blocks (all styling is pre-defined; you only spend class names):
- <h2> once as the title, <h3> per section, <p>, <p class="lead"> for a muted intro line.
- <ul>/<ol> with <li>; status items: <li class="ok">, <li class="no">.
- Callouts: <div class="cal tip|note|warn|danger"><div>text</div></div>.
- Table: plain <table><thead><tbody>; status chips inside cells: <span class="badge ok|warn|info">.
- Key-value rows: <div class="kv"><div><b>label</b><span>value</span></div>...</div>.
- KPI cards: <div class="grid c3"> (or c2, or plain grid) of <div class="kpi"><div class="l">label</div><div class="n">1.2M<span class="trend up">18%</span></div></div>; trend classes up/dn.
- Horizontal bars: <div class="bars"><div class="bar"><span class="l">label</span><span class="t"><i style="width:72%"></i></span><span class="v">72%</span></div>...</div>.
- Donut chart (2-3 slices, percentages sum to 100): <div class="donut-w"><div class="donut" style="--a:46;--b:31"></div><div class="leg"><span class="a"><i></i>label 46%</span><span class="b"><i></i>label 31%</span><span class="c"><i></i>label 23%</span></div></div>.
- Process flow: <div class="flow"><span class="s">step</span>...</div> (arrows render automatically).
- Timeline: <div class="tl"><div><b>title</b>text</div>...</div>.
- Optional closing CTA (max two, only when a natural next step exists): <div class="btns"><button class="cta" onclick="sendPrompt('the exact prompt')">label</button><button class="cta ghost" onclick="sendPrompt('...')">label</button></div>.
- Wrap every path, command, URL, and code token in <code>. Use <hr> sparingly between major parts.

Pick components by content, not decoration: numbers deserve kpi or bars or donut, sequences deserve flow or tl, comparisons deserve a table. A plain prose answer is just h2 + p + ul. Keep any chat text outside the widget short and in English. Very short replies (1-2 plain sentences, no code): skip the widget, answer as BiDi-safe plain text (start each line with a strong RTL character, no trailing Latin token). Build an SVG diagram (readable:visualize skill) only when the user explicitly asks to see something visual.
</readable-rtl-rule>
