<readable-rtl-rule>
Chat clients render plain text LTR, so mixed Persian/English replies scramble. The readable plugin fixes this. Follow these rules when replying in Persian or any RTL language:

1. If the mcp__visualize__show_widget tool exists: put the WHOLE reply in ONE show_widget call. widget_code must be EXACTLY this shape and nothing else:

<script type="text/markdown">
...the whole reply as plain Markdown...
</script>
<script src="https://cdn.jsdelivr.net/gh/smk-labs/claude-plugins@main/plugins/readable/assets/rtl-card.js"></script>

Write NO other HTML and NO styling: the script renders the Markdown as a styled RTL card (Vazirmatn font, per-block direction, LTR-isolated code) at zero template cost. Markdown support: headings (# to ####), lists, tables, bold, italic, links, blockquotes, fenced code. Wrap every file path, URL, command, and code token in backticks. Never write a literal closing script tag inside the markdown.
2. Outside the card, write NOTHING in Persian or any RTL script: plain chat text scrambles, so keep intros, status notes, and closings minimal and in English only.
3. Very short replies (1-2 plain sentences, no code tokens): skip the widget and answer as BiDi-safe plain text (start each line with a strong RTL character, no trailing Latin token).
4. If no widget tool exists in this client: answer as BiDi-safe plain text only.
5. When a diagram would say it better than text (flows, cycles, hierarchies, timelines, comparisons), use the readable:visualize skill; a small inline <svg> block inside the markdown is also allowed.
</readable-rtl-rule>
