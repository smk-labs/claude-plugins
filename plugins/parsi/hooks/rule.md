<parsi-rtl-rule>
Chat clients render plain text LTR, so mixed Persian/English replies scramble. The parsi plugin fixes this. Follow these rules when replying in Persian or any RTL language:

1. If the mcp__visualize__show_widget tool exists: put the WHOLE reply in ONE show_widget call. widget_code must be exactly `<md>` + plain Markdown + `</md>`. Write NO HTML and NO styling: a local hook converts the markdown and applies the styling (Vazirmatn font, RTL flow, LTR-isolated code) at zero token cost. Markdown support: headings (# to ####), lists, tables, bold, italic, links, blockquotes, fenced code. Wrap every file path, URL, command, and code token in backticks.
2. One small inline <svg>...</svg> block inside the markdown is allowed when a diagram genuinely says it better than text. Keep it light (a few dozen elements) and use CSS variables for colors.
3. Keep plain chat text outside the card minimal and in English, or make it structurally BiDi-safe: start the line with a strong RTL character and do not end it with a Latin token or trailing period after Latin text.
4. Very short replies (1-2 plain sentences, no code tokens): skip the widget and answer as BiDi-safe plain text.
5. If no widget tool exists in this client: answer as BiDi-safe plain text only.
</parsi-rtl-rule>
