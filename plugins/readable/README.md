# readable

Easy-to-read outputs from Claude: two small tools, one goal.

## 1. RTL cards (automatic)

Chat clients lay plain text out left-to-right, so mixed Persian/English replies scramble: trailing periods jump to the head of the line, Latin tokens reorder, numbers flip. One fix patches the app itself ([claude-rtl](https://github.com/smk-labs/claude-rtl)); this one fixes Claude's replies with no app changes.

A `SessionStart` hook injects one short rule: reply in Persian as a single self-contained widget card. The model writes its answer as HTML wrapped in one fixed `<style>` block (Vazirmatn font, per-block direction resolution via `unicode-bidi: plaintext`, LTR-isolated code and paths, accent headings, framed tables, plus opt-in icon callouts and check/cross status lists). The style block is a constant the model copies verbatim, so polish is nearly free: colors and SVG icons are defined once, and the model only adds a class name (`ok`, `tip`, `note`, `warn`) to use them.

The card is fully self-contained: no external scripts, no CDN, no network. That is deliberate. The Claude Desktop chat widget sandbox does not execute external scripts and ignores `PreToolUse` hook rewrites, so anything loaded from outside the widget renders blank. Everything the card needs travels inside the widget itself, which is why it renders on every host, including Haiku.

Everything adapts to light and dark mode through the host's CSS variables.

## 2. visualize (skill, on demand)

Ask "show me", "visualize this", "با شکل نشون بده" and Claude turns the answer into one light, theme-aware SVG: flows, timelines, hierarchies, comparisons. Explicit request only. Deliberately minimal: a few dozen elements, 2-3 colors, labels only.

## Install

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install readable@smk
```

Restart the session after installing (the rule loads at session start).

## Requirements and scope

- A client that runs Claude Code plugins and has the `mcp__visualize__show_widget` tool (Claude Desktop / Cowork). Without that tool, the rule falls back to BiDi-safe plain text.
- No dependencies of any kind: the only hook is a `cat` of the rule at session start. No Python, no Node, no network.
- readable styles Claude's replies. It does not change how the app renders the text you type; that is what [claude-rtl](https://github.com/smk-labs/claude-rtl) fixes at the app level.
