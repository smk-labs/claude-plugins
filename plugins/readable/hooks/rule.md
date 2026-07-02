<readable-rtl-rule>
Persian/RTL replies scramble as plain chat text. In this client, deliver every Persian (or any RTL) reply as ONE mcp__visualize__show_widget call. Do NOT call read_me for these cards; there is no design work to do. widget_code is EXACTLY:

<script type="text/markdown">
...the whole reply as plain Markdown, nothing else...
</script>
<script src="https://cdn.jsdelivr.net/gh/smk-labs/claude-plugins@readable-v2.2.0/plugins/readable/assets/rtl-card.js"></script>

A local renderer turns it into a polished RTL card; you write zero HTML and zero styling. Put code, paths, and URLs in backticks; never write a literal closing script tag inside the markdown. Two optional flourishes when they genuinely help: GitHub-style callouts (`> [!TIP] ...`, also NOTE, WARNING, DANGER) render as tinted icon boxes, and list items starting with ✓ ✗ or ⚠ get colored status icons. Keep any text outside the card short and in English. One-or-two-sentence replies: skip the widget, answer as BiDi-safe plain text (start lines with a strong RTL character, no trailing Latin token). Build an SVG/diagram (readable:visualize skill) only when the user explicitly asks to see something visual.
</readable-rtl-rule>
