#!/usr/bin/env python3
"""readable plugin PreToolUse hook for mcp__visualize__show_widget.

The model writes its Persian reply as plain Markdown inside a
<script type="text/markdown"> block (or the legacy <md>...</md> sentinel).
This hook converts it to HTML and wraps it in a fixed RTL shell (Vazirmatn,
per-block bidi resolution, LTR-isolated code). The shell costs zero model
tokens because it is injected here, not generated.

This is the FAST PATH: some hosts (Claude Desktop chat, observed 2026-07)
record the hook output but ignore updatedInput. There the widget renders the
model's original input, and the CDN renderer referenced inside it
(assets/rtl-card.js, kept in sync with this converter) does the same job in
the browser instead.

Fail-safe in two modes: input without the <md> sentinel (or unparseable stdin)
passes through silently; a sentinel card whose conversion fails is denied with
guidance, so the model immediately re-sends the reply as a hand-written HTML
card and the raw sentinel never reaches the screen.
"""
import html
import json
import re
import sys

TOOL = "mcp__visualize__show_widget"

STYLE = (
    "<style>"
    "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500&display=swap');"
    "#rtl-card{direction:rtl;text-align:start;font-family:Vazirmatn,-apple-system,'Segoe UI',Tahoma,sans-serif;"
    "font-size:16px;line-height:1.9;color:var(--text-primary);padding:.25rem 0}"
    "#rtl-card p,#rtl-card li,#rtl-card h1,#rtl-card h2,#rtl-card h3,#rtl-card h4,#rtl-card td,#rtl-card th,#rtl-card blockquote{unicode-bidi:plaintext}"
    "#rtl-card h1{font-size:22px;font-weight:500;margin:1.2rem 0 .6rem}"
    "#rtl-card h2{font-size:18px;font-weight:500;margin:1.1rem 0 .5rem}"
    "#rtl-card h3,#rtl-card h4{font-size:16px;font-weight:500;margin:1rem 0 .4rem}"
    "#rtl-card p{margin:.5rem 0}"
    "#rtl-card strong{font-weight:500}"
    "#rtl-card code{direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono);font-size:14px;"
    "background:var(--surface-1);border:0.5px solid var(--border);border-radius:4px;padding:1px 5px}"
    "#rtl-card pre{direction:ltr;unicode-bidi:isolate;text-align:left;background:var(--surface-1);"
    "border:0.5px solid var(--border);border-radius:var(--radius);padding:12px 14px;overflow-x:auto;line-height:1.6}"
    "#rtl-card pre code{background:none;border:none;padding:0}"
    "#rtl-card a{color:var(--text-accent)}"
    "#rtl-card a.u{direction:ltr;unicode-bidi:isolate;word-break:break-all}"
    "#rtl-card ul,#rtl-card ol{margin:.5rem 0;padding-inline-start:1.4rem}"
    "#rtl-card li{margin:.25rem 0}"
    "#rtl-card blockquote{margin:.8rem 0;padding:.2rem 1rem;border-inline-start:2px solid var(--border-strong);"
    "border-radius:0;color:var(--text-secondary)}"
    "#rtl-card table{border-collapse:collapse;margin:.8rem 0;width:100%;font-size:15px}"
    "#rtl-card th{font-weight:500;text-align:start}"
    "#rtl-card th,#rtl-card td{border:0.5px solid var(--border);padding:6px 10px}"
    "#rtl-card hr{border:none;border-top:0.5px solid var(--border);margin:1.2rem 0}"
    "#rtl-card svg{max-width:100%;height:auto;display:block;margin:.8rem auto}"
    "</style>"
)

SENTINEL = re.compile(r"^\s*<md>\s*\n?(.*?)\n?\s*</md>\s*$", re.S)
SCRIPT_FORM = re.compile(
    r'^\s*<script type="text/markdown">\s*\n?(.*?)\n?\s*</script>', re.S
)
HEADING = re.compile(r"^(#{1,4})\s+(.*)$")
RULE = re.compile(r"^(-{3,}|\*{3,})$")
ULIST = re.compile(r"^\s*[-*+]\s+(.*)$")
OLIST = re.compile(r"^\s*\d+[.)]\s+(.*)$")
TABLE_SEP = re.compile(r"^\|?[\s:|-]+\|?$")


