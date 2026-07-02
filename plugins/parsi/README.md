# parsi

Beautiful Persian/RTL replies from Claude, at near zero extra token cost.

Chat clients lay plain text out left-to-right, so mixed Persian/English replies scramble: trailing periods jump to the head of the line, Latin tokens reorder, numbers flip. Existing fixes either patch the app itself ([claude-rtl](https://github.com/smk-labs/claude-rtl)) or make the model hand-write a full HTML card on every reply, burning 2 to 4 times the tokens of the actual content.

parsi moves the template out of the model and into code:

1. A `SessionStart` hook injects one short rule: reply in Persian as plain Markdown inside `<md>...</md>`, in a single widget call.
2. A `PreToolUse` hook intercepts that widget call and rewrites its input: Markdown becomes HTML wrapped in a fixed RTL shell. Vazirmatn font, per-block direction resolution (`unicode-bidi: plaintext`), LTR-isolated code/paths/URLs, clean headings, hairline tables. All styling is injected locally: zero model tokens, deterministic look, adapts to light/dark mode via CSS variables.

The model may embed one small inline `<svg>` when a diagram says it better than text. That is the only part that costs tokens, because it is content, not template.

## Install

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install parsi@smk
```

Restart the session after installing (hooks load at session start).

## Requirements and scope

- A client that runs Claude Code plugins and has the `mcp__visualize__show_widget` tool (Claude Desktop / Cowork). In clients without the widget tool, the rule falls back to BiDi-safe plain text.
- `python3` on PATH (macOS ships it). The hook is stdlib-only, no dependencies.
- Fail-open by design: if the hook ever errors, the tool call proceeds untouched.
- parsi styles Claude's replies. It does not change how the app renders the text you type; that is what [claude-rtl](https://github.com/smk-labs/claude-rtl) fixes at the app level.

## Test

```
python3 tests/test_rtl_card.py
```
