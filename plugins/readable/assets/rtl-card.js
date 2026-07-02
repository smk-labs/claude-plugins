/* readable rtl-card renderer, v2.2 "Persian editorial".
   Finds the <script type="text/markdown"> block in this widget, converts its
   Markdown to HTML, and renders it as a polished RTL reading card: Vazirmatn
   400/700/800, accent bar under h1, persian-numbered ordered lists, framed
   editorial tables, icon callouts (> [!TIP] etc.), status list items (leading
   check/cross/warning glyphs), LTR-isolated code/paths/URLs. All icons and
   styling live here: zero model tokens. Served via jsDelivr, pinned by tag.
   The python hook (hooks/rtl_card.py) mirrors the STYLE only; this file is
   canonical and a superset. */
(function () {
  "use strict";

  var STYLE =
    "<style>" +
    "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800&display=swap');" +
    "@keyframes rcIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
    "#rtl-card{direction:rtl;text-align:start;font-family:Vazirmatn,-apple-system,'Segoe UI',Tahoma,sans-serif;" +
    "font-size:16px;line-height:1.95;color:var(--text-primary);background:var(--surface-1);" +
    "border:0.5px solid var(--border);border-radius:14px;padding:1.5rem 1.75rem;margin:.5rem 0;" +
    "animation:rcIn .35s ease-out}" +
    "#rtl-card>:first-child{margin-top:0}#rtl-card>:last-child{margin-bottom:0}" +
    "#rtl-card ::selection{background:var(--bg-accent)}" +
    "#rtl-card p,#rtl-card li,#rtl-card h1,#rtl-card h2,#rtl-card h3,#rtl-card h4," +
    "#rtl-card td,#rtl-card th,#rtl-card blockquote{unicode-bidi:plaintext}" +
    "#rtl-card h1{font-size:24px;font-weight:800;line-height:1.5;margin:1.5rem 0 .8rem}" +
    "#rtl-card h1::after{content:'';display:block;width:40px;height:3px;border-radius:2px;margin-top:.5rem;" +
    "background:var(--fill-accent,var(--text-accent))}" +
    "#rtl-card h2{font-size:19px;font-weight:800;margin:1.5rem 0 .6rem}" +
    "#rtl-card h3,#rtl-card h4{font-size:16px;font-weight:700;margin:1.1rem 0 .5rem}" +
    "#rtl-card p{margin:.7rem 0}" +
    "#rtl-card strong{font-weight:700}" +
    "#rtl-card code{direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono);font-size:13.5px;" +
    "color:var(--text-accent);background:var(--surface-2);border:0.5px solid var(--border);" +
    "border-radius:6px;padding:2px 7px}" +
    "#rtl-card pre{direction:ltr;unicode-bidi:isolate;text-align:left;background:var(--surface-2);" +
    "border:0.5px solid var(--border);border-radius:10px;padding:14px 16px;overflow-x:auto;line-height:1.7}" +
    "#rtl-card pre code{background:none;border:none;padding:0;color:inherit;font-size:13.5px}" +
    "#rtl-card a{color:var(--text-accent);text-decoration:none;border-bottom:1px solid transparent;" +
    "transition:border-color .15s}" +
    "#rtl-card a:hover{border-bottom-color:var(--text-accent)}" +
    "#rtl-card a.u{direction:ltr;unicode-bidi:isolate;word-break:break-all}" +
    "#rtl-card ul,#rtl-card ol{margin:.7rem 0;padding-inline-start:1.6rem}" +
    "#rtl-card ol{list-style-type:persian}" +
    "#rtl-card li{margin:.4rem 0}" +
    "#rtl-card li::marker{color:var(--text-accent)}" +
    "#rtl-card li.rc-i{list-style:none;position:relative}" +
    "#rtl-card li.rc-i svg{position:absolute;inset-inline-start:-1.55rem;top:.42em;width:15px;height:15px}" +
    "#rtl-card li.rc-ok svg{color:var(--text-success)}" +
    "#rtl-card li.rc-no svg{color:var(--text-danger)}" +
    "#rtl-card li.rc-warn svg{color:var(--text-warning)}" +
    "#rtl-card .rc-co{display:flex;gap:11px;align-items:flex-start;padding:13px 15px;border-radius:11px;margin:1rem 0}" +
    "#rtl-card .rc-co svg{width:19px;height:19px;flex-shrink:0;margin-top:.3em}" +
    "#rtl-card .rc-co .rc-b{min-width:0}" +
    "#rtl-card .rc-co p{margin:.2rem 0}" +
    "#rtl-card .rc-note{background:var(--bg-accent);color:var(--text-accent)}" +
    "#rtl-card .rc-tip{background:var(--bg-success);color:var(--text-success)}" +
    "#rtl-card .rc-warning{background:var(--bg-warning);color:var(--text-warning)}" +
    "#rtl-card .rc-danger{background:var(--bg-danger);color:var(--text-danger)}" +
    "#rtl-card blockquote{margin:1rem 0;padding:.35rem 1.15rem;" +
    "border-inline-start:3px solid var(--border-strong);border-radius:0;color:var(--text-secondary)}" +
    "#rtl-card table{border-collapse:separate;border-spacing:0;margin:1.1rem 0;width:100%;font-size:15px;" +
    "border:0.5px solid var(--border);border-radius:11px;overflow:hidden}" +
    "#rtl-card th{font-weight:700;text-align:start;color:var(--text-secondary);font-size:13.5px;" +
    "background:var(--surface-2)}" +
    "#rtl-card th,#rtl-card td{padding:9px 14px;border-bottom:0.5px solid var(--border)}" +
    "#rtl-card tbody tr:last-child td{border-bottom:none}" +
    "#rtl-card hr{border:none;height:2px;width:56px;border-radius:1px;background:var(--border-strong);" +
    "margin:1.6rem auto}" +
    "#rtl-card>svg{max-width:100%;height:auto;display:block;margin:1rem auto}" +
    "</style>";

  var SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var IC = {
    note: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v4h1"/></svg>',
    tip: SVG_OPEN + '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.7 10.7c-.5.4-.7 1-.7 1.6v.7h-6v-.7c0-.6-.2-1.2-.7-1.6A6 6 0 0 1 12 3z"/></svg>',
    warning: SVG_OPEN + '<path d="M12 4 2.5 20h19L12 4z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>',
    danger: SVG_OPEN + '<path d="M7.9 2.5h8.2l5.4 5.4v8.2l-5.4 5.4H7.9l-5.4-5.4V7.9l5.4-5.4z"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
    ok: SVG_OPEN + '<path d="M4 12.5 9.5 18 20 6.5"/></svg>',
    no: SVG_OPEN + '<path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>'
  };
  IC.warn = IC.warning;

  var HEADING = /^(#{1,4})\s+(.*)$/;
  var RULER = /^(-{3,}|\*{3,})$/;
  var ULIST = /^\s*[-*+]\s+(.*)$/;
  var OLIST = /^\s*\d+[.)]\s+(.*)$/;
  var TABLE_SEP = /^\|?[\s:|-]+\|?$/;
  var CALLOUT = /^\[!(NOTE|TIP|WARNING|DANGER)\]\s*(.*)$/i;
  var STATUS = { "✓": "ok", "✔": "ok", "✗": "no", "✘": "no", "✖": "no", "⚠": "warn" };

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

  function listItem(text) {
    var t = text.trim();
    var kind = STATUS[t.charAt(0)];
    if (kind) {
      var rest = t.slice(1).replace(/^️/, "").trim();
      return '<li class="rc-i rc-' + kind + '">' + IC[kind] + inline(rest) + "</li>";
    }
    return "<li>" + inline(t) + "</li>";
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
          q.push(lines[i].trim().slice(1).trim());
          i += 1;
        }
        var co = CALLOUT.exec(q[0] || "");
        if (co) {
          var kind = co[1].toLowerCase();
          var body = [co[2]].concat(q.slice(1)).filter(Boolean).map(inline).join("<br>");
          out.push('<div class="rc-co rc-' + kind + '">' + IC[kind] +
            '<div class="rc-b"><p>' + body + "</p></div></div>");
        } else {
          out.push("<blockquote><p>" + q.filter(Boolean).map(inline).join("<br>") + "</p></blockquote>");
        }
        continue;
      }
      if (ULIST.test(s)) {
        var ul = [];
        while (i < n && ULIST.test(lines[i])) { ul.push(listItem(ULIST.exec(lines[i])[1])); i += 1; }
        out.push("<ul>" + ul.join("") + "</ul>");
        continue;
      }
      if (OLIST.test(s)) {
        var ol = [];
        while (i < n && OLIST.test(lines[i])) { ol.push(listItem(OLIST.exec(lines[i])[1])); i += 1; }
        out.push("<ol>" + ol.join("") + "</ol>");
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
