# readable

Easy-to-read outputs from Claude: two small tools, one goal.

## 1. RTL cards (hooks, automatic)

Chat clients lay plain text out left-to-right, so mixed Persian/English replies scramble: trailing periods jump to the head of the line, Latin tokens reorder, numbers flip. Existing fixes either patch the app itself ([claude-rtl](https://github.com/smk-labs/claude-rtl)) or make the model hand-write a full HTML card on every reply, burning 2 to 4 times the tokens of the actual content.

readable moves the template out of the model and into code:

1. A `SessionStart` hook injects one short rule: reply in Persian as plain Markdown inside a `<script type="text/markdown">` block, in a single widget call, followed by one script tag pointing at this repo's renderer on jsDelivr.
2. The renderer ([assets/rtl-card.js](assets/rtl-card.js)) runs inside the widget and turns that Markdown into a styled RTL card: Vazirmatn font, per-block direction resolution (`unicode-bidi: plaintext`), LTR-isolated code/paths/URLs, clean headings, hairline tables. Zero template tokens, deterministic look, adapts to light/dark mode via CSS variables, and works in any client that renders widgets.
3. A `PreToolUse` hook ([hooks/rtl_card.py](hooks/rtl_card.py)) does the same conversion locally as a fast path on hosts that honor `updatedInput`; where the host ignores it (Claude Desktop chat does today), the CDN renderer covers it.

## 2. visualize (skill, on demand)

Ask "visualize this", "show it as a diagram", "با شکل نشون بده" at any time, in any language, and Claude turns the answer into one light, theme-aware SVG: flows, timelines, hierarchies, comparisons. The skill also triggers on its own when a shape genuinely says it better than text. Deliberately minimal: a few dozen elements, 2-3 colors, labels only.

## Install

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install readable@smk
```

Restart the session after installing (hooks load at session start).

## Requirements and scope

- A client that runs Claude Code plugins and has the `mcp__visualize__show_widget` tool (Claude Desktop / Cowork). In clients without the widget tool, the rule falls back to BiDi-safe plain text.
- `python3` on PATH (macOS ships it). The hook is stdlib-only, no dependencies.
- Fail-safe in two modes: widget calls without the `<md>` sentinel pass through untouched; if converting a sentinel card ever fails, the hook denies the call with guidance and Claude immediately re-sends the reply as a hand-written HTML card, so the raw sentinel never reaches your screen.
- readable styles Claude's replies. It does not change how the app renders the text you type; that is what [claude-rtl](https://github.com/smk-labs/claude-rtl) fixes at the app level.

## Test

```
python3 tests/test_rtl_card.py
```
