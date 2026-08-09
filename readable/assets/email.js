/* readable email export - THE single transform from card HTML to email HTML. */
/* Consumed by BOTH hosts: */
/*   - server/server.js require()s it for the render_email tool (chat card; the ui:// template must stay under the host's ~30KB ceiling, so the card never carries this code) */
/*   - skills/report/build.py inlines it into the standalone report shell, which has no server to call */
/* Before 5.4.0 those two hosts each had their OWN adapter and they drifted: the server shipped a div/inline-block style map, the report a getComputedStyle walker that kept <svg> and flattened grid to block. Neither produced a table, so a KPI row pasted into Outlook as a run of naked numbers. One file, one behaviour. */
/* THE RULE, and everything below exists to keep it: email clients are not browsers. Gmail strips <style> on forward and reply, Outlook on Windows renders through the Word engine. So the output carries NO class, NO <style>, NO custom property, NO grid, NO flex, NO ::before/::after, NO color-mix()/:is()/:has(), NO logical property. Every colour is a literal, every rule is a style attribute, every layout is a <table> - the one primitive every client supports - and every pseudo-element decoration is materialized as a real character before serializing. server/test.js asserts the whole forbidden list against the output. */
/* STYLE CONTRACT (build.py's inliner): block comments occupy whole lines; code lines are code. Lines starting with /* are dropped, the rest joined with newlines. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.__rcEmailRender = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* The kit palette written down as literals: the server owns rc.css, so the map is declared rather than measured. A project brand overrides any of these through opts.brand (its brand.css text). */
  var DEF = {
    light: { tx: '#1f1f1f', sub: '#6f6f6a', ac: '#2f66c4', s1: '#ffffff', s2: '#f2f2ef', bd: '#dcdcd6', bs: '#b8b8b0', gok: '#e6f4ec', gac: '#e8effc', gwa: '#faf0d9', gda: '#fbe9e7' },
    dark: { tx: '#ececea', sub: '#9f9f98', ac: '#82abec', s1: '#262624', s2: '#302f2c', bd: '#3e3e3a', bs: '#55554f', gok: '#143122', gac: '#16283f', gwa: '#382c13', gda: '#3a1d19' },
  };
  var VAR = {
    tx: '--text-primary', sub: '--text-secondary', ac: '--text-accent', s1: '--surface-1', s2: '--surface-2',
    bd: '--border', bs: '--border-strong', gok: '--bg-success', gac: '--bg-accent', gwa: '--bg-warning', gda: '--bg-danger',
    ca: '--ca', cb: '--cb', cc: '--cc', cd: '--cd',
  };
  var CD = '#d96666', WARN = '#c98a1a';
  var MONO = 'ui-monospace,Menlo,monospace';
  var VOID = { br: 1, hr: 1, img: 1 };
  var FA = '۰۱۲۳۴۵۶۷۸۹';

  function hex(c) {
    var m = /^#([0-9a-fA-F]{3,8})$/.exec(String(c).trim());
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    if (h.length < 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  /* rc.css derives the chart hues from the accent with color-mix(), which no client supports. The same ramp, computed in sRGB, so a branded card keeps its own chart colours in email. */
  function mix(a, b, p) {
    var x = hex(a), y = hex(b);
    if (!x || !y) return a;
    function h2(v) { var s = Math.round(v).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h2(x[0] * p + y[0] * (1 - p)) + h2(x[1] * p + y[1] * (1 - p)) + h2(x[2] * p + y[2] * (1 - p));
  }

  /* Pull the light (or dark) custom-property values out of a brand.css. The brand vocabulary is a :root{} light block plus a bare [data-theme="dark"]{} dark block (skills/brand/SKILL.md), so a selector naming "dark" IS the dark block - including the @media (prefers-color-scheme:dark) wrapper, whose opening line the chunker hands back as part of the selector. Only literal hex lands; a var() or a color-mix() in a brand file falls back to the kit default rather than leaking an unresolvable token into the email. */
  function scan(css, dark) {
    var out = {};
    if (!css) return out;
    var s = String(css).replace(/\/\*[^]*?\*\//g, '');
    var re = /([^{}]*)\{([^{}]*)\}/g, m;
    while ((m = re.exec(s))) {
      if (/dark/i.test(m[1]) !== !!dark) continue;
      var vr = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+)/g, v;
      while ((v = vr.exec(m[2]))) out[v[1]] = v[2].trim();
    }
    return out;
  }

  function palette(theme, brandCss) {
    var dark = theme === 'dark', base = DEF[dark ? 'dark' : 'light'], got = scan(brandCss, dark), P = {}, k;
    for (k in VAR) {
      if (!VAR.hasOwnProperty(k)) continue;
      var v = got[VAR[k]];
      P[k] = (v && v.indexOf('var(') < 0 && v.indexOf('color-mix') < 0) ? v : base[k];
    }
    if (!P.ca) P.ca = P.ac;
    if (!P.cb) P.cb = mix(P.ac, P.s1, 0.55);
    if (!P.cc) P.cc = mix(P.ac, P.s1, 0.28);
    if (!P.cd) P.cd = CD;
    return P;
  }

  /* Minimal tag walker for the card's constrained building-block HTML (already validated upstream: no <style>/<script>). Zero dependencies. */
  function parse(html) {
    var root = { tag: '#root', attrs: {}, children: [], parent: null };
    var cur = root;
    var re = /<!--[^]*?-->|<\/([a-zA-Z][a-zA-Z0-9]*)\s*>|<([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>|([^<]+)/g;
    var m;
    while ((m = re.exec(html))) {
      if (m[1]) {
        var t = m[1].toLowerCase(), n = cur;
        while (n && n.tag !== t) n = n.parent;
        if (n && n.parent) cur = n.parent;
      } else if (m[2]) {
        var tag = m[2].toLowerCase(), attrs = {};
        var ar = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, am;
        while ((am = ar.exec(m[3] || ''))) attrs[am[1].toLowerCase()] = am[2] != null ? am[2] : am[3] != null ? am[3] : am[4] || '';
        var node = { tag: tag, attrs: attrs, children: [], parent: cur };
        cur.children.push(node);
        if (!VOID[tag] && m[4] !== '/') cur = node;
      } else if (m[5]) {
        cur.children.push({ text: m[5] });
      }
    }
    return root;
  }

  /* Direction follows the content's majority script, same rule as the template bridge (ties go RTL: the tool is Persian-first). code/pre spans are stripped before counting - paths and commands are direction-neutral and must not outvote the prose (4.6.1). */
  function dirOf(html) {
    var t = String(html).replace(/<(code|pre)[^>]*>[^]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
    var r = (t.match(/[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g) || []).length;
    var l = (t.match(/[A-Za-z]/g) || []).length;
    return r >= l ? 'rtl' : 'ltr';
  }

  function render(html, opts) {
    var o = opts || {};
    var P = palette(o.theme, o.brand);
    var DIR = o.dir === 'rtl' || o.dir === 'ltr' ? o.dir : dirOf(html);
    var R = DIR === 'rtl';
    var S = R ? 'right' : 'left';
    var E = R ? 'left' : 'right';

    function has(n, c) { return (' ' + ((n && n.attrs && n.attrs['class']) || '') + ' ').indexOf(' ' + c + ' ') !== -1; }
    /* Attribute values come out of the source html already escaped, so & is left alone: escaping it again turns a real &amp; in a url into &amp;amp;. Only what could close the attribute or the tag is touched. */
    function q(v) { return String(v).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
    function elems(n) {
      var out = [], i;
      for (i = 0; i < n.children.length; i++) if (n.children[i].tag) out.push(n.children[i]);
      return out;
    }
    function digits(v) {
      if (!R) return String(v);
      return String(v).replace(/[0-9]/g, function (d) { return FA.charAt(+d); });
    }

    /* Every layout primitive funnels through these two. role=presentation keeps a layout table out of the screen reader's table model; the cellpadding/cellspacing/border/width ATTRIBUTES are what Word actually reads, the style attribute is for everyone else, and dir rides each table because Word resolves direction per table, not from an ancestor. */
    function table(style, body, gap) {
      return '<table dir="' + DIR + '" role="presentation" border="0" cellpadding="0" cellspacing="' + (gap || 0) + '" width="100%" style="' +
        (gap ? 'border-collapse:separate;border-spacing:' + gap + 'px' : 'border-collapse:collapse') + ';width:100%;' + style + '">' + body + '</table>';
    }
    /* align= rather than text-align: Word ignores the CSS in several table cases. */
    function cell(style, inner, extra) {
      return '<td align="' + S + '" valign="top"' + (extra || '') + (style ? ' style="' + style + '"' : '') + '>' + inner + '</td>';
    }
    function row(body) { return '<tr>' + body + '</tr>'; }

    var PANEL = 'background:' + P.s2 + ';border:.5px solid ' + P.bd + ';border-radius:11px;padding:11px 13px';

    /* A KPI row is the first thing that breaks in email, so it is the first thing rebuilt: one table, one td per tile, the number large and bold above a small grey label. c2/c3 fix the tiles per row; anything else caps at three, and a short last row is padded with empty cells so the columns stay even instead of one orphan tile stretching full width. */
    function tiles(n, ctx, per, style) {
      var kids = elems(n), rows = '', i, j, w = Math.floor(100 / per) + '%';
      for (i = 0; i < kids.length; i += per) {
        var tds = '';
        for (j = 0; j < per; j++) {
          var k = kids[i + j];
          tds += k ? cell(style(k), children(k, ctx), ' width="' + w + '"') : '<td width="' + w + '"></td>';
        }
        rows += row(tds);
      }
      return rows;
    }

    /* .flow: the kit draws the arrows as ::after; here they become a real glyph between the steps. Not rebuilt as a table on purpose - an arrow is decoration, and email is not the place to spend a nested table on it. */
    function flowLine(n, ctx) {
      var kids = elems(n), out = '', i;
      for (i = 0; i < kids.length; i++) {
        if (i) out += '<span style="color:' + P.ac + ';padding:0 6px">' + (R ? '←' : '→') + '</span>';
        out += '<b style="font-weight:700">' + children(kids[i], ctx) + '</b>';
      }
      return '<p dir="' + DIR + '" style="margin:10px 0;unicode-bidi:plaintext">' + out + '</p>';
    }

    /* A bar is label / track / value. The track is a two-cell table: the fill cell carries the author's own percentage width and the rest of the row is the empty remainder, so nothing depends on overflow:hidden or a percentage flex. */
    function barRow(n, ctx) {
      var l = '', v = '', fills = [], kids = elems(n), i;
      for (i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (has(k, 'l')) l = children(k, ctx);
        else if (has(k, 'v')) v = children(k, ctx);
        else if (has(k, 't')) {
          var ii = elems(k), j;
          for (j = 0; j < ii.length; j++) {
            var w = (String((ii[j].attrs && ii[j].attrs.style) || '').match(/width\s*:\s*([\d.]+%)/) || [])[1] || '0%';
            fills.push([w, has(n, 'duo') ? (j ? P.cb : P.ca) : P.ac]);
          }
        }
      }
      if (!fills.length) fills.push(['0%', P.ac]);
      var track = '';
      for (i = 0; i < fills.length; i++) {
        track += '<table dir="' + DIR + '" role="presentation" border="0" cellpadding="0" cellspacing="0" width="220" style="border-collapse:collapse;width:220px;margin:2px 0">' +
          '<tr><td width="' + fills[i][0] + '" height="7" style="background:' + fills[i][1] + ';border-radius:4px;font-size:0;line-height:0">&nbsp;</td>' +
          '<td height="7" style="background:' + P.s2 + ';border-radius:4px;font-size:0;line-height:0">&nbsp;</td></tr></table>';
      }
      return row(
        cell('padding:3px 0;color:' + P.sub, l, ' width="26%"') +
        cell('padding:3px 10px', track, ' width="220"') +
        cell('padding:3px 0;font-weight:700;font-size:10.4px', v)
      );
    }

    /* A legend is a swatch plus a label. Stacked under a donut it is a table; sitting above a bar group it is one inline line, the way the kit lays each out. */
    function legend(n, ctx, inline) {
      var kids = elems(n), out = '', i;
      for (i = 0; i < kids.length; i++) {
        var hue = has(kids[i], 'a') ? P.ca : has(kids[i], 'b') ? P.cb : has(kids[i], 'c') ? P.cc : has(kids[i], 'd') ? P.cd : P.sub;
        var sw = '<span style="color:' + hue + ';font-size:13px">■&nbsp;</span>';
        var body = sw + children(kids[i], ctx);
        out += inline ? '<span style="margin-' + E + ':16px">' + body + '</span>' : row(cell('padding:2px 0', body));
      }
      return inline ? '<p dir="' + DIR + '" style="margin:4px 0;font-size:10.4px">' + out + '</p>' : table('margin:9px 0', out);
    }

    function children(n, ctx, num) {
      var last = null, out = '', i;
      for (i = 0; i < n.children.length; i++) if (n.children[i].tag) last = n.children[i];
      for (i = 0; i < n.children.length; i++) {
        var c = n.children[i], sub = ctx;
        /* @NUMBERED is CSS counters, and a counter cannot survive: the numbers are written into the headings as real characters, Persian numerals in an RTL card and decimal in an LTR one, exactly as counter(sec,persian) renders on screen. DIRECT children only, which is not a nicety - h4 is also the kit's card title, so a descendant rule would number every card in a `cards` row and push the real section h4 down the sequence. That is why the counter rides this argument and is never put in ctx: ctx is threaded to every descendant, the argument reaches one level. */
        if (num && c.tag === 'h3') { num.sec++; num.sub = 0; sub = assign(ctx, { label: digits(num.sec) + '.' }); }
        else if (num && c.tag === 'h4') { num.sub++; sub = assign(ctx, { label: digits(num.sec) + '.' + digits(num.sub) }); }
        out += emit(c, n, assign(sub, { isLast: c === last }));
      }
      return out;
    }

    function assign(a, b) {
      var o = {}, k;
      for (k in a) if (a.hasOwnProperty(k)) o[k] = a[k];
      for (k in b) if (b.hasOwnProperty(k)) o[k] = b[k];
      return o;
    }

    function emit(n, parent, ctx) {
      if (n.text != null) return n.text;
      var tag = n.tag;
      function p(c) { return parent != null && has(parent, c); }

      /* Dropped outright: interactive controls (a button does nothing in a mail), svg (every client strips it, so a spark and a donut ring are a blank hole), and the icon glyphs (a CSS mask paints nothing). A spark's data does NOT survive - its polyline is normalized to a 0..100 by 0..30 box, so there are no underlying numbers left to tabulate; a donut's do, and they are in its legend, which is why the ring goes and the legend stays. */
      if (has(n, 'btns') || has(n, 'cta') || tag === 'button' || has(n, 'spark') || tag === 'svg' || has(n, 'donut') || has(n, 'ic')) return '';
      /* An empty <i> is never emphasis in this kit, it is a painted rectangle: a legend swatch or a bar fill. Both are rebuilt above as a character or a cell, so the husk goes. <i>text</i> is left alone. */
      if (tag === 'i' && !n.children.length) return '';

      /* LAYOUT: everything that is grid or flex on screen becomes a table here, and returns straight out - these never fall through to the generic element path. */
      if (has(n, 'grid')) return table('margin:9px 0', tiles(n, assign(ctx, { kpi: true }), has(n, 'c2') ? 2 : has(n, 'c3') ? 3 : Math.min(elems(n).length, 3) || 1, function () { return PANEL + ';unicode-bidi:plaintext'; }), 8);
      if (has(n, 'cards')) return table('margin:9px 0', tiles(n, ctx, has(n, 'c2') ? 2 : 1, function (k) { return PANEL + (has(k, 'pick') ? ';border:1.5px solid ' + P.ac : ''); }), 8);
      if (has(n, 'cols')) return table('margin:9px 0', tiles(n, ctx, Math.min(elems(n).length, 3) || 1, function () { return 'padding:0'; }), 8);
      if (has(n, 'kv')) {
        var rows = '', kids = elems(n), i;
        for (i = 0; i < kids.length; i++) {
          var k = kids[i], b = null, s = null, kk = elems(k), j;
          for (j = 0; j < kk.length; j++) { if (kk[j].tag === 'b' && !b) b = kk[j]; else if (!s) s = kk[j]; }
          var line = i === kids.length - 1 ? '' : ';border-bottom:.5px solid ' + P.bd;
          rows += row(
            '<td align="' + S + '" valign="top" width="45%" style="padding:6px 2px;color:' + P.sub + line + '">' + (b ? children(b, ctx) : '') + '</td>' +
            '<td align="' + E + '" valign="top" style="padding:6px 2px;font-weight:500' + line + '">' + (s ? children(s, ctx) : children(k, ctx)) + '</td>'
          );
        }
        return table('margin:9px 0', rows);
      }
      if (has(n, 'bars')) {
        var brs = '', bl = '', bk = elems(n), bi;
        for (bi = 0; bi < bk.length; bi++) {
          if (has(bk[bi], 'leg')) bl += legend(bk[bi], ctx, true);
          else brs += barRow(bk[bi], ctx);
        }
        return bl + table('margin:9px 0', brs);
      }
      if (has(n, 'leg')) return legend(n, ctx, p('bars'));
      if (has(n, 'donut-w')) return children(n, ctx);
      if (has(n, 'cal') || has(n, 'box')) {
        var edge = has(n, 'tip') ? P.ca : has(n, 'note') ? P.cb : has(n, 'warn') ? WARN : has(n, 'danger') ? P.cd : P.bs;
        var fill = has(n, 'tip') ? P.gok : has(n, 'note') ? P.gac : has(n, 'warn') ? P.gwa : has(n, 'danger') ? P.gda : P.s2;
        var box = has(n, 'box');
        return table('margin:9px 0', row(cell(
          'background:' + (box ? P.s2 : fill) + ';border:.5px solid ' + P.bd + ';border-' + S + ':3px solid ' + (box ? P.bs : edge) +
          ';border-radius:' + (box ? 14 : 10) + 'px;padding:' + (box ? '14px 16px' : '9px 12px'),
          children(n, assign(ctx, { cal: !box })))));
      }
      if (tag === 'blockquote') {
        return table('margin:9px 0', row(cell(
          'border-' + S + ':2.5px solid ' + P.bs + ';padding-' + S + ':12px;color:' + P.sub, children(n, ctx))));
      }
      if (has(n, 'scroll-table')) return children(n, ctx);
      /* @FIG: a report figure is a data: URI (build.py inlines the bytes so the file stays offline), and Gmail refuses to draw one. The caption is the honest fallback; a remote image is kept because a client that loads images can show it. */
      if (tag === 'img') {
        var src = String((n.attrs && n.attrs.src) || '');
        if (!src || src.slice(0, 5) === 'data:') return '';
        return '<img src="' + q(src) + '" alt="' + q((n.attrs && n.attrs.alt) || '') + '" style="display:block;max-width:100%;height:auto;border:.5px solid ' + P.bd + '">';
      }

      var st = '', dir = DIR, pre = '', post = '', tail = '', inner = null, next = ctx, keep = '', as = tag;

      if (tag === 'h2') {
        st = 'font-weight:800;font-size:15.5px;margin:0 0 2px;unicode-bidi:plaintext';
        /* The title rule is 28x3 of solid accent. An empty div with a background is exactly what Word drops, so it ships as a one-cell table with a height attribute - and it sits AFTER the heading, not inside it: a table nested in an <h2> makes the parser close the heading early, which is how a title loses its own styling. */
        tail = '<table dir="' + DIR + '" role="presentation" border="0" cellpadding="0" cellspacing="0" width="28" style="border-collapse:collapse;width:28px;margin:-2px 0 6px">' +
          '<tr><td height="3" style="background:' + P.ac + ';border-radius:2px;font-size:0;line-height:0">&nbsp;</td></tr></table>';
      } else if (tag === 'h3') {
        st = 'font-weight:700;font-size:12.7px;margin:18px 0 6px';
        /* The section mark is a 7px square ::before on screen. A real character is the only version that survives, and @NUMBERED replaces it with the section number the same way the kit does. */
        pre = ctx.label ? '<span style="color:' + P.ac + ';font-weight:800">' + ctx.label + '&nbsp;</span>'
          : '<span style="color:' + P.ac + '">▪&nbsp;</span>';
      } else if (tag === 'h4') {
        st = 'font-weight:700;font-size:11.5px;margin:12px 0 3px;unicode-bidi:plaintext';
        if (ctx.label) pre = '<span style="color:' + P.ac + ';font-weight:800">' + ctx.label + '&nbsp;</span>';
      } else if (tag === 'p') {
        st = 'margin:' + (ctx.cal ? '2px' : '7px') + ' 0;unicode-bidi:plaintext';
        if (has(n, 'lead')) st += ';color:' + P.sub + ';font-size:12.1px';
        if (has(n, 'src')) st = 'margin:2px 0 9px;font-size:9.4px;color:' + P.sub;
      } else if (has(n, 'src')) {
        st = 'display:block;margin:2px 0 9px;font-size:9.4px;color:' + P.sub;
      } else if (has(n, 'lbl')) {
        st = 'display:inline-block;font-size:9px;font-weight:700;letter-spacing:.04em;color:' + P.sub + ';background:' + P.s1 + ';border:.5px solid ' + P.bd + ';border-radius:20px;padding:1px 11px;margin-bottom:5px';
      } else if (has(n, 'badge')) {
        var bset = has(n, 'ok') || has(n, 'info') ? [P.gac, P.ca] : has(n, 'warn') ? [P.gda, P.cd] : [P.s2, P.sub];
        st = 'display:inline-block;font-size:9px;font-weight:700;padding:1px 9px;border-radius:20px;background:' + bset[0] + ';color:' + bset[1];
      } else if (has(n, 'trend')) {
        var up = has(n, 'up');
        st = 'display:inline-block;font-size:11.4px;font-weight:700;padding:1px 8px;border-radius:12px;vertical-align:2px;margin-' + S + ':7px;background:' + (up ? P.gac : P.gda) + ';color:' + (up ? P.ca : P.cd);
        pre = up ? '▲ ' : '▼ ';
      } else if (tag === 'strong' || tag === 'b') {
        st = 'font-weight:700';
        if (ctx.tlRow) tail = '<br>';
      } else if (tag === 'code' && parent && parent.tag === 'pre') {
        dir = 'ltr'; st = 'display:block';
      } else if (tag === 'code') {
        dir = 'ltr';
        st = 'display:inline-block;direction:ltr;font-family:' + MONO + ';font-size:9.8px;color:' + P.ac + ';background:' + P.s2 + ';border:.5px solid ' + P.bd + ';border-radius:5px;padding:1px 5px';
      } else if (tag === 'a') {
        st = 'color:' + (ctx.sig ? P.sub : P.ac) + ';text-decoration:none';
      } else if (tag === 'ul') {
        st = 'list-style:none;padding:0 ' + (R ? '17px 0 0' : '0 0 17px') + ';margin:6px 0';
      } else if (tag === 'ol') {
        st = 'padding:0 ' + (R ? '17px 0 0' : '0 0 17px') + ';margin:6px 0';
      } else if (tag === 'li') {
        st = 'margin:4px 0;unicode-bidi:plaintext';
        /* Bullets are ::before in the kit, which is the failure that costs the most and shows the least: the text stays, the marker silently vanishes. Real characters, all three of them. */
        if (has(n, 'ok')) pre = '<span style="color:' + P.ca + ';font-weight:800">✓&nbsp;</span>';
        else if (has(n, 'no')) pre = '<span style="color:' + P.cd + ';font-weight:800">✕&nbsp;</span>';
        else if (parent && parent.tag === 'ul') pre = '<span style="color:' + P.ac + '">•&nbsp;</span>';
      } else if (tag === 'hr') {
        st = 'border:none;border-top:.5px solid ' + P.bd + ';margin:15px 0';
      } else if (has(n, 'sig')) {
        /* The signature arrives inside the card html (both hosts mount it as the last child of #card), so nothing is injected here - it only needs the inline equivalent of the kit rule, and its link muted instead of accent. */
        st = 'display:block;margin:22px 0 0;padding-top:10px;border-top:.5px solid ' + P.bd + ';font-size:9.2px;color:' + P.sub + ';text-align:' + E;
        next = assign(ctx, { sig: true });
      } else if (tag === 'pre') {
        dir = 'ltr';
        st = 'direction:ltr;text-align:left;font-family:' + MONO + ';font-size:9.8px;background:' + P.s2 + ';border:.5px solid ' + P.bd + ';border-radius:8px;padding:10px 12px;line-height:1.6;margin:8px 0;white-space:pre-wrap';
      } else if (tag === 'table') {
        st = 'border-collapse:collapse;width:100%;margin:9px 0;font-size:11px';
        keep = ' border="0" cellpadding="0" cellspacing="0" width="100%"';
      } else if (tag === 'tr') {
        next = assign(ctx, { lastRow: Boolean(ctx.isLast && parent && parent.tag === 'tbody') });
      } else if (tag === 'th') {
        st = 'color:' + P.sub + ';font-weight:700;font-size:9.7px;border-bottom:1.5px solid ' + P.bs + ';padding:5px 10px';
      } else if (tag === 'td') {
        st = 'padding:7px 10px;unicode-bidi:plaintext' + (ctx.lastRow ? '' : ';border-bottom:.5px solid ' + P.bd);
      } else if (has(n, 'kpi')) {
        st = 'display:block;unicode-bidi:plaintext';
      } else if (has(n, 'l') && (p('kpi') || ctx.kpi)) {
        st = 'display:block;font-size:9.4px;color:' + P.sub + ';margin-bottom:3px';
      } else if (has(n, 'n') && (p('kpi') || ctx.kpi)) {
        st = 'display:block;font-size:20.7px;font-weight:800;line-height:1.2';
      } else if (has(n, 'f') && (p('kpi') || ctx.kpi)) {
        st = 'display:block;font-size:8.5px;color:' + P.sub + ';line-height:1.7;margin-top:3px';
      } else if (has(n, 'flow')) {
        return flowLine(n, ctx);
      } else if (has(n, 'tl')) {
        st = 'display:block;margin:10px 3px';
        next = assign(ctx, { tl: true });
      } else if (ctx.tl && tag === 'div') {
        /* The timeline rail and its dots are ::before too. The rail is decoration and goes; the dot becomes a real character so a row still reads as an entry. */
        st = 'display:block;margin:9px 0;unicode-bidi:plaintext';
        pre = '<span style="color:' + P.ac + '">●&nbsp;</span>';
        next = assign(ctx, { tl: false, tlRow: true });
      } else if (tag === 'details') {
        /* <details> never opens in a mail (and several clients strip the tag outright, content and all), so a fold exports already open, as plain divs: the summary becomes its own bold accent line and the body ordinary blocks under it. */
        as = 'div';
        st = 'display:block;border:.5px solid ' + P.bd + ';border-radius:11px;padding:8px 12px;margin:8px 0';
      } else if (tag === 'summary') {
        as = 'div';
        st = 'display:block;font-weight:700;color:' + P.ac + ';margin-bottom:4px;unicode-bidi:plaintext';
      } else if (tag === 'figure') {
        as = 'div';
        st = 'display:block;margin:9px 0';
      } else if (tag === 'figcaption') {
        as = 'div';
        st = 'display:block;font-size:9.4px;color:' + P.sub + ';margin-top:4px';
      } else if (tag === 'cite') {
        as = 'div';
        st = 'display:block;margin-top:3px;font-size:9.8px';
      } else if (has(n, 'numbered')) {
        st = 'display:block';
        inner = children(n, ctx, { sec: 0, sub: 0 });
      }

      if (VOID[tag]) return '<' + as + (st ? ' style="' + st + '"' : '') + '>';
      if (inner == null) inner = children(n, next);
      if (tag === 'a' && n.attrs.href) keep += ' href="' + q(n.attrs.href) + '"';
      if (tag === 'th' || tag === 'td') keep += ' align="' + S + '"';
      if (n.attrs.colspan) keep += ' colspan="' + q(n.attrs.colspan) + '"';
      if (n.attrs.rowspan) keep += ' rowspan="' + q(n.attrs.rowspan) + '"';
      return '<' + as + ' dir="' + dir + '"' + keep + (st ? ' style="' + st + '"' : '') + '>' + pre + inner + post + '</' + as + '>' + tail;
    }

    var rootStyle = 'font-family:' + (R ? 'Vazirmatn,Tahoma,sans-serif' : 'Inter,system-ui,-apple-system,sans-serif') +
      ';font-size:11.5px;line-height:1.9;color:' + P.tx + ';background:' + P.s1 +
      ';border:.5px solid ' + P.bd + ';border-radius:14px;padding:19px 22px;text-align:' + S + ';direction:' + DIR;
    return '<div dir="' + DIR + '" style="' + rootStyle + '">' + children(parse(html), {}) + '</div>';
  }

  return render;
}));
