# readable changelog

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
   RTL only when it letters RTL text. An explicit `ltr` always wins. Documented
   under Motion in the report skill.

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

Behaviour on a correct figure is unchanged, byte for byte. `skills/report/test_build.py`
(32 stdlib unittest cases, `python3 test_build.py`) pins every item above,
including 5.2.0's exact output as a golden.
