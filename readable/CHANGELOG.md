# readable changelog

## 5.6.0

Three components, all out of one real report: a long decision document with
three parallel options. Each closes a gap that document hit.

1. **`sections`.** At `1.1em` an `h3` disappears between two long sections, and
   a reader scrolling a three-option document cannot tell where one option ends.
   Add `sections` to the wrapper and every DIRECT-child `h3` gets a hairline
   rule above it, room to breathe and one size up (`1.25em`, between `h3` and
   the `1.35em` title rather than competing with it). Same shape as `numbered`,
   one class and nothing per heading, and `numbered sections` needs nothing
   reconciled: the number lives on `h3::before` and this touches only the box.
   The first section carries no rule, keyed on `:first-of-type` so it holds
   whatever sits between the wrapper and its first heading.

2. **`preview`.** A link to another document, drawn as a document instead of a
   `kv` row, which gives a whole document the same weight as the label beside
   it: `<a class="preview" href><b>title</b><span>context</span><small>host</small></a>`.
   The host is written in by `build.py` off the href, for the reason section
   numbers come off a counter. The corner mark is a rotated border corner, so
   print keeps the ink and RTL costs one sign.

   `<div class="preview live"><iframe></div>` adds a live scaled-down frame of
   the target, and it is the risky half. It is a SIBLING of the card, never a
   wrapper, which is what makes the fallback free: a target that refuses framing
   loses the frame and the card is already there, with no hole to fill and
   nothing to rebuild. Print is the same one rule, plus giving the card its own
   radius back.

   The refusal is decided at BUILD time, because runtime cannot know: a frame
   blocked by `X-Frame-Options` still fires `load`, its document is cross-origin
   either way, and a `file://` report cannot fetch the url to look. `build.py`
   reads the headers itself, treats an unreachable target as refusing (an empty
   box in a finished document is worse than a card with no picture) and says on
   stderr what it dropped. A host allowlist in `frame-ancestors` counts as a
   refusal too: a report opened from disk has a null origin and can never
   satisfy one. `--no-preview-probe` skips the network.

   The frame renders at `1/--s` of the container and is scaled back by exactly
   `--s`, so a desktop-width page reads at report width. Fixing the SCALE and
   letting the logical width follow the container is deliberate: pinning the
   logical width instead would hold a desktop layout at 0.24 on a phone, i.e.
   4px text. Below 520px `--s` becomes 1 and the frame shows the target's own
   narrow layout at full size. A transparent lid over it keeps the wheel on the
   report instead of inside the frame.

3. **`tabs`.** A pinned bar over a long report's sections: click to jump, and it
   follows the reader on scroll by lighting the section they are in. Report tier
   — a chat card has no scroll of its own, so there is nothing for a sticky bar
   to stick to. The bar, the jump and the landing offset are all CSS, so it
   degrades to plain anchors; the only script is the follow-on-scroll highlight,
   in the report shell, guarded so a report with no bar runs nothing at all.

   Both traps a hand-patched version hit are kept and now tested. The scrollspy
   runs straight off the scroll event and never through `requestAnimationFrame`,
   which is throttled to zero in a hidden tab and freezes the bar on whatever was
   active when the tab lost focus. And the bar's height is MEASURED, never
   hardcoded, for both the scrollspy's comparison line and each heading's
   `scroll-margin-top`: the bar wraps, six tabs on a phone are two flex lines,
   and a fixed offset parks the heading behind the second one. It is measured
   with a `ResizeObserver` rather than on resize, because the webfont lands after
   first paint and changes the bar's height with no resize event to hear.

   Two things the screenshots caught. The sticky offset was 10px, which put the
   bar inside the report shell's own fixed chrome band (`top:16px`, 34px
   circles): at 375px the print button clipped the first tab's label and the
   `⋯` menu covered the last one, so a phone reader could not press either. It
   is 56px now, which clears that band at every width with no breakpoint, and a
   test reads both numbers so moving one fails loudly. And the fill was
   `--surface-2`, the same as the executive `.box` a long document opens with,
   so the two stacked as grey slabs; the bar takes the card's own `--surface-1`
   on a hairline instead and reads as a rail.

`preview` and `sections` are offered in the chat rules too; `tabs` is not.

## 5.5.1

The hub's arrowheads were an open two-border chevron floating at the end of each
line: hollow, and detached by the width of its own miter. They are now a solid
triangle that shares one silhouette with the line.

1. **Solid, from a border.** One 8px `border-left` between transparent 3px caps,
   which is the CSS triangle trick, so the head is still border ink and a
   printer keeps it with backgrounds off. Every dimension is an integer, so the
   rotated raster stays symmetric; the first attempt used 3.5px half-widths and
   put a visible step on one edge of each vertical arrow.

