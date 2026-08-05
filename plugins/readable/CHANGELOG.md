# readable changelog

## 5.4.0

The Email export shipped CSS that no email client runs. Fixed at the root: one
transform for both hosts, and its output is table-based, inline-styled, and
made of real characters.

**Why it was not cosmetic.** Email clients are not browsers. Gmail strips
`<style>` on forward and reply; Outlook on Windows renders through the Word
engine. The kit leans on custom properties, grid, flex, `::before`/`::after`,
`color-mix()`, `:is()` and logical properties, and not one of those survives.
So the export was not degrading, it was collapsing: a card that reads as a
dashboard on screen pasted into a mail as a run of naked text with the numbers
in the wrong order. The pseudo-element row was the worst, because it fails
silently — a list keeps its text and loses its bullets, a `flow` becomes three
words with no arrows, and a `numbered` document loses every section number with
no way to get them back, since they were counters and never characters.

1. **One transform, in [assets/email.js](assets/email.js).** There were two
   adapters and they had drifted: the server ran a div/inline-block style map,
   the report ran a `getComputedStyle` walker that kept `<svg>` and flattened
   grid to a stacked block. Neither ever built a table. The card now calls the
   same file through `render_email` (server-side, because the `ui://` template
   must stay under the host's ~30 KB ceiling) that the report inlines.
2. **Every layout component is a `<table>`**, the one primitive every client
   supports. `grid`/`kpi` is one table with a cell per tile, a short last row
   padded so the columns stay even; `cards` is one column, or two under `c2`;
   `cols` is a 2-3 column table; `kv` is key and value cells; a bar is a
   label cell, a fixed 220px track whose fill and remainder are two cells (no
   `overflow:hidden`, no percentage flex), then the value; `cal` and `box` are
   one-cell tables with a thick coloured edge; `blockquote` likewise. Cells
   carry `align=` rather than `text-align`, which Word ignores in several
   cases, and every table carries its own `dir`, because Word resolves
   direction per table and not from an ancestor.
3. **Pseudo-elements become real characters.** Bullets, ✓/✕ markers, flow
   arrows, timeline dots, legend swatches, the section mark, trend triangles.
   `numbered` headings get their number written into the text, in Persian
   digits for an RTL card and decimal for LTR, exactly as `counter(sec,persian)`
   renders it on screen. The `h2` rule is a one-cell table, placed after the
   heading rather than inside it, since a nested table closes an `<h2>` early.
4. **A branded card exports branded.** The palette was a hardcoded map, so the
   one artifact most likely to leave the building left it in someone else's
   colours. The card's own `.readable` brand css is fed to the transform and
   every literal is resolved from it; the report reads the same values off the
   live DOM under the light theme. The chart ramp `--cb`/`--cc` is `color-mix()`
   in the kit, so it is recomputed in sRGB here.
5. **What cannot be drawn degrades to what still carries meaning.** A `fold`
   exports already open, as plain divs — `<details>` never opens in a mail and
   several clients strip the tag with its content. A donut ships its legend
   numbers instead of a broken ring. A `data:` figure falls back to its caption,
   which is what Gmail would have shown anyway. A spark is dropped: its polyline
   is normalized to a 0..100 by 0..30 box, so there are no underlying numbers
   left to tabulate, and half a chart is worse than none.
6. **A test that catches the whole class.** `server/test.js` renders one card
   using every layout component and asserts the output contains none of
   `var(--`, `display:grid`, `display:flex`, `::before`, `::after`,
   `color-mix(`, `:is(`, `inset-inline` — or any `class=` at all.

## 5.3.0

The rest of the figure-embedding story, plus one RTL table fix. A figure is
lifted out of a `/fig` html file and embedded as its own document, and that
document gets no script, no page CSS, **no page font**, and no network. 5.2.1
covered the first two. This covers the rest, and stops trusting `<img>` at all
when the report is going to a host.

1. **Malformed XML stops the build** (5.2.1). Bare `<` or `&` in a figure's css
   used to ship a broken-image glyph in silence.
2. **The document `<style>` is always folded in** (5.2.1). A figure with an
   inner `<style>` used to lose the outer block, motion included.
3. **Text direction is carried onto the lifted `<svg>`** (5.2.1). RTL labels no
   longer flip to the wrong side of their anchor.
4. **A google-only brand font is fetched and inlined.** `brand_blocks` inlined
   `@font-face` only from `font.files`, so a `brand.json` naming `font.google`
   hit `if font.get("google"): pass` under a comment promising the faces were
   inlined below. Nothing was. The family was declared, never loaded, and the
   page only rendered because `kit_css` leaves the kit's remote `@import` in
   place when no `@font-face` is present. Offline, every Persian glyph was
   Tahoma. The faces are now fetched at build time (stdlib `urllib`, browser UA
   for woff2, subsets filtered to arabic/latin/latin-ext) and inlined as data
   URIs; `kit_css` then drops the import because it is genuinely redundant. A
   fetch that fails warns, names `font.files` as the fix, and keeps the import
   deliberately rather than shipping a family that was never loaded.
   `--font-timeout` bounds every request, so a dead host cannot hang a build.
5. **The figure gets the report's font.** `shell.html` documents this exact
   mechanism for the PNG export ("an SVG-as-image can't load an external
   @import font") and nothing acted on it for the figure path, so Persian
   figure text rendered in a system serif beside a Vazirmatn paragraph. The
   resolved face is now folded into the lifted svg, subset through the css2
   api's `text=` parameter to the characters that figure actually letters:
   roughly 5KB instead of the ~400KB a whole family costs. A figure that names
   its own typeface keeps it; only one that named none inherits the report's.
   `--no-figure-font` opts out.
6. **`--inline-figures` writes the markup into the document.** `<img
   src="data:">` is one point of failure with two common hosts behind it: a CSP
   whose `img-src` omits `data:` blocks the image outright, and a sanitiser that
   strips `<style>` from an svg takes every fill and stroke with it. Both end as
   an empty box, silently, which is what the portal showed. Inline svg survives
   both. It gives up the isolation `<img>` was providing, so the lift now
   namespaces what the figure declares (classes, ids and their `url(#…)` and
   `href="#…"` references, `@keyframes` and the animations naming them) with a
   per-figure prefix. The kit already sized `.rc figure svg` exactly like
   `.rc img`, so no stylesheet moved. Default is unchanged; the SKILL states the
   matching authoring rule, that appearance belongs in presentation attributes
   and CSS is for motion and theming only.
7. **A JavaScript-only figure warns** (5.2.1), and fig 1.1.0 made css the stack.
8. **Dead `.in_use` locks are reaped at startup** (5.2.1).

Plus, from the field: **RTL table columns no longer render ragged.** `td` and
`th` carried `unicode-bidi:plaintext`, which re-reads direction from each
element's first strong character. Right for a standalone paragraph, wrong for a
column: a cell opening on a Latin token (`NO_VERDICT`, a code path) resolved LTR
and left-aligned while the Persian cell under it stayed RTL and right-aligned,
and its runs came out reversed from what the author wrote. Cells now `isolate`,
which keeps the card's own direction on every one of them and still seals each
Latin run. Paragraphs and list items keep `plaintext`, where per-element
detection is the correct behaviour. Chat cards and reports both, and the chat
template stays under its ceiling at 26287B of 30000.

Behaviour on a correct figure is unchanged byte for byte under
`--no-figure-font`. `skills/report/test_build.py` runs 55 stdlib unittest cases
(`python3 test_build.py`), at least one per item, with the network stubbed so
the font paths are deterministic offline.

## 5.2.1

Five fixes, one root cause. `build.py` inlines a `/fig` figure by lifting its
`<svg>` into a `data:image/svg+xml` URI, and once embedded that svg is a
separate document: parsed as strict XML, running no script, inheriting nothing
from the report page. Every defect below followed from that, and not one of them
failed a build. All were reproduced end to end on a Persian RTL report with an
animated cycle figure.

1. **A malformed figure now stops the build.** `data_uri` promised to fail
   loudly rather than ship a broken `<img>`, but only checked existence and
   size. One bare `<` or `&` anywhere in a fig's css (inside a comment counts)
   closed `<style>` early, and the report rendered alt text behind a
   broken-image glyph with nothing on stderr. The lifted svg is now parsed
   (`xml.etree`, stdlib) and the build exits with the file, line and column. For
   the mistake that actually happens, a bare `<` or `&` in css, the position
   names that character rather than the `</style>` several lines later where
   expat noticed. Folded css is wrapped in `<![CDATA[ ... ]]>` so ordinary css
   cannot break the parse at all; nothing is ever stripped. Two related refusals
   land here too: an svg with no `xmlns` (an `<img>` renders nothing without
   it), and a fig 1.0.0 React figure whose only `<svg>` is JSX inside a
   `<script>`, which 5.2.0 base64'd into reports as source code.

2. **The document `<style>` is no longer dropped.** The guard skipped folding
   whenever the svg carried a `<style>` of its own, so a fig with both lost
   everything in the outer block without a word. And `@keyframes` living
   outside the svg is exactly how figures were written, so they shipped
   motionless and looked like a design choice. Folding is now unconditional, and
   the outer rules go in as the first child, the order they had in the source
   document, so the svg's own block keeps winning ties.

3. **Text direction is carried into the lifted svg.** `dir="rtl"` is an html
   attribute and the report's direction stops at the image boundary, so
   `text-anchor="start"` silently reverted to its LTR meaning: a Persian figure
   that was correct standalone had every label on the wrong side of its anchor,
   overlapping its neighbours. The fig document's own direction (a `dir`
   attribute, or a `direction:rtl` rule on the root) is now written onto the
   `<svg>` element; a figure that declares nothing in a Persian report is read as
   RTL only when it letters RTL text. An explicit `ltr` always wins.

4. **A figure that can only move via JavaScript warns.** No script runs inside
   `<img>`, so React, `requestAnimationFrame` and every timer are dead there.
   When the source carried a `<script>` and the lifted svg has neither
   `@keyframes` nor a SMIL `animate*`, the build warns and names the file. A
   warning, not a failure: a deliberately static figure is legitimate. The
   report skill now states outright that report-bound motion must be css or
   SMIL inside the svg, and **fig 1.1.0** makes that its stack: the React +
   Babel + CDN template is gone, which also makes a fig genuinely self-contained
   and offline for the first time.

5. **Dead `.in_use` locks are reaped at startup.** Claude Code writes one file
   per process id into the plugin's cache dir and nothing removed them; 32 had
   accumulated here, 29 from processes that had exited. `hooks/reap.sh` runs
   before anything in `setup.sh` that can exit early and deletes entries whose
   pid is gone, scoped to readable's own directory. It builds the live-pid list
   once and deletes nothing if that list comes back empty, because a half-built
   list reads as "every pid is dead" and would take the running session's own
   lock with it. Silent by design: a `SessionStart` hook's stdout is spent
   context.
