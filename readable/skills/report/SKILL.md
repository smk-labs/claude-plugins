---
name: report
description: Export a reply or chat card as a standalone styled HTML report file, in the exact readable card template (Persian RTL with Vazirmatn, or English LTR with Inter). Use ONLY when the user explicitly asks to save, export, file, or extend THE CURRENT widget/card ("همین کارت رو ذخیره کن", "کامل‌ترش رو به‌صورت فایل بساز", "save this card as a report") or invokes /readable:report directly. NEVER auto-trigger on generic report-writing requests ("گزارش بساز", "write a report") that do not mention saving a file or this template.
---

# report: the chat card, as a standalone HTML file

One goal: the saved report looks EXACTLY like the chat cards. You never design, never write CSS; a script injects the kit.

## Workflow

1. **Collect content.** If the user is exporting an existing card, reuse that card's CONTENT HTML verbatim, then apply only the changes they asked for (extend, add sections, more detail). Otherwise write fresh content. Building blocks only, no `<style>`, no `<script>`, no wrapper div: `<h2>` once as title, `<p class="lead">`, `<h3>` sections, `<p>`, `<ul>`/`<ol>`, `<li class="ok|no">`, callouts `<div class="cal tip|note|warn|danger"><div>…</div></div>`, `<code>` around every LTR token, `<table>` + `<span class="badge ok|warn|info">` (10+ row stat tables: `<table class="zebra dense">`, striped + tight, combinable; 100+ rows: wrap as `<div class="scroll-table"><table>...</table></div>` for a scrollbox with pinned header that expands fully in print; very wide tables: `<div class="scroll-table wide">` keeps cells on one line and scrolls sideways, wraps again in print), kv, `grid`/`kpi`/`trend` (+ optional compact caveat `<div class="f">` last inside a kpi), `bars` (+ two-metric total/subset overlay `<div class="bar duo">` with two `<i>` in the track, first total second subset, both colors named once in a `<div class="leg">` first inside `.bars`: `<span class="a"><i></i>total</span><span class="b"><i></i>subset</span>`), `spark` (trend sparkline, same SVG contract as chat cards), `donut`, `flow`, `tl`, `hub` (one centre, up to eight arrowed legs; `<div class="hub"><div class="c">centre<span>note</span></div><div class="s">item</div><div class="s out">item</div></div>`, where `out` turns one leg's arrow around to separate "reads from" from "writes to"), `hub tree` (same markup plus `tree`: a root, branches and leaves, no arrows, for items that group; a branch may nest its own `<div class="s">` children, and this is what nine or more items want instead of a hub), `<hr>`, and `fold` — a collapsible block `<details class="fold"><summary>label</summary>…blocks…</details>`, closed by default, native and JS-free, for long content the reader wants on demand (a full run log, a raw payload, a long quote); never a substitute for sections or tables. Its content is normal blocks, one level of nesting is fine, a `<pre>` inside wraps and scrolls vertically instead of stretching the page, and every fold prints open. Also: `cards` — a row of repeatable units, `<div class="cards"><div class="card">…</div>…</div>`, each with a free-form body (prose, a list, a `kv`, a `badge`); add `c2` to the wrapper for exactly two per row, which is what a four-option comparison wants (2x2, no orphan card), and mark the recommended one `<div class="card pick">`. `box` is one full-width card for a standout block, with an optional `<div class="lbl">` eyebrow label above its heading. `cols` — `<div class="cols">` with 2-3 child `<div>`s side by side for pros vs cons or before vs after. `<blockquote>` for a real citation, with an optional `<cite>` line. `<div class="src">` for a small caption directly under a table or chart ("source: …", "not measured"). `<i class="ic NAME"></i>` for a minimal icon in the brand accent, sized from the surrounding text (in an `h3` it replaces the section dot, all-or-none across the report's headings); NAME is one of: check x alert info clock user file folder code terminal git db zap shield search link. `<a class="preview" href="…"><b>title</b><span>one line of context</span><small>host</small></a>` for a link to ANOTHER DOCUMENT, drawn as a document instead of a `kv` row — see **Links out** below. `<figure><img src="shot.png" alt="..."><figcaption>caption</figcaption></figure>` for a screenshot, diagram, or a `/fig` animation — read **Images: when, and when not** below before adding one. `numbered` — see below. All of these reflow or stack on narrow widths and print without wasting ink. ALL components are always available here (the script embeds the full kit), so unlike chat cards there are no snippets to manage. Skip CTA buttons: `sendPrompt` does not exist in a standalone file.
2. **Write the fragment** to a temp file (scratchpad), e.g. `content.html`.
3. **Build:**
   - Persian: `python3 "<this skill dir>/build.py" content.html -o <target>.html`
   - English: add `--lang en` (LTR + Inter automatically)
   - `--title "..."` optional; defaults to the `<h2>` text.
   Default output name if the user gave none: `report-<short-slug>.html` in the project directory (or the path they named).
4. **Deliver:** the script prints the absolute path; report it as a clickable link. Offer to open it in the browser. Do not paste the HTML into chat.

## Cards or a table?

Both compare options. They fail at opposite things, and authors get this backwards.

- A **table** wins when you compare many attributes across few options and column alignment matters. The reader scans down one column to rank everything on that attribute.
- **Cards** win when each option has a narrative and must read as a unit: a sentence of reasoning, a short list, a verdict badge. A row of a table cannot hold a paragraph.
- The best comparison layouts use **both**: cards for the summary and the verdict, a table below for the detail matrix.
- Do NOT turn a four-option comparison into a wide sideways-scrolling table. It scatters each option's story across a dozen rows, and it reads badly on a narrow screen and in print. That is the case `cards` exists for.
- In a decision document, mark the chosen option `card pick`. The highlighted option carries half the message.

## Long documents

Four moves, in this order:

- `<h2>` title stays OUTSIDE the box.
- A `.box` executive summary right after it: the answer in a few lines, for a reader who stops there.
- Wrap everything after that in `<div class="numbered sections">`. `numbered` gives `h3` a section number in place of its square dot and `h4` an `N.M` sub-number that resets per section. `sections` gives every direct-child `h3` a hairline rule above it, room to breathe and one size up, so a reader scrolling fast can see where one section ends. Both are one class on the wrapper with nothing per heading, and they compose.
- Numbers come from CSS counters, so NEVER hand-write them. Insert a section and the rest renumber themselves. Numerals follow the document language automatically: Persian digits in Persian, Latin in `--lang en`.
- **A tab bar**, when the document has parallel sections a reader will move between (three options, four candidates, five quarters) rather than a sequence they read once. Put it first inside the wrapper:

```html
<div class="tabs">
  <a href="#p1">مسیر ۱<span>نوتیفای‌می</span></a>
  <a href="#p2">مسیر ۲<span>ابزار پشتیبانی</span></a>
</div>
…
<h3 id="p1">مسیر ۱: …</h3>
```

Each `href` names the `id` of the `h3` it jumps to; that id is the only thing you add to the heading. The bar pins itself to the top on scroll and lights the section the reader is in. Keep the main label to one or two words and the `<span>` sub-label to two or three: six tabs on a laptop are about 100px each, and anything longer truncates. Below 520px the sub-labels drop out entirely. Report tier only, and only worth it past three sections; the bar hides in print, where the section numbers do the same job.

## Links out

A link to another document that the reader is meant to open — a spec, a prototype, a related report — is not a `kv` row. A row gives the title of a whole document the same weight as the label beside it. Use a preview card:

```html
<a class="preview" href="https://portal.example.com/vision/"><b>The panel, a year out</b><span>Interactive prototype</span></a>
```

`build.py` fills the `<small>host</small>` line in from the href, so you never type it. A link mentioned inside a sentence stays a plain `<a>`; this is for a link that is the point of its own paragraph.

Add a live frame under it when seeing the target decides whether to open it:

```html
<div class="preview live"><iframe src="https://portal.example.com/vision/" title="The panel prototype"></iframe></div>
```

It is a SIBLING of the card, never a wrapper, and that is what makes it safe: the build asks the target whether it allows framing, and drops the frame when it refuses or cannot be reached, leaving the card. Nothing to check by hand, and a reader never gets an empty box. The `title` is not optional; it is what a screen reader announces. `--no-preview-probe` keeps every frame without asking (offline builds). The frame prints as the plain card, and it is inert on the page: the wheel scrolls the report, not the target.

## Images: when, and when not

The default is **no image**. Prose and the components above carry almost everything, and every image inflates the report file and the work it took to get it. Add one only when it is load-bearing.

An image earns its place when the subject IS visual and words cost more than the picture:

- a screenshot of the actual UI, error, or output being discussed
- a diagram that a `flow`, `tl`, `hub`, or table genuinely cannot express
- a `/fig` animation when the idea IS movement (a retry loop, a queue draining, a fan-out)

Do NOT add one for: a heading that felt bare, mood or texture, a stock photo, a logo, an icon (use `<i class="ic NAME">`), or anything a sentence already says. One or two per report is normal; more than three means the report is decorating itself.

- **Reuse before you fetch.** If a screenshot or image already exists (one you just took, a `getpix` result already in the project), use that path.
- **`/getpix:getpix`** — only when an image is genuinely load-bearing, none exists, and the skill is available. It costs a search and a download, so it is never the reflex. If the user asked for an image, that is reason enough.
- Keep files small. `build.py` inlines each `<img src>` pointing at a local file as a `data:` URI so the report stays one offline file, and refuses above 2MB per image (`--max-image-kb` raises it). A 5MB screenshot is a cropping problem, not a cap problem. It refuses a malformed `/fig` figure on the same principle: a build that stops beats a report that ships a broken image.
- `alt` is not optional: it is what a screen reader and a failed load both fall back to.

**Motion** is `<figure><img src="thing.html" alt="..."></figure>` pointing at the `/fig` output; `build.py` lifts the `<svg>` out with every document `<style>` folded in, so it animates and stays isolated from the report's CSS. Report path only, never a chat card. It prints as one frozen frame, so the animation must read at rest — if it only makes sense mid-motion, it is the wrong figure. At most one per report.

Inside an `<img>` that svg is its own document: strict XML, no script, no page CSS, no page font, nothing fetchable. Everything below follows from that one fact.

- **The motion has to be CSS `@keyframes` or SMIL, written inside the svg.** No script runs in there, so a figure driven by React, a CDN, or `requestAnimationFrame` ships as a single still frame. `/fig` writes CSS since fig 1.1.0; an older figure needs rebuilding. The build warns and names the file.
- **Appearance goes in presentation attributes, CSS is for motion and theming only.** Write `fill`, `stroke`, `font-size`, `text-anchor` on the elements. Plenty of hosts run a sanitiser that strips `<style>` from an svg, and a figure holding its colours in CSS classes then renders as nothing at all. Written this way it loses its loop and keeps its ring, nodes, labels and arrows.
- **Direction is not inherited.** The report's `dir="rtl"` stops at the image boundary, so a Persian figure's `text-anchor="start"` labels jump to the wrong side of their anchor and overlap. `build.py` carries the fig document's own direction onto the `<svg>`, so declare it there (`style="direction:rtl"`) and nothing has to be guessed. In an RTL figure `start` is the RIGHT edge and `end` the left, so a label to the right of a node wants `end`.
- **Give `<text>` a `font-family` with a system fallback.** `build.py` embeds the report's own face into the figure, subset to the characters it letters (a few KB), so the figure and the paragraph beside it are the same typeface. The fallback is what shapes the text if that embed is ever skipped.
- **It is parsed as strict XML.** One bare `<` or `&` (inside a CSS comment counts) stops the build with the file, line, and column, instead of shipping a report whose figure is a broken-image glyph.

**Publishing to a host?** Add `--inline-figures`. A `data:` URI is one point of failure: a CSP whose `img-src` omits `data:` blocks the image outright, and the reader gets an empty box with no clue why. The flag writes the figure's markup into the document instead, where a CSP has nothing to block, and namespaces the figure's classes and ids so they cannot collide with the kit's. Default stays `<img src="data:">`.

## Project brand

If the project carries a `.readable/` brand layer (created by the `brand` skill: `brand.css`, optional `brand.json` + `logo.svg`), `build.py` finds it automatically above the content file and reskins the report — project palette, logo/wordmark header, brand fonts inlined. Nothing to do; `--no-brand` opts out. This is the ONLY sanctioned reskin path.

Brand fonts are fetched and inlined at build time whether `brand.json` names `font.files` (local woff2) or `font.google` (a Google Fonts spec), so the finished report carries its own bytes and renders in the right family with the network off. That costs real weight: a four-weight Persian family is roughly 600KB. If the fetch fails the build says so and keeps the remote `@import`, which still renders online but is not print-safe; add `font.files` to settle it. `--font-timeout` bounds each request.

## Signature

`build.py` appends one muted line as the last child of the card: `created by readable · github.com/smk-labs`, read from the kit's own `@sig` marker in [assets/rc.css](../../assets/rc.css). Nothing to type and nothing to remove — it rides inside `#card`, not in the `.meta` footer, so the report's own Copy/Download exports carry it too. A project drops it with `"signature": false` in `.readable/brand.json` (see the `brand` skill); `--no-brand` does not, because attribution is a project policy and not a look.

## Hard rules

- Open with the substance. NO cover-page preamble: never lead with an owner / subject / prepared-by / audience / date / status metadata block. The `<h2>` titles the report and the footer already stamps the date; the first real line is the answer itself.
- Never restyle, "improve", or hand-write CSS; the template is the design. If the user wants a different look, point them to the `brand` skill (`/readable:brand`) — never hand-edit styles.
- Content language decides `--lang`; mixed content follows the dominant language (the kit is BiDi-safe either way).
- The report has a built-in light/dark toggle and print styles; PDF = open in browser and print. Do not add extra machinery.