2. **The line stops at the head's centre, not at its tip.** A triangle is
   narrower than a 1.5px line for the last 2px before its point, so a line run
   all the way to the tip pokes a blunt nub straight through it. The line ends at
   `--w` (the head's centre) and the head covers the rest, which is what makes
   the two read as one arrow instead of two shapes that touch.

3. **`.out` is the same head turned 180 degrees**, with its tip 2px inside its
   own box: exactly the depth at which the head is as wide as the line, so no
   sliver of line shows past the point. Its line still runs the full length to
   the centre, because the flow really does reach there.

Caught at 14x and 16x magnification, then confirmed numerically: every head's
tip lands on its target box to the pixel, in both directions. The pair is now
2273 bytes minified.

## 5.5.0

Two diagram components: `hub` and `hub tree`. The kit could draw a sequence
(`flow`), a chronology (`tl`) and a comparison (`cards`). One thing connected to
many had no component, so authors faked it with a bullet list.

`hub` is a centre with up to eight legs, each leg an arrow that carries
direction of flow. `hub tree` is a root, branches and leaves with no arrows,
for items that group. Authoring is flat and wrapper-free, the same shape as
`flow`: one `.c` first, then any number of `.s`, with an optional `<span>`
inside either for a second line, and for the tree an optional nested group of
`.s` under a branch. CSS only, no JS, no SVG, no image.

```html
<div class="hub">
  <div class="c">باقرزاده<span>پلاگین جامع شرکت</span></div>
  <div class="s">نوشن<span>هاب ایجنت‌ها</span></div>
  <div class="s out">دیسکورد<span>با کران خبر می‌دهد</span></div>
</div>
```

1. **A 3x3 grid, not angle maths.** `.c` takes the middle cell and the eight
   `.s` auto-flow into the ring around it, so a slot needs no `grid-area` of its
   own and nothing is measured at runtime. Each slot declares only where its leg
   starts on its own box, which way it runs, and how long.

2. **The row gap equals the column gap, and that is load-bearing.** A corner
   cell's inner corner is then exactly the same distance across in both axes, so
   a 45 degree leg lands on the centre cell's corner with no maths. Anchoring on
   the BOX rather than on the hub centre is what makes it exact: cells are wide
   and short, so a 45 degree ray from the middle misses the corner cells
   completely. A numeric check over all sixteen legs (eight slots, both
   directions) puts every one of them on both boxes within 0.23px.

3. **`out` turns a leg's arrow around instead of buying a second colour.** The
   agreed visual target used gold for "writes to" and blue for "reads from";
   direction says the same thing and keeps the component on one hue.

4. **RTL is one sign flip, not a second slot table.** Every angle is read in the
   inline frame, from the inline-end axis toward block-end, so a slot's angle is
   identical in both directions and only the frame mirrors. The arrowhead is a
   border corner, so it must use PHYSICAL `border-top`/`border-right` and let
   `scaleX(-1)` mirror it: a logical `border-inline-end` mirrors twice and
   leaves the arrow pointing up.

5. **Connectors are borders, never backgrounds.** `print-color-adjust` drops
   backgrounds, and a hub that prints as boxes with no legs is not a hub. The
   print block also refuses to split a hub across a page break.

6. **Below 520px the ring becomes one column, and deliberately not a chain.**
   The obvious reflow (stack the boxes, point every leg at the box above) draws
   an arrow from HRIS to Jira and claims a relationship that does not exist.
   Each box gets one direction tick on its inline-start edge instead, all of
   them aligned on a rail.

Nine items or more is a tree, not a hub, and the rule files say so: the ring
holds eight. A ninth leg is switched off rather than drawn, because with no slot
of its own it defaulted to a stub through its own label pointing nowhere; the
box still renders, just unconnected. The tree has no such cap. Both components nest inside `card` and `box`, both reflow rather
than scroll sideways, and both are delivered per card by `read_kit` like every
other component.

**Known cost.** The pair is 2225 bytes minified, against a 900 byte target. The
eight-slot ring is about 420 of that and cannot be folded: with wide, short
cells each slot genuinely needs its own anchor, and deriving the anchors from
the angle with `round(cos())` saves under 40 bytes while making the geometry
unreadable. The rest is the two connector rules (440), the panels, centre and
row span (400), the tree (480), the narrow reflow (160) and RTL (60). For
comparison the sheet already carries `card` at 1021 and `fold` at 1002, and
nothing pays for any of it on a card that has no hub.

**Verified, not eyeballed.** Twenty-four renders (two variants x two directions
x two themes x 1200/768/375), each checked by hand and then by a machine pass
for sideways scroll, overlapping boxes, collapsed boxes, and leg landings; plus
print with backgrounds forced off, the real card end to end through `read_kit`
and the template, and both over-capacity cases.

## 5.4.1

5.4.0 shipped a card server that could not start.

1. **`setup.sh` now copies `assets/email.js` into the stable dir.** 5.4.0 moved
   the email transform into that file and made `server.js` `require()` it at
   module load, but the copy list still ended at `menu.js`. In the flat stable
   layout the candidate lookup returned `undefined`, `require(undefined)` threw
   `ERR_INVALID_ARG_TYPE`, and the server died before its first line of
   protocol. Not a degraded export: no server, no `card` tool, every reply back
   to plain text. The failure only reached machines that install from the
   marketplace, since a dev checkout resolves `../assets/email.js` and works.
2. **The rule names the right tool again when two are exposed.** The line
   telling the model to prefer `mcp__readable-card__card` over a plugin-scoped
   `mcp__plugin_readable_readable-card__card` was dropped in 5.x on the
   assumption no plugin-scoped variant could still exist. Orphaned 4.x versions
   linger in the plugin cache with their `mcp/` dir intact, so it can, and when
   it wins the reply renders as raw HTML.

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
