<!-- readable BLOCK VOCABULARY — SINGLE SOURCE.

     What the model is told it may build a card out of. Every delivery path
     reads it from here:
       tier 1   server/blocks.js assembles the `card` tool's description
       tier 2   tools/gen-kit.js writes hooks/kit.md and hooks/kit-inline.md
     Until 6.7.0 each path carried its own hand-written copy and all three had
     drifted: the card tool documented cards/box/cols/quote/src/icons and the
     kits did not; the kits documented zebra/donut/hub/fold/preview/numbered and
     the card tool did not; the offline kit alone carried the craft notes. Same
     kit, three different vocabularies, depending on which host the user was on.

     SECTIONS are named by `<!--@name-->` markers and assembled per tier:
       lead tierN + text + components + guidance + close tierN

     COMPONENTS are one `### TAG` entry each, and TAG is the marker rc.css uses
     for that component's CSS. Pairing them by name is what lets the generator
     put a snippet next to its own prose, and what lets test.js prove the sheet
     and this file describe the same set — a component in one and not the other
     is the drift this file exists to end.

       shape:   the HTML contract. Goes to EVERY tier, because a class that is
                not in assets/rc.css renders unstyled.
       notes:   craft guidance. Tier 2 only, where the file is read on demand;
                the tier 1 description sits in every session's context whether a
                card is drawn or not, so it stays shapes.
       covers:  extra @TAGs whose CSS ships with this entry (a variant, or a
                dependency this entry already explains).
       tier: 2  advertised in the tier 2 kits alone, same reason as notes.
       tier: r  a standalone report only; neither chat tier offers it.
       skip:    a path this entry must not reach, with the reason.

     Edit prose freely. Edit a shape only alongside the sheet. -->

<!--@lead tier1-->
ALWAYS use this tool to deliver ANY reply written in Persian or another RTL language (plain RTL chat text scrambles; this renders it as a correct styled card), and PREFER it for English conversational, explanatory, or structured answers too. Skip it only for replies dominated by code blocks, diffs, or logs. Call it exactly once per reply, with the ENTIRE reply as the html argument; the call IS the reply, so output no reply text before or after it. Send content only: NO <style>, NO <script>, NO wrapper div — the template styles everything, light and dark.

<!--@lead tier2-->
The kit draws NO frame of its own: no border, no radius, no background. The widget host already draws one, and a card inside it was rendering as a box inside a box. Do not add them back; if a card ever needs to stand alone, that is the tier 1 template's job.

<!--@skeleton cdn-->
Deliver the reply as ONE mcp__visualize__show_widget call. Do NOT call read_me; there is no design work to do. widget_code is EXACTLY this skeleton (copy the BASE style block verbatim, never edit it), then your reply as HTML in place of CONTENT, then </div>:

{{SKELETON}}

<!--@skeleton inline-->
Deliver the reply as ONE mcp__visualize__show_widget call. Do NOT call read_me; there is no design work to do. The widget must be fully self-contained: no scripts of any kind and no external resources; the single exception is the Google Fonts @import already inside the kit, which degrades to system fonts when unreachable. widget_code is EXACTLY this skeleton (copy the BASE style block verbatim, never edit it), then your reply as HTML in place of CONTENT, then </div>:

{{SKELETON}}

<!--@css cdn-->
If CONTENT uses ANY component below, add exactly this one line right before </style>. It loads every component's CSS from the CDN, and BASE keeps the card readable if the CDN is unreachable:
{{IMPORT}}

Components (HTML shapes only; their CSS comes from that import):

<!--@css inline-->
Everything else is pay-per-use. Each component below carries its own CSS snippet: for EVERY component CONTENT uses, copy that snippet verbatim into the same <style>, right before </style>. Snippets are independent, order does not matter, and none of them is ever edited. If unsure whether a component is used, include its snippet — missing CSS renders unstyled — but never paste a snippet for a component CONTENT does not use.

<!--@text-->
Text blocks, styled with no class of their own: <h2> once as the title; <h3> per section; <h4> under it; <p>; <p class="lead"> for a muted intro line; <ul>/<ol>; status items <li class="ok"> and <li class="no">; callouts <div class="cal tip|note|warn|danger"><div>text</div></div>; <a>; <strong>; <hr> sparingly; <code> around every inline path, command, URL and code token (it renders LTR-isolated); and <pre><code>…</code></pre> for multiline code (also LTR).

<!--@components-->

### TABLE
covers: ZEBRA
shape: Comparison tables, plain <table><thead><tbody>; status chips inside cells <span class="badge ok|warn|info">. 10+ row stat tables: <table class="zebra dense"> (striped rows + tight padding, combinable). Long tables (100+ rows): wrap as <div class="scroll-table"><table>…</table></div> for a scrollbox with a pinned header. Very wide tables: <div class="scroll-table wide"> keeps cells on one line and scrolls sideways.
notes: Both scroll variants expand fully in print, so nothing is lost on paper.

