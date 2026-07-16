<!-- INACTIVE hosted-CSS variant (Tier 2). Activate by pointing hooks/hooks.json at this file (or overwriting rule.md with it) AFTER assets/rc.css is pushed to GitHub main, so the jsDelivr URL below resolves. Verified 2026-07: the widget sandbox loads external stylesheets. -->
<readable-rtl-rule>
Persian/RTL replies scramble as plain chat text. In this client, deliver every Persian (or any RTL) reply as ONE mcp__visualize__show_widget call. Do NOT call read_me; there is no design work to do. widget_code is EXACTLY this skeleton (copy the BASE style block verbatim, never edit it), then your reply as HTML in place of CONTENT, then </div>:

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
.rc code{display:inline-block;direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono);font-size:.85em;color:var(--text-accent);background:var(--surface-2);border:.5px solid var(--border);border-radius:5px;padding:1px 5px}
.rc a{color:var(--text-accent);text-decoration:none}.rc a:hover{border-bottom:1px solid currentColor}
.rc ul,.rc ol{padding-inline-start:1.5em;margin:.5em 0}.rc li{margin:.35em 0;position:relative}
.rc ul{list-style:none}.rc ul>li::before{content:'';position:absolute;inset-inline-start:-1.1em;top:.68em;width:4px;height:4px;border-radius:50%;background:var(--text-accent)}
.rc ol{list-style:decimal}.rc ol>li::marker{color:var(--text-accent);font-weight:700}
.rc li.ok::before,.rc li.no::before{content:'✓';background:none;width:auto;height:auto;top:0;inset-inline-start:-1.35em;font-weight:800;font-size:1em;line-height:inherit;color:var(--ca)}
.rc li.no::before{content:'✕';color:#e05555}
.rc .cal{display:flex;gap:9px;padding:9px 12px;border-radius:10px;margin:.8em 0;border-inline-start:3px solid var(--border-strong)}.rc .cal>div{min-width:0}.rc .cal p{margin:.15em 0}
.rc .cal.tip{background:var(--bg-success);border-color:var(--ca)}.rc .cal.note{background:var(--bg-accent);border-color:var(--cb)}.rc .cal.warn{background:var(--bg-warning);border-color:#c98a1a}.rc .cal.danger{background:var(--bg-danger);border-color:#d64545}
.rc hr{border:none;border-top:.5px solid var(--border);margin:1.3em 0}
</style>
CONTENT
</div>

BASE already styles all text content: <h2> once as the title; <h3> per section; <p>; <p class="lead"> for a muted intro line; <ul>/<ol>; status items <li class="ok">/<li class="no">; callouts <div class="cal tip|note|warn|danger"><div>text</div></div>; <a>; <strong>; <hr> sparingly; and <code> wrapped around every path, command, URL, and code token (it renders LTR-isolated).

If CONTENT uses ANY component below, add exactly this one line right before </style> (it loads all component CSS from CDN; BASE keeps the card readable if the CDN is unreachable):
@import url('https://cdn.jsdelivr.net/gh/smk-labs/claude-plugins@main/plugins/readable/assets/rc.css');

Components (HTML shapes only; their CSS comes from that import):
- Table: plain <table><thead><tbody>; status chips inside cells: <span class="badge ok|warn|info">. 10+ row stat tables: <table class="zebra dense"> (striped rows + tight padding, combinable). Long tables (100+ rows): wrap as <div class="scroll-table"><table>...</table></div> (scrollbox with pinned header; expands fully in print).
- Key-value rows: <div class="kv"><div><b>label</b><span>value</span></div>...</div>.
- KPI cards: <div class="grid c3"> (or c2, or plain grid) of <div class="kpi"><div class="l">label</div><div class="n">1.2M<span class="trend up">18%</span></div></div>; trend classes up/dn. Optional compact caveat under the number: <div class="f">one short line</div> last inside the kpi.
- Horizontal bars: <div class="bars"><div class="bar"><span class="l">label</span><span class="t"><i style="width:72%"></i></span><span class="v">72%</span></div>...</div>.
- Two-metric bar (total + subset overlay): <div class="bar duo"><span class="l">label</span><span class="t"><i style="width:80%"></i><i style="width:52%"></i></span><span class="v">98h / 51h</span></div> (first <i> = total, second = subset; widths % of the row max). Name both colors once in a legend first inside .bars: <div class="leg"><span class="a"><i></i>total</span><span class="b"><i></i>subset</span></div> (donut legend classes).
- Donut (2-4 slices summing to 100, legend classes a/b/c/d): <div class="donut-w"><div class="donut" style="--a:46;--b:31"></div><div class="leg"><span class="a"><i></i>label 46%</span><span class="b"><i></i>label 31%</span><span class="c"><i></i>label 23%</span></div></div>.
- Process flow: <div class="flow"><span class="s">step</span>...</div> (arrows render automatically).
- Timeline: <div class="tl"><div><b>title</b>text</div>...</div>.
- Optional closing CTA (max two, only when a natural next step exists): <div class="btns"><button class="cta" onclick="sendPrompt('the exact prompt')">label</button><button class="cta ghost" onclick="sendPrompt('...')">label</button></div>.

Pick the lightest structure that fits the content: a short conversational answer is plain paragraphs with zero components, and no component is ever used just because the kit has it. When content genuinely benefits, numbers get kpi/bars/donut, sequences get flow/tl, comparisons get a table, list-shaped content gets ul/ol/kv, and one callout may hold the single most important takeaway. A long structured answer reads best opened with <h2> plus one <p class="lead"> and an <h3> per section. One bidi caveat: an RTL line that must START with a Latin token needs &rlm; prefixed (or lead with an RTL word) to stay right-to-left.

The show_widget call IS the whole reply. Output nothing after it: no plain-text version, no summary, no "here is the answer" line. NEVER repeat the content as plain text, even if you suspect the card did not render (it does; plain Persian text would only scramble). If the user says a card came out blank, tell them in one English line to update the readable plugin and restart, and stop; do not paste the answer as plain text.

Keep any unavoidable chat text outside the widget short and in English. Very short replies (1-2 plain sentences, no code): skip the widget, answer as BiDi-safe plain text (start each line with a strong RTL character, no trailing Latin token). Build an SVG diagram (readable:visualize skill) only when the user explicitly asks to see something visual.
</readable-rtl-rule>
