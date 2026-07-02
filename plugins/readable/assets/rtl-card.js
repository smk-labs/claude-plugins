/* readable rtl-card renderer, v2.1.
   Finds the <script type="text/markdown"> block in this widget, converts its
   Markdown to HTML, and renders it as a polished RTL card (Vazirmatn,
   per-block direction resolution, LTR-isolated code/paths/URLs). Served via
   jsDelivr from github.com/smk-labs/claude-plugins, pinned by release tag.
   Mirrors plugins/readable/hooks/rtl_card.py: keep the two in sync. */
(function () {
  "use strict";

  var STYLE =
    "<style>" +
    "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');" +
    "#rtl-card{direction:rtl;text-align:start;font-family:Vazirmatn,-apple-system,'Segoe UI',Tahoma,sans-serif;" +
    "font-size:16px;line-height:1.9;color:var(--text-primary);background:var(--surface-1);" +
    "border:0.5px solid var(--border);border-radius:12px;padding:1.25rem 1.5rem;margin:.5rem 0}" +
    "#rtl-card>:first-child{margin-top:0}#rtl-card>:last-child{margin-bottom:0}" +
    "#rtl-card p,#rtl-card li,#rtl-card h1,#rtl-card h2,#rtl-card h3,#rtl-card h4," +
    "#rtl-card td,#rtl-card th,#rtl-card blockquote{unicode-bidi:plaintext}" +
    "#rtl-card h1{font-size:22px;font-weight:700;margin:1.4rem 0 .7rem}" +
    "#rtl-card h2{font-size:18px;font-weight:700;margin:1.2rem 0 .6rem}" +
    "#rtl-card h3,#rtl-card h4{font-size:16px;font-weight:700;margin:1rem 0 .5rem}" +
    "#rtl-card p{margin:.65rem 0}" +
    "#rtl-card strong{font-weight:700}" +
    "#rtl-card code{direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono);font-size:13.5px;" +
    "background:var(--surface-2);border:0.5px solid var(--border);border-radius:5px;padding:2px 6px}" +
    "#rtl-card pre{direction:ltr;unicode-bidi:isolate;text-align:left;background:var(--surface-2);" +
    "border:0.5px solid var(--border);border-radius:8px;padding:12px 16px;overflow-x:auto;line-height:1.7}" +
    "#rtl-card pre code{background:none;border:none;padding:0;font-size:13.5px}" +
    "#rtl-card a{color:var(--text-accent);text-decoration:none;border-bottom:1px solid var(--border-strong)}" +
    "#rtl-card a.u{direction:ltr;unicode-bidi:isolate;word-break:break-all}" +
    "#rtl-card ul,#rtl-card ol{margin:.65rem 0;padding-inline-start:1.5rem}" +
    "#rtl-card li{margin:.35rem 0}" +
    "#rtl-card blockquote{margin:1rem 0;padding:.3rem 1.1rem;border-inline-start:3px solid var(--border-strong);" +
    "border-radius:0;color:var(--text-secondary)}" +
    "#rtl-card table{border-collapse:collapse;margin:1rem 0;width:100%;font-size:15px}" +
    "#rtl-card th{font-weight:700;text-align:start;color:var(--text-secondary);font-size:14px}" +
    "#rtl-card th,#rtl-card td{border:none;border-bottom:0.5px solid var(--border);padding:8px 12px}" +
    "#rtl-card tbody tr:last-child td{border-bottom:none}" +
    "#rtl-card hr{border:none;border-top:0.5px solid var(--border);margin:1.4rem 0}" +
    "#rtl-card svg{max-width:100%;height:auto;display:block;margin:1rem auto}" +
    "</style>";

  var HEADING = /^(#{1,4})\s+(.*)$/;
  var RULER = /^(-{3,}|\*{3,})$/;
  var ULIST = /^\s*[-*+]\s+(.*)$/;
  var OLIST = /^\s*\d+[.)]\s+(.*)$/;
  var TABLE_SEP = /^\|?[\s:|-]+\|?$/;

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function inline(text) {
    var stash = [];
    var s = esc(text);
    s = s.replace(/`([^`]+)`/g, function (m, c) {
      stash.push(c);
      return "\x00" + (stash.length - 1) + "\x00";
    });
    s = s.replace(/\*\*([^]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/(^|[^"&gt;=\/])(https?:\/\/[^\s<>"\)]+)/g, '$1<a class="u" href="$2">$2</a>');
    s = s.replace(/\x00(\d+)\x00/g, function (m, i) {
      return "<code>" + stash[+i] + "</code>";
    });
    return s;
  }

  function cells(row) {
    return row.trim().replace(/^\||\|$/g, "").split("|").map(function (c) {
      return c.trim();
    });
  }

  function convert(md) {
    var lines = md.replace(/\r\n/g, "\n").split("\n");
    var out = [];
    var i = 0;
    var n = lines.length;
    while (i < n) {
      var s = lines[i].trim();
      if (!s) { i += 1; continue; }
      if (s.indexOf("```") === 0) {
        i += 1;
        var buf = [];
        while (i < n && lines[i].trim().indexOf("```") !== 0) { buf.push(lines[i]); i += 1; }
        i += 1;
        out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>");
        continue;
      }
      if (s.toLowerCase().indexOf("<svg") === 0) {
        var svg = [];
        while (i < n) {
          svg.push(lines[i]);
          if (lines[i].toLowerCase().indexOf("</svg>") !== -1) { i += 1; break; }
          i += 1;
        }
        out.push(svg.join("\n"));
        continue;
      }
      var m = HEADING.exec(s);
      if (m) {
        var lvl = m[1].length;
        out.push("<h" + lvl + ">" + inline(m[2]) + "</h" + lvl + ">");
        i += 1;
        continue;
      }
      if (RULER.test(s)) { out.push("<hr>"); i += 1; continue; }
      if (s.charAt(0) === ">") {
        var q = [];
        while (i < n && lines[i].trim().charAt(0) === ">") {
          q.push(inline(lines[i].trim().slice(1).trim()));
          i += 1;
        }
        out.push("<blockquote><p>" + q.filter(Boolean).join("<br>") + "</p></blockquote>");
        continue;
      }
      if (ULIST.test(s)) {
        var ul = [];
        while (i < n && ULIST.test(lines[i])) { ul.push(inline(ULIST.exec(lines[i])[1])); i += 1; }
        out.push("<ul>" + ul.map(function (it) { return "<li>" + it + "</li>"; }).join("") + "</ul>");
        continue;
      }
      if (OLIST.test(s)) {
        var ol = [];
        while (i < n && OLIST.test(lines[i])) { ol.push(inline(OLIST.exec(lines[i])[1])); i += 1; }
        out.push("<ol>" + ol.map(function (it) { return "<li>" + it + "</li>"; }).join("") + "</ol>");
        continue;
      }
      if (s.charAt(0) === "|" && i + 1 < n && TABLE_SEP.test(lines[i + 1].trim()) && lines[i + 1].indexOf("-") !== -1) {
        var head = cells(s);
        i += 2;
        var rows = [];
        while (i < n && lines[i].trim().charAt(0) === "|") { rows.push(cells(lines[i])); i += 1; }
        var thead = "<thead><tr>" + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead>";
        var tbody = "<tbody>" + rows.map(function (r) {
          return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody>";
        out.push("<table>" + thead + tbody + "</table>");
        continue;
      }
      var para = [s];
      i += 1;
      while (i < n) {
        var nxt = lines[i].trim();
        if (!nxt || nxt.indexOf("```") === 0 || nxt.charAt(0) === ">" || nxt.charAt(0) === "|" ||
            nxt.toLowerCase().indexOf("<svg") === 0 || HEADING.test(nxt) || RULER.test(nxt) ||
            ULIST.test(nxt) || OLIST.test(nxt)) { break; }
        para.push(nxt);
        i += 1;
      }
      out.push("<p>" + inline(para.join(" ")) + "</p>");
    }
    return out.join("\n");
  }

  function render() {
    var src = document.querySelector('script[type="text/markdown"]');
    if (!src || src.getAttribute("data-rendered")) { return; }
    src.setAttribute("data-rendered", "1");
    var md = src.textContent.replace(/^\s*\n/, "").replace(/\s+$/, "");
    var card = document.createElement("div");
    card.id = "rtl-card";
    card.setAttribute("dir", "rtl");
    card.innerHTML = STYLE + convert(md);
    src.parentNode.insertBefore(card, src);
  }

  try { render(); } catch (e) { /* leave the widget as-is */ }
})();