### KV
shape: Key-value rows: <div class="kv"><div><b>label</b><span>value</span></div>…</div>.

### KPI
shape: Stat cards: <div class="grid c3"> (or c2, or plain grid) of <div class="kpi"><div class="l">label</div><div class="n">1.2M<span class="trend up">18%</span></div></div>; trend classes up/dn. Optional compact caveat under the number: <div class="f">one short line</div> last inside the kpi.

### BARS
shape: Horizontal bars: <div class="bars"><div class="bar"><span class="l">label</span><span class="t"><i style="width:72%"></i></span><span class="v">72%</span></div>…</div>. Two-metric bar (total + subset overlay): <div class="bar duo"> with TWO <i> in the track (first the total, second the subset, widths % of the row max) and a value like "98h / 51h"; name both colours once in a legend first inside .bars: <div class="leg"><span class="a"><i></i>total</span><span class="b"><i></i>subset</span></div>.

### SPARK
shape: Trend sparkline for a time series: <div class="spark"><svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="0,26 25,19 50,22 75,10 100,4"/></svg><div class="x"><span>oldest</span><span>newest</span></div></div>. x is evenly spaced 0..100 oldest→newest and y is inverted so 2≈max and 28≈min, both computed from the data. Optional area fill: prepend <polygon points="0,30 …the same points… 100,30"/>. Optional second series: append <polyline class="s2" points="…"/>.
notes: Two to five x labels, no more: they are the axis, not a legend.

### FLOW
shape: Process steps, arrows drawn automatically: <div class="flow"><span class="s">step</span>…</div>.

### TL
shape: Timeline: <div class="tl"><div><b>title</b>text</div>…</div>.

### HUB
shape: One thing connected to many: <div class="hub"><div class="c">centre<span>note</span></div><div class="s">reads from this<span>note</span></div><div class="s out">writes to this</div>…</div>. Flat markup: the <div class="c"> first, then the items as <div class="s">, each with an optional <span> for a muted second line. Nine items or more is a tree: <div class="hub tree"> is a root, branches and leaves with no arrows, for items that GROUP, and a branch may nest its own <div class="s"> children.
notes: No other component draws this — FLOW is a sequence, TL a chronology, CARD a comparison. `out` flips one leg's arrow to point AWAY from the centre, which is the whole difference between "reads from" and "writes to", never a second colour. Keep labels short: a leg is 12em wide. The ring holds eight, so nine items is the line where a hub becomes a tree.

### BADGE
shape: Status chips: <span class="badge ok|warn|info">, mostly inside table cells.

### CTA
shape: Closing buttons, max two, only when a natural next step exists: <div class="btns"><button class="cta" onclick="sendPrompt('the exact prompt')">label</button><button class="cta ghost" onclick="sendPrompt('…')">label</button></div>.

### CARD
covers: BOX
shape: A repeatable unit of content with a free-form body (prose, a list, a kv, a badge): <div class="cards"><div class="card"><h4>title<span class="badge ok">chip</span></h4><p>…</p></div>…</div>. Add c2 to the wrapper for exactly two per row, and mark a recommended option <div class="card pick">. BOX is the same panel full-width, for one standout block such as an executive summary or a verdict, with an optional <div class="lbl">eyebrow</div> above its heading.
notes: The grid reflows to one column on a narrow screen and gives every card the same height. c2 is what a four-option comparison wants (2x2, no orphan card). A TABLE wins when you compare many attributes across few options and column alignment matters; CARDS win when each option has a narrative that must read as a unit; a strong comparison often uses cards for the summary and verdict plus a table below for the detail matrix. Never render a four-option comparison as a sideways-scrolling table.

### COLS
shape: Two or three blocks side by side that stack when there is no room: <div class="cols"><div><h4>pros</h4><ul>…</ul></div><div><h4>cons</h4><ul>…</ul></div></div>.
notes: For pros vs cons, before vs after, option vs option. Never fake this with a two-row table.

### QUOTE
shape: A real citation, with an optional source line: <blockquote><p>quoted text</p><cite>source</cite></blockquote>.
notes: Use it for quotations instead of a `cal note` callout, which means "callout", not "quote". It stays upright on purpose: italic Persian renders badly.

### SRC
shape: A small caption directly under a table or chart, hugging the element above it: <div class="src">source: …</div>.

### FIG
tier: r
shape: A screenshot, a diagram, or a looping /fig animation: <figure><img src="…"><figcaption>caption</figcaption></figure>.