def _inline(text):
    s = html.escape(text, quote=False)
    stash = []

    def keep(m):
        stash.append(m.group(1))
        return "\x00%d\x00" % (len(stash) - 1)

    s = re.sub(r"`([^`]+)`", keep, s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', s)
    s = re.sub(r'(?<!["&gt;=/])(https?://[^\s<>"\)]+)', r'<a class="u" href="\1">\1</a>', s)
    s = re.sub("\x00(\\d+)\x00", lambda m: "<code>" + stash[int(m.group(1))] + "</code>", s)
    return s


def _cells(row):
    return [c.strip() for c in row.strip().strip("|").split("|")]


def convert(md):
    lines = md.replace("\r\n", "\n").split("\n")
    out = []
    i, n = 0, len(lines)
    while i < n:
        raw = lines[i]
        s = raw.strip()
        if not s:
            i += 1
            continue
        if s.startswith("```"):
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(buf)))
            continue
        if s.lower().startswith("<svg"):
            buf = []
            while i < n:
                buf.append(lines[i])
                if "</svg>" in lines[i].lower():
                    i += 1
                    break
                i += 1
            out.append("\n".join(buf))
            continue
        m = HEADING.match(s)
        if m:
            lvl = len(m.group(1))
            out.append("<h%d>%s</h%d>" % (lvl, _inline(m.group(2)), lvl))
            i += 1
            continue
        if RULE.match(s):
            out.append("<hr>")
            i += 1
            continue
        if s.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(_inline(lines[i].strip()[1:].strip()))
                i += 1
            out.append("<blockquote><p>%s</p></blockquote>" % "<br>".join(b for b in buf if b))
            continue
        if ULIST.match(s):
            items = []
            while i < n and ULIST.match(lines[i]):
                items.append(_inline(ULIST.match(lines[i]).group(1)))
                i += 1
            out.append("<ul>%s</ul>" % "".join("<li>%s</li>" % it for it in items))
            continue
        if OLIST.match(s):
            items = []
            while i < n and OLIST.match(lines[i]):
                items.append(_inline(OLIST.match(lines[i]).group(1)))
                i += 1
            out.append("<ol>%s</ol>" % "".join("<li>%s</li>" % it for it in items))
            continue
        if s.startswith("|") and i + 1 < n and TABLE_SEP.match(lines[i + 1].strip()) and "-" in lines[i + 1]:
            head = _cells(s)
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(_cells(lines[i]))
                i += 1
            thead = "<thead><tr>%s</tr></thead>" % "".join("<th>%s</th>" % _inline(c) for c in head)
            tbody = "<tbody>%s</tbody>" % "".join(
                "<tr>%s</tr>" % "".join("<td>%s</td>" % _inline(c) for c in r) for r in rows
            )
            out.append("<table>%s%s</table>" % (thead, tbody))
            continue
        buf = [s]
        i += 1
        while i < n:
            nxt = lines[i].strip()
            if (not nxt or nxt.startswith(("```", ">", "|", "<svg", "<SVG"))
                    or HEADING.match(nxt) or RULE.match(nxt) or ULIST.match(nxt) or OLIST.match(nxt)):
                break
            buf.append(nxt)
            i += 1
        out.append("<p>%s</p>" % _inline(" ".join(buf)))
    return "\n".join(out)


def wrap(body):
    return '<div id="rtl-card" dir="rtl">%s%s</div>' % (STYLE, body)


FALLBACK = (
    "rtl-card hook: converting the <md> Markdown card failed. Re-send this exact "
    "show_widget call yourself as a full RTL HTML card instead: a <div dir=\"rtl\" "
    "lang=\"fa\"> wrapper (match the reply language), text-align: right, the "
    "Vazirmatn 400/500 font via fonts.googleapis.com, colors only through the host "
    "theme's CSS variables, transparent background, and every file path, URL, or "
    "CLI token wrapped in <span dir=\"ltr\" style=\"display:inline-block; "
    "unicode-bidi: isolate;\">...</span>. Keep the same title and loading_messages. "
    "Do not use the <md> sentinel again for this reply."
)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    if data.get("tool_name") != TOOL:
        return
    tool_input = data.get("tool_input") or {}
    code = tool_input.get("widget_code") or ""
    m = SENTINEL.match(code) or SCRIPT_FORM.match(code)
    if not m:
        return
    try:
        new_input = dict(tool_input)
        new_input["widget_code"] = wrap(convert(m.group(1)))
        out = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "updatedInput": new_input,
            }
        }
    except Exception:
        out = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": FALLBACK,
            }
        }
    print(json.dumps(out))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)
