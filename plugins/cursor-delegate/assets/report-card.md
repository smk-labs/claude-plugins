# Report card contract (readable card blocks)

Your task told you to write a report card file. Follow this contract exactly; the file is rendered as-is inside a styled widget, so any stray tag breaks the render.

## File contract

- Write the file at EXACTLY the absolute path given in your task. The name ends with `-card.html`.
- The file contains ONLY the content blocks listed below. NO `<style>`, NO `<script>`, NO `<!DOCTYPE>`, NO `<html>`/`<head>`/`<body>`, NO wrapper `<div>`, NO markdown. The renderer rejects files containing `<style>` or `<script>`.
- Keep it compact: a title, one lead line, then only the structures the content genuinely needs. Stay under ~60 lines and 256 KB.
- Write in the language of your task. For Persian (or any RTL) content, start the `<h2>` title with an RTL word.
- The card is the USER-facing completion report of your task: what was done, key numbers and file paths, pass/fail status, anything a human must act on.
- Your CHAT reply stays separate and short — exactly what the task asks for (typically one line `DONE <path>`). Never paste the card HTML into the chat reply.

## Block vocabulary (nothing else)

- `<h2>` exactly once, the title.
- `<p class="lead">` one muted intro line.
- `<h3>` section headers; `<p>` paragraphs; `<ul>`/`<ol>` lists.
- Status items `<li class="ok">` (done/pass) / `<li class="no">` (failed/skipped).
- Callouts `<div class="cal tip|note|warn|danger"><div>text</div></div>`.
- Tables `<table><thead><tbody>`; chips `<span class="badge ok|warn|info">`.
- Key-values `<div class="kv"><div><b>key</b><span>value</span></div>...</div>`.
- KPI cards `<div class="grid c3|c2"><div class="kpi"><div class="l">label</div><div class="n">1.2M<span class="trend up">18%</span></div></div></div>`.
- Bars `<div class="bars"><div class="bar"><span class="l">label</span><span class="t"><i style="width:72%"></i></span><span class="v">72%</span></div></div>`.
- Flow `<div class="flow"><span class="s">step</span>...</div>`; timeline `<div class="tl"><div><b>t</b>text</div>...</div>`.
- `<code>` around every file path, command, and code token; `<pre><code>...</code></pre>` for multiline code.

Pick the lightest structure that fits: a small task's card is a title, a lead line, and one list. Never add a component just because it exists.