### PREVIEW
shape: A link to ANOTHER DOCUMENT, drawn as a document instead of a kv row: <a class="preview" href="…"><b>title</b><span>one line of context</span><small>host</small></a>.
notes: Use it when the link IS the point (a spec, a prototype, a related report); a link inside a sentence stays a plain <a>. Write the host as the bare domain, no scheme and no path.

### NUMBERED
tier: 2
shape: For a long document: wrap everything after the <h2> title and the summary box in <div class="numbered">…</div>. h3 then takes a section number in place of its square dot, and h4 an N.M sub-number that resets per section.
notes: Only headings that are DIRECT children of the wrapper are numbered, so a card or column <h4> keeps its own title. The numbers come from CSS counters, so NEVER hand-write them; numerals follow the reply's direction (Persian digits in RTL, Latin in LTR).

### SECTIONS
tier: 2
shape: Add `sections` beside `numbered` on the same wrapper — <div class="numbered sections"> — and every direct-child h3 gets a hairline rule above it, room to breathe and one size up. Nothing per heading.
notes: Use it when the sections are long enough that a reader scrolling fast would otherwise miss where one ends. The section numbers are untouched.

### TABS
tier: r
shape: A pinned bar over a long report's main sections: <div class="tabs"><a href="#s1">label</a>…</div>.

### DONUT
tier: 2
shape: Donut chart, 2-4 slices summing to 100, legend classes a/b/c/d: <div class="donut-w"><div class="donut" style="--a:46;--b:31"></div><div class="leg"><span class="a"><i></i>label 46%</span><span class="b"><i></i>label 31%</span><span class="c"><i></i>label 23%</span></div></div>.

### FOLD
tier: 2
shape: Collapsible block, closed by default, native and JS-free: <details class="fold"><summary>label</summary>…blocks…</details>. Content is normal blocks (<p>, <pre>, <ul>, <table>).
notes: For long content the reader wants on demand — a full run log, a raw payload, a long quote — never as a substitute for sections or tables. One level of nesting is fine.

### ICON
skip: inline — the snippet carries a 2KB inline SVG sprite, and transcribing that verbatim is a corruption risk no icon is worth. Icons stay on the paths where the CSS is injected rather than copied.
shape: <i class="ic NAME"></i> inherits the surrounding text colour and size, and in a heading it replaces the section dot. NAME is one of check x alert info clock user file folder code terminal git db zap shield search link.
notes: Only where it carries meaning.

<!--@guidance-->
Content that has a shape gets DRAWN, not described: numbers get kpi/bars/spark, sequences get flow/tl, a system or several related things get hub (hub tree once they group), comparisons get a table, list-shaped content gets ul/ol/kv, repeatable units with a narrative get cards, and one callout may hold the single most important takeaway. Three paragraphs walking through steps is a flow you did not draw, and a bulleted list of parts is a hub with its connections thrown away. The limit is decoration, not restraint: a short conversational answer is plain paragraphs with zero components, and nothing is used just because the kit has it.

A long structured answer reads best opened with <h2> plus one <p class="lead"> and an <h3> per section. Open with the substance: NO cover-page preamble (no owner/subject/prepared-by/audience/date/status kv block at the top) — the first line is the answer itself, and the <h2> already titles it.

One bidi caveat: an RTL line that must START with a Latin token needs &rlm; prefixed (or lead with an RTL word) to stay right-to-left.

<!--@close tier1-->
FILE MODE: when a background worker/delegate has ALREADY written its report as card-block HTML to a file ending in -card.html, pass htmlFile (the absolute path) INSTEAD of html — the card renders straight from the file and its HTML never passes through your context. Do not read the file or copy its content into html. Pass exactly one of html | htmlFile.

BRAND: if the session rule announces a project brand dir, ALSO pass brand (that absolute path) on every call — the card then renders in the project's own palette.

<!--@close tier2-->
CONTENT always ENDS with this exact line, last thing inside the card, copied verbatim and never edited or translated (it is the readable signature; every other path injects it automatically, and this is the one path where you type it):
{{SIGNATURE}}

The show_widget call IS the whole reply. Output nothing after it: no plain-text version, no summary, no "here is the answer" line. NEVER repeat the content as plain text, even if you suspect the card did not render (it does; plain Persian text would only scramble). If the user says a card came out blank, tell them in one English line to update the readable plugin and restart, and stop; do not paste the answer as plain text.

Keep any unavoidable chat text outside the widget short and in English. Very short replies (1-2 plain sentences, no code): skip the widget, answer as BiDi-safe plain text (start each line with a strong RTL character, no trailing Latin token). Build an SVG diagram (readable:visualize skill) only when the user explicitly asks to see something visual.
