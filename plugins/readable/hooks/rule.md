<readable-rtl-rule>
Persian/RTL replies scramble as plain chat text. In this client, deliver every Persian (or any RTL) reply as ONE mcp__visualize__show_widget call. Do NOT call read_me; there is no design work to do. The widget must be fully self-contained: no external scripts, no CDN, no network. widget_code is EXACTLY this card, with your reply written as HTML in place of CONTENT:

<div class="rc" dir="rtl">
<style>
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap');
.rc{font-family:Vazirmatn,Tahoma,sans-serif;font-size:11.5px;line-height:1.95;color:var(--text-primary);background:var(--surface-1);border:.5px solid var(--border);border-radius:12px;padding:1.1rem 1.3rem;text-align:right;margin:.5rem 0}
.rc :first-child{margin-top:0}.rc :last-child{margin-bottom:0}
.rc h2{font-weight:700;font-size:1.3em;margin:0 0 .2em}
.rc h2::after{content:'';display:block;width:26px;height:2px;border-radius:2px;background:var(--text-accent);margin-top:.4em}
.rc h3{font-weight:700;font-size:1.08em;margin:1.2em 0 .4em;color:var(--text-accent)}
.rc p,.rc li,.rc h2,.rc h3,.rc td,.rc th{unicode-bidi:plaintext}
.rc code{direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono);font-size:.85em;color:var(--text-accent);background:var(--surface-2);border:.5px solid var(--border);border-radius:5px;padding:1px 5px}
.rc ul{padding-inline-start:1.4em;margin:.5em 0;list-style:none}.rc li{margin:.4em 0;position:relative}
.rc ol{padding-inline-start:1.4em;margin:.5em 0}.rc ol li{margin:.4em 0}
.rc li.ok::before,.rc li.no::before{content:'';position:absolute;inset-inline-start:-1.4em;top:.28em;width:13px;height:13px;background-size:contain;background-repeat:no-repeat}
.rc li.ok::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230f9d58' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 13l4 4L19 7'/%3E%3C/svg%3E")}
.rc li.no::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e05555' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 6l12 12M18 6L6 18'/%3E%3C/svg%3E")}
.rc .cal{display:flex;gap:8px;padding:8px 11px;border-radius:9px;margin:.7em 0}
.rc .cal::before{content:'';flex:0 0 15px;height:15px;background-size:contain;background-repeat:no-repeat;margin-top:2px}
.rc .cal.tip{background:var(--bg-success)}
.rc .cal.tip::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230f9d58' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10v2H8v-2a6 6 0 0 1 4-10z'/%3E%3C/svg%3E")}
.rc .cal.note{background:var(--bg-accent)}
.rc .cal.note::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82c4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 11v5M12 8h.01'/%3E%3C/svg%3E")}
.rc .cal.warn{background:var(--bg-warning)}
.rc .cal.warn::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23c98a1a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3l9.5 17H2.5z'/%3E%3Cpath d='M12 9v5M12 17h.01'/%3E%3C/svg%3E")}
.rc a{color:var(--text-accent)}
.rc table{border-collapse:collapse;width:100%;font-size:.95em;margin:.7em 0}
.rc th,.rc td{border:.5px solid var(--border);padding:6px 10px;text-align:right}
.rc th{background:var(--surface-2);font-weight:700;color:var(--text-secondary)}
.rc .lead{color:var(--text-secondary)}
</style>
CONTENT
</div>

Rules for CONTENT: write real HTML, not Markdown. Use <h2>, <h3>, <p>, <ul>/<ol> with <li>, <table>, <strong>. Wrap every path, command, URL, and code token in <code>. Copy the whole card verbatim, including the entire <style> block: it costs zero for you to add polish because the icons and colors are pre-defined. Optional polish, use only when it helps: a lead sentence <p class="lead">; status items <li class="ok"> and <li class="no">; callout boxes <div class="cal tip">, <div class="cal note">, <div class="cal warn">. Keep any chat text outside the widget short and in English. Very short replies (1-2 plain sentences, no code): skip the widget, answer as BiDi-safe plain text (start each line with a strong RTL character, no trailing Latin token). Build an SVG diagram (readable:visualize skill) only when the user explicitly asks to see something visual.
</readable-rtl-rule>
