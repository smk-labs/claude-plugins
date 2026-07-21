---
name: report
description: Export a reply or chat card as a standalone styled HTML report file, in the exact readable card template (Persian RTL with Vazirmatn, or English LTR with Inter). Use ONLY when the user explicitly asks to save, export, file, or extend THE CURRENT widget/card ("همین کارت رو ذخیره کن", "کامل‌ترش رو به‌صورت فایل بساز", "save this card as a report") or invokes /readable:report directly. NEVER auto-trigger on generic report-writing requests ("گزارش بساز", "write a report") that do not mention saving a file or this template.
---

# report: the chat card, as a standalone HTML file

One goal: the saved report looks EXACTLY like the chat cards. You never design, never write CSS; a script injects the kit.

## Workflow

1. **Collect content.** If the user is exporting an existing card, reuse that card's CONTENT HTML verbatim, then apply only the changes they asked for (extend, add sections, more detail). Otherwise write fresh content. Building blocks only, no `<style>`, no `<script>`, no wrapper div: `<h2>` once as title, `<p class="lead">`, `<h3>` sections, `<p>`, `<ul>`/`<ol>`, `<li class="ok|no">`, callouts `<div class="cal tip|note|warn|danger"><div>…</div></div>`, `<code>` around every LTR token, `<table>` + `<span class="badge ok|warn|info">` (10+ row stat tables: `<table class="zebra dense">`, striped + tight, combinable; 100+ rows: wrap as `<div class="scroll-table"><table>...</table></div>` for a scrollbox with pinned header that expands fully in print; very wide tables: `<div class="scroll-table wide">` keeps cells on one line and scrolls sideways, wraps again in print), kv, `grid`/`kpi`/`trend` (+ optional compact caveat `<div class="f">` last inside a kpi), `bars` (+ two-metric total/subset overlay `<div class="bar duo">` with two `<i>` in the track, first total second subset, both colors named once in a `<div class="leg">` first inside `.bars`: `<span class="a"><i></i>total</span><span class="b"><i></i>subset</span>`), `spark` (trend sparkline, same SVG contract as chat cards), `donut`, `flow`, `tl`, `<hr>`. ALL components are always available here (the script embeds the full kit), so unlike chat cards there are no snippets to manage. Skip CTA buttons: `sendPrompt` does not exist in a standalone file.
2. **Write the fragment** to a temp file (scratchpad), e.g. `content.html`.
3. **Build:**
   - Persian: `python3 "<this skill dir>/build.py" content.html -o <target>.html`
   - English: add `--lang en` (LTR + Inter automatically)
   - `--title "..."` optional; defaults to the `<h2>` text.
   Default output name if the user gave none: `report-<short-slug>.html` in the project directory (or the path they named).
4. **Deliver:** the script prints the absolute path; report it as a clickable link. Offer to open it in the browser. Do not paste the HTML into chat.

## Project brand

If the project carries a `.readable/` brand layer (created by the `brand` skill: `brand.css`, optional `brand.json` + `logo.svg`), `build.py` finds it automatically above the content file and reskins the report — project palette, logo/wordmark header, brand fonts inlined. Nothing to do; `--no-brand` opts out. This is the ONLY sanctioned reskin path.

## Hard rules

- Open with the substance. NO cover-page preamble: never lead with an owner / subject / prepared-by / audience / date / status metadata block. The `<h2>` titles the report and the footer already stamps the date; the first real line is the answer itself.
- Never restyle, "improve", or hand-write CSS; the template is the design. If the user wants a different look, point them to the `brand` skill (`/readable:brand`) — never hand-edit styles.
- Content language decides `--lang`; mixed content follows the dominant language (the kit is BiDi-safe either way).
- The report has a built-in light/dark toggle and print styles; PDF = open in browser and print. Do not add extra machinery.
