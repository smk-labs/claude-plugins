#!/usr/bin/env python3
"""parsi PreToolUse hook for mcp__visualize__show_widget.

The model writes its Persian reply as plain Markdown between <md> and </md>.
This hook converts it to HTML and wraps it in a fixed RTL shell (Vazirmatn,
per-block bidi resolution, LTR-isolated code). The shell costs zero model
tokens because it is injected here, not generated.

Fail-open: on any error the hook stays silent (exit 0, no output) and the
tool call proceeds with its original input.
"""
import html
import json
import re
import sys

TOOL = "mcp__visualize__show_widget"

STYLE = (
    "<style>"
    "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500&display=swap');"
    "#parsi{direction:rtl;text-align:start;font-family:Vazirmatn,-apple-system,'Segoe UI',Tahoma,sans-serif;"
    "font-size:16px;line-height:1.9;color:var(--text-primary);padding:.25rem 0}"
    "#parsi p,#parsi li,#parsi h1,#parsi h2,#parsi h3,#parsi h4,#parsi td,#parsi th,#parsi blockquote{unicode-bidi:plaintext}"
    "#parsi h1{font-size:22px;font-weight:500;margin:1.2rem 0 .6rem}"
    "#parsi h2{font-size:18px;font-weight:500;margin:1.1rem 0 .5rem}"
    "#parsi h3,#parsi h4{font-size:16px;font-weight:500;margin:1rem 0 .4rem}"
    "#parsi p{margin:.5rem 0}"
    "#parsi strong{font-weight:500}"
    "#parsi code{direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono);font-size:14px;"
    "background:var(--surface-1);border:0.5px solid var(--border);border-radius:4px;padding:1px 5px}"
    "#parsi pre{direction:ltr;unicode-bidi:isolate;text-align:left;background:var(--surface-1);"
    "border:0.5px solid var(--border);border-radius:var(--radius);padding:12px 14px;overflow-x:auto;line-height:1.6}"
    "#parsi pre code{background:none;border:none;padding:0}"
    "#parsi a{color:var(--text-accent)}"
    "#parsi a.u{direction:ltr;unicode-bidi:isolate;word-break:break-all}"
    "#parsi ul,#parsi ol{margin:.5rem 0;padding-inline-start:1.4rem}"
    "#parsi li{margin:.25rem 0}"
    "#parsi blockquote{margin:.8rem 0;padding:.2rem 1rem;border-inline-start:2px solid var(--border-strong);"
    "border-radius:0;color:var(--text-secondary)}"
    "#parsi table{border-collapse:collapse;margin:.8rem 0;width:100%;font-size:15px}"
    "#parsi th{font-weight:500;text-align:start}"
    "#parsi th,#parsi td{border:0.5px solid var(--border);padding:6px 10px}"
    "#parsi hr{border:none;border-top:0.5px solid var(--border);margin:1.2rem 0}"
    "#parsi svg{max-width:100%;height:auto;display:block;margin:.8rem auto}"
    "</style>"
)

SENTINEL = re.compile(r"^\s*<md>\s*\n?(.*?)\n?\s*</md>\s*$", re.S)
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
    return '<div id="parsi" dir="rtl">%s%s</div>' % (STYLE, body)


def main():
    data = json.load(sys.stdin)
    if data.get("tool_name") != TOOL:
        return
    tool_input = data.get("tool_input") or {}
    code = tool_input.get("widget_code") or ""
    m = SENTINEL.match(code)
    if not m:
        return
    new_input = dict(tool_input)
    new_input["widget_code"] = wrap(convert(m.group(1)))
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": new_input,
        }
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)
