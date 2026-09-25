'use strict';
/**
 * The card's authoring format: GitHub Markdown plus a few `:::` blocks,
 * compiled to exactly the building-block HTML that assets/rc.css styles.
 *
 * The look lives in the sheet, keyed on DOM and class names, so a compiler that
 * emits the same DOM a model used to hand-write renders the same card. What
 * moves here is everything a model should not spend tokens or thought on:
 * closing tags, bar widths, sparkline points, donut slices, trend direction,
 * grid columns, table striping, the RLM a Persian line needs when it opens on a
 * Latin word. The model writes intent; this writes markup.
 *
 * One file, three callers: the card server (tools.js compiles a call and
 * read_kit compiles every streaming partial), the tests, and the report build,
 * which runs it as a CLI: `node md.js < content.md > content.html`.
 *
 * Lenient by contract. A card streams, so the input is often cut mid-block: an
 * unclosed fence or `:::` runs to the end, and nothing here throws on content.
 * An unknown block renders its body as plain Markdown and adds a warning.
 */

const RTL = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g;
const LTR = /[A-Za-z]/g;
const STATUS = { x: 'ok', X: 'ok', '✓': 'ok', '✔': 'ok', '✅': 'ok', ' ': 'no', '✗': 'no', '✘': 'no', '❌': 'no' };
const ALERTS = { tip: 'tip', note: 'note', important: 'note', warning: 'warn', caution: 'danger', danger: 'danger' };
const ARROW = /\s*(?:→|←|->|=>|⟶)\s*/;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---- numbers ------------------------------------------------------------ */

function latin(s) {
  return String(s)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/٫/g, '.').replace(/[٬,]/g, '').replace(/−/g, '-');
}

/* The first number in a cell, scaled by a K/M/B suffix. Units, % and the
 * author's own digits are left to the display text, which is never rewritten. */
function num(s) {
  const m = latin(s).match(/(-?\d+(?:\.\d+)?)\s*([kKmMbB])?/);
  if (!m) return NaN;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[String(m[2] || '').toLowerCase()] || 1;
  return parseFloat(m[1]) * mult;
}

function fmt(n) { return String(Math.round(n * 10) / 10); }

function persianDigits(s) { return /[۰-۹]/.test(s); }
function toPersian(s) { return String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace(/\./g, '٫'); }

/* ---- inline ------------------------------------------------------------- */

function inline(src) {
  const keep = [];
  const hold = (html) => '\u0000' + (keep.push(html) - 1) + '\u0000';
  let s = String(src)
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (m, f, c) => hold('<code>' + esc(c.replace(/^ (.*) $/, '$1')) + '</code>'))
    .replace(/<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>|&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/g, (m) => hold(m));
  s = esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^"]*?)&quot;)?\)/g, (m, alt, url) => hold('<img src="' + url + '" alt="' + alt + '">'))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, url) => hold('<a href="' + url + '">' + t + '</a>'))
    .replace(/:(ok|warn|info)\[([^\]]*)\]/g, '<span class="badge $1">$2</span>')
    .replace(/:ic\[([a-z]+)\]/g, '<i class="ic $1"></i>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=[^\s*])([^*]*?[^\s*])\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  while (/\u0000\d+\u0000/.test(s)) s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
  return s;
}

/* A Persian block that opens on a Latin word would lay out left-to-right under
 * the kit's per-block `unicode-bidi: plaintext`. An RLM in front fixes it, and
 * the author never has to know. Code is direction-neutral, so it does not vote. */
function rlm(text, html) {
  const t = String(text).replace(/`[^`]*`/g, ' ').replace(/:(?:ok|warn|info|ic)\[/g, ' ').replace(/\]\([^)]*\)/g, ' ').replace(/<[^>]*>/g, ' ');
  const r = (t.match(RTL) || []).length;
  const l = (t.match(LTR) || []).length;
  if (!r || r < l) return html;
  const first = t.match(/[A-Za-z\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/);
  return first && /[A-Za-z]/.test(first[0]) ? '&rlm;' + html : html;
}

function text(src) { return rlm(src, inline(src)); }

/* ---- attributes: `{.cls .cls #id}` closing a line or standing alone -------- */

const ATTR = /\s*\{((?:\s*[.#][\w-]+)+)\s*\}\s*$/;

function attrs(line) {
  const m = String(line).match(ATTR);
  if (!m) return { line, cls: [], id: '' };
  const toks = m[1].trim().split(/\s+/);
  return {
    line: line.slice(0, m.index),
    cls: toks.filter((t) => t[0] === '.').map((t) => t.slice(1)),
    id: (toks.find((t) => t[0] === '#') || '').slice(1),
  };
}

function tag(name, a, extra) {
  const cls = (extra ? [extra] : []).concat(a ? a.cls : []).filter(Boolean);
  return '<' + name + (a && a.id ? ' id="' + esc(a.id) + '"' : '') + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>';
}

/* ---- rows: one per line, cells split on unescaped | ----------------------- */

function cells(line) {
  let s = String(line).trim();
  if (s[0] === '|') s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

function rows(body) {
  return body.filter((l) => l.trim()).map((l) => (l.includes('|') ? cells(l) : [l.trim()]));
}

/* ---- the blocks ----------------------------------------------------------- */

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const OPEN = /^\s{0,3}:{3,}\s*([a-z][\w-]*)\s*(.*)$/;
const CLOSE = /^\s{0,3}:{3,}\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const DELIM = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const RAW = /^\s{0,3}<\/?[a-zA-Z][\w-]*(\s|>|\/>|$)/;
const ALONE = /^\s*\{(?:\s*[.#][\w-]+)+\s*\}\s*$/;

function startsBlock(lines, i) {
  const l = lines[i];
  return FENCE.test(l) || OPEN.test(l) || HEADING.test(l) || HR.test(l) || LIST.test(l) ||
    QUOTE.test(l) || RAW.test(l) || isTable(lines, i);
}

function isTable(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && DELIM.test(lines[i + 1]);
}

/* Collect a `:::` body up to its matching close, counting nested opens and
 * skipping fences, so a block can hold blocks. Unclosed runs to the end. */
function body(lines, i) {
  const out = [];
  let depth = 1;
  let fence = null;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const f = l.match(FENCE);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; out.push(l); continue; }
    if (f) { fence = f[1]; out.push(l); continue; }
    if (OPEN.test(l)) depth++;
    else if (CLOSE.test(l) && --depth === 0) return { lines: out, next: i + 1 };
    out.push(l);
  }
  return { lines: out, next: i };
}

/* Split a body on `### title` lines (outside fences): cards and cols units. */
function units(lines) {
  const out = [];
  let head = [];
  let cur = null;
  let fence = null;
  for (const l of lines) {
    const f = l.match(FENCE);
    if (fence) { if (f && f[1][0] === fence[0]) fence = null; (cur ? cur.lines : head).push(l); continue; }
    if (f) fence = f[1];
    const h = !f && l.match(/^\s{0,3}###\s+(.*?)\s*$/);
    if (h) { cur = { title: h[1], lines: [] }; out.push(cur); continue; }
    (cur ? cur.lines : head).push(l);
  }
  return { head, units: out };
}

function compile(src, opts) {
  const warnings = [];
  const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
  const html = blocks(lines, { top: true, shift: shiftOf(lines), warnings }).join('\n');
  return opts && opts.warnings === false ? html : { html, warnings };
}

/* `#` is the title. A reply with no `#` has its top level promoted instead, so
 * `## title / ### section` still lands as h2 / h3. */
function shiftOf(lines) {
  let min = 7;
  let fence = null;
  for (const l of lines) {
    const f = l.match(FENCE);
    if (fence) { if (f && f[1][0] === fence[0]) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    const h = l.match(HEADING);
    if (h && h[1].length < min) min = h[1].length;
  }
  return min === 7 ? 0 : min - 1;
}

function blocks(lines, ctx) {
  const out = [];
  let i = 0;
  const push = (html) => {
    /* A lone `{.cls}` line styles the block right above it. */
    let j = i;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length && ALONE.test(lines[j]) && html) {
      html = decorate(html, attrs(lines[j]));
      i = j + 1;
    }
    if (html) out.push(html);
  };
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (ALONE.test(l)) { i++; continue; }

    let m = l.match(FENCE);
    if (m) {
      const code = [];
      for (i++; i < lines.length; i++) {
        const c = lines[i].match(FENCE);
        if (c && c[1][0] === m[1][0] && c[1].length >= m[1].length && !lines[i].trim().slice(c[1].length).trim()) { i++; break; }
        code.push(lines[i]);
      }
      push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
      continue;
    }

    m = l.match(OPEN);
    if (m) {
      const b = body(lines, i + 1);
      i = b.next;
      push(directive(m[1], m[2].trim(), b.lines, ctx));
      continue;
    }

    m = l.match(HEADING);
    if (m) {
      i++;
      const a = attrs(m[2]);
      const lvl = Math.min(4, Math.max(2, m[1].length - (ctx.shift || 0) + 1));
      push(tag('h' + lvl, a) + text(a.line) + '</h' + lvl + '>');
      continue;
    }

    if (HR.test(l)) { i++; push('<hr>'); continue; }

    if (isTable(lines, i)) {
      const head = cells(l);
      const rowsOut = [];
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) rowsOut.push(cells(lines[i]));
      push(table(head, rowsOut));
      continue;
    }

    if (QUOTE.test(l)) {
      const q = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) q.push(lines[i].match(QUOTE)[1]);
      push(quote(q, ctx));
      continue;
    }

    if (LIST.test(l)) {
      const start = i;
      const base = l.match(LIST)[1].length;
      const ordered = /\d/.test(l.match(LIST)[2]);
      for (i++; i < lines.length; i++) {
        const t = lines[i];
        if (!t.trim()) {
          const n = lines[i + 1];
          if (n !== undefined && (LIST.test(n) || /^\s{2,}\S/.test(n))) continue;
          break;
        }
        const lm = t.match(LIST);
        if (lm && lm[1].length <= base && /\d/.test(lm[2]) !== ordered) break;
        if (lm || /^\s+\S/.test(t)) continue;
        if (startsBlock(lines, i)) break;
        continue; /* lazy continuation of the item's text */
      }
      push(list(lines.slice(start, i), ctx));
      continue;
    }

    if (RAW.test(l)) {
      const raw = [];
      for (; i < lines.length && lines[i].trim(); i++) raw.push(lines[i]);
      push(raw.join('\n'));
      continue;
    }

    const para = [];
    for (; i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines, i)); i++) {
      if (ALONE.test(lines[i])) break;
      para.push(lines[i].trim());
    }
    push(paragraph(para));
  }
  return out;
}

/* Add classes / an id to the outermost element of a compiled block. `wide`
 * belongs to a table's scroll wrapper, so it builds one. */
function decorate(html, a) {
  if (/^<table/.test(html) && a.cls.includes('wide')) {
    a = { cls: a.cls.filter((c) => c !== 'wide'), id: a.id };
    html = '<div class="scroll-table wide">' + html + '</div>';
    if (!a.cls.length && !a.id) return html;
    return html.replace(/<table(\s+class="([^"]*)")?/, (m, x, c) => '<table class="' + [c].concat(a.cls).filter(Boolean).join(' ') + '"');
  }
  return html.replace(/^<([a-z][\w-]*)([^>]*)>/, (m, name, rest) => {
    let r = rest;
    if (a.cls.length) {
      r = /\sclass="/.test(r) ? r.replace(/\sclass="([^"]*)"/, (x, c) => ' class="' + c + ' ' + a.cls.join(' ') + '"') : r + ' class="' + a.cls.join(' ') + '"';
    }
    if (a.id && !/\sid="/.test(r)) r = ' id="' + esc(a.id) + '"' + r;
    return '<' + name + r + '>';
  });
}

function paragraph(para) {
  if (!para.length) return '';
  const last = attrs(para[para.length - 1]);
  para[para.length - 1] = last.line;
  const joined = para.join('\n');

  /* A line that is nothing but `a → b → c` is a process: draw it. */
  if (para.length === 1) {
    const steps = joined.split(ARROW).map((s) => s.trim());
    if (steps.length >= 3 && steps.every((s) => s && s.length <= 60)) {
      return tag('div', last, 'flow') + steps.map((s) => '<span class="s">' + text(s) + '</span>').join('') + '</div>';
    }
    const img = joined.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (img) {
      return tag('figure', last) + '<img src="' + esc(img[2]) + '" alt="' + esc(img[1]) + '">' +
        (img[3] ? '<figcaption>' + text(img[3]) + '</figcaption>' : '') + '</figure>';
    }
  }
  return tag('p', last) + para.map(text).join('<br>') + '</p>';
}

function table(head, body) {
  const n = head.length;
  const row = (r, t) => '<tr>' + Array.from({ length: n }, (_, k) => '<' + t + '>' + text(r[k] || '') + '</' + t + '>').join('') + '</tr>';
  const cls = body.length >= 10 ? ' class="zebra dense"' : '';
  const t = '<table' + cls + '><thead>' + row(head, 'th') + '</thead><tbody>' + body.map((r) => row(r, 'td')).join('') + '</tbody></table>';
  return body.length >= 100 ? '<div class="scroll-table">' + t + '</div>' : t;
}

function quote(q, ctx) {
  const alert = (q[0] || '').match(/^\s*\[!([A-Za-z]+)\]\s*(.*)$/);
  if (alert && ALERTS[alert[1].toLowerCase()]) {
    const rest = (alert[2] ? [alert[2]] : []).concat(q.slice(1));
    return '<div class="cal ' + ALERTS[alert[1].toLowerCase()] + '"><div>' + blocks(rest, nested(ctx)).join('') + '</div></div>';
  }
  let cite = '';
  const lastIdx = q.length - 1;
  const c = lastIdx > 0 && q[lastIdx].match(/^\s*(?:—|--|―)\s*(.+)$/);
  if (c) { cite = '<cite>' + text(c[1]) + '</cite>'; q = q.slice(0, lastIdx); }
  return '<blockquote>' + blocks(q, nested(ctx)).join('') + cite + '</blockquote>';
}

function nested(ctx) { return { top: false, shift: 0, warnings: ctx.warnings }; }

function list(lines, ctx) {
  const base = lines[0].match(LIST)[1].length;
  const ordered = /\d/.test(lines[0].match(LIST)[2]);
  const items = [];
  for (const l of lines) {
    const m = l.match(LIST);
    if (m && m[1].length <= base + 1) { items.push({ first: m[3], rest: [] }); continue; }
    if (items.length) items[items.length - 1].rest.push(l.slice(Math.min(base + 2, l.search(/\S|$/))));
  }
  const li = items.map((it) => {
    let first = it.first;
    let cls = '';
    const st = first.match(/^\[([ xX])\]\s+(.*)$/) || first.match(/^(✓|✔|✅|✗|✘|❌)\s*(.*)$/);
    if (st) { cls = STATUS[st[1]]; first = st[2]; }
    /* Lines until the first blank or nested block are the item's own text. */
    let k = 0;
    const own = [first];
    while (k < it.rest.length && it.rest[k].trim() && !LIST.test(it.rest[k]) && !FENCE.test(it.rest[k]) && !OPEN.test(it.rest[k])) own.push(it.rest[k++].trim());
    const sub = blocks(it.rest.slice(k), nested(ctx)).join('');
    return '<li' + (cls ? ' class="' + cls + '"' : '') + '>' + own.map(text).join('<br>') + sub + '</li>';
  });
  return (ordered ? '<ol>' : '<ul>') + li.join('') + (ordered ? '</ol>' : '</ul>');
}

/* ---- the components ------------------------------------------------------- */

function directive(name, arg, lines, ctx) {
  const fn = DIRECTIVES[name];
  if (fn) return fn(arg, lines, ctx);
  ctx.warnings.push('unknown block :::' + name + ', rendered as plain Markdown');
  return blocks(lines, nested(ctx)).join('');
}

const DIRECTIVES = {
  kpi(arg, lines) {
    const r = rows(lines);
    const cols = r.length === 2 || r.length === 4 ? 'grid c2' : r.length === 1 ? 'grid' : 'grid c3';
    return '<div class="' + cols + '">' + r.map((c) => {
      let trend = '';
      if (c[2]) {
        const t = c[2].trim();
        const dn = /^[-−↓▼]/.test(t);
        trend = '<span class="trend ' + (dn ? 'dn' : 'up') + '">' + inline(t.replace(/^[-−+↑↓▲▼]\s*/, '')) + '</span>';
      }
      return '<div class="kpi"><div class="l">' + text(c[0] || '') + '</div><div class="n">' + inline(c[1] || '') + trend + '</div>' +
        (c[3] ? '<div class="f">' + text(c[3]) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  },

  kv(arg, lines) {
    return '<div class="kv">' + lines.filter((l) => l.trim()).map((l) => {
      const c = l.includes('|') ? cells(l) : (() => { const k = l.indexOf(':'); return k > 0 ? [l.slice(0, k), l.slice(k + 1)] : [l]; })();
      return '<div><b>' + text(c[0].trim()) + '</b><span>' + text((c.slice(1).join(' | ') || '').trim()) + '</span></div>';
    }).join('') + '</div>';
  },

  bars(arg, lines) {
    const r = rows(lines);
    const duo = r.some((c) => c.length >= 3);
    const max = Math.max(0, ...r.map((c) => num(c[1])).filter((n) => n > 0), ...(duo ? r.map((c) => num(c[2])).filter((n) => n > 0) : []));
    const w = (v) => (max > 0 && v > 0 ? Math.round((v / max) * 100) : 0) + '%';
    const leg = duo && arg ? cells(arg) : [];
    return '<div class="bars">' +
      (leg.length ? '<div class="leg"><span class="a"><i></i>' + text(leg[0]) + '</span>' + (leg[1] ? '<span class="b"><i></i>' + text(leg[1]) + '</span>' : '') + '</div>' : '') +
      r.map((c) => (c.length >= 3
        ? '<div class="bar duo"><span class="l">' + text(c[0]) + '</span><span class="t"><i style="width:' + w(num(c[1])) + '"></i><i style="width:' + w(num(c[2])) + '"></i></span><span class="v">' + inline(c[1]) + ' / ' + inline(c[2]) + '</span></div>'
        : '<div class="bar"><span class="l">' + text(c[0]) + '</span><span class="t"><i style="width:' + w(num(c[1])) + '"></i></span><span class="v">' + inline(c[1] || '') + '</span></div>')).join('') +
      '</div>';
  },

  spark(arg, lines) {
    const series = [];
    let labels = [];
    for (const l of lines.filter((x) => x.trim())) {
      const toks = latin(l).trim().split(/[\s,]+/);
      if (!l.includes('|') && toks.every((t) => /^-?\d+(\.\d+)?$/.test(t))) series.push(toks.map(Number));
      else labels = cells(l);
    }
    if (!series.length) return '';
    const all = [].concat(...series);
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pts = (s) => s.map((v, k) => fmt(s.length === 1 ? 50 : (k * 100) / (s.length - 1)) + ',' + fmt(hi === lo ? 15 : 28 - ((v - lo) / (hi - lo)) * 26)).join(' ');
    const p1 = pts(series[0]);
    return '<div class="spark"><svg viewBox="0 0 100 30" preserveAspectRatio="none">' +
      (/\barea\b/.test(arg) ? '<polygon points="0,30 ' + p1 + ' 100,30"/>' : '') +
      '<polyline points="' + p1 + '"/>' +
      (series[1] ? '<polyline class="s2" points="' + pts(series[1]) + '"/>' : '') +
      '</svg>' + (labels.length ? '<div class="x">' + labels.map((x) => '<span>' + text(x) + '</span>').join('') + '</div>' : '') + '</div>';
  },

  donut(arg, lines) {
    const r = rows(lines).slice(0, 4);
    const v = r.map((c) => Math.max(0, num(c[1])));
    const sum = v.reduce((a, b) => a + b, 0) || 1;
    const pct = v.map((x) => Math.round((x / sum) * 100));
    pct[pct.length - 1] = 100 - pct.slice(0, -1).reduce((a, b) => a + b, 0);
    const fa = r.some((c) => persianDigits(c[1] || ''));
    const keys = 'abcd';
    return '<div class="donut-w"><div class="donut" style="' + pct.slice(0, -1).map((p, k) => '--' + keys[k] + ':' + p).join(';') + '"></div><div class="leg">' +
      r.map((c, k) => '<span class="' + keys[k] + '"><i></i>' + text(c[0]) + ' ' + (fa ? toPersian(pct[k]) + '٪' : pct[k] + '%') + '</span>').join('') + '</div></div>';
  },

  flow(arg, lines) {
    const steps = [].concat(...lines.filter((l) => l.trim()).map((l) => l.split(ARROW))).map((s) => s.trim()).filter(Boolean);
    return '<div class="flow">' + steps.map((s) => '<span class="s">' + text(s) + '</span>').join('') + '</div>';
  },

  tl(arg, lines) {
    return '<div class="tl">' + rows(lines).map((c) => '<div><b>' + text(c[0]) + '</b>' + text(c.slice(1).join(' | ')) + '</div>').join('') + '</div>';
  },

  hub(arg, lines) {
    const live = lines.filter((l) => l.trim());
    if (!live.length) return '';
    const node = (l, cls) => {
      let s = l.trim();
      const out = /^(?:->|→)\s*/.test(s);
      s = s.replace(/^(?:->|→)\s*/, '');
      const c = cells(s);
      return { cls: cls + (out ? ' out' : ''), html: text(c[0]) + (c[1] ? '<span>' + text(c[1]) + '</span>' : ''), kids: [] };
    };
    const centre = node(live[0], 'c');
    const legs = [];
    const base = live.length > 1 ? live[1].search(/\S/) : 0;
    let tree = /\btree\b/.test(arg);
    for (const l of live.slice(1)) {
      if (l.search(/\S/) > base && legs.length) { legs[legs.length - 1].kids.push(node(l, 's')); tree = true; } else legs.push(node(l, 's'));
    }
    if (legs.length >= 9) tree = true;
    const draw = (n) => '<div class="' + n.cls + '">' + n.html + n.kids.map(draw).join('') + '</div>';
    return '<div class="hub' + (tree ? ' tree' : '') + '">' + draw(centre) + legs.map(draw).join('') + '</div>';
  },

  cards(arg, lines, ctx) {
    const u = units(lines);
    const lead = blocks(u.head, nested(ctx)).join('');
    return lead + '<div class="cards' + (/\bc2\b/.test(arg) ? ' c2' : '') + '">' + u.units.map((x) => {
      const a = attrs(x.title);
      return '<div class="card' + (a.cls.length ? ' ' + a.cls.join(' ') : '') + '"><h4>' + text(a.line) + '</h4>' + blocks(x.lines, nested(ctx)).join('') + '</div>';
    }).join('') + '</div>';
  },

  cols(arg, lines, ctx) {
    const u = units(lines);
    const parts = u.units.length ? u.units : [{ title: '', lines: u.head }];
    return (u.units.length ? blocks(u.head, nested(ctx)).join('') : '') + '<div class="cols">' +
      parts.map((x) => '<div>' + (x.title ? '<h4>' + text(x.title) + '</h4>' : '') + blocks(x.lines, nested(ctx)).join('') + '</div>').join('') + '</div>';
  },

  box(arg, lines, ctx) {
    return '<div class="box">' + (arg ? '<div class="lbl">' + text(arg) + '</div>' : '') + blocks(lines, nested(ctx)).join('') + '</div>';
  },

  fold(arg, lines, ctx) {
    return '<details class="fold"><summary>' + text(arg || '…') + '</summary>' + blocks(lines, nested(ctx)).join('') + '</details>';
  },

  numbered(arg, lines, ctx) {
    return '<div class="numbered' + (/\bsections\b/.test(arg) ? ' sections' : '') + '">' + blocks(lines, { top: false, shift: ctx.shift, warnings: ctx.warnings }).join('') + '</div>';
  },

  cta(arg, lines) {
    /* The bridge re-dispatches clicks by matching sendPrompt('…') and takes the
     * text raw, so the prompt must never hold the quote that closes it. */
    return '<div class="btns">' + rows(lines).slice(0, 2).map((c, k) => {
      const prompt = esc(String(c[1] || c[0]).replace(/'/g, '’').replace(/\\/g, '/'));
      return '<button class="cta' + (k ? ' ghost' : '') + '" onclick="sendPrompt(\'' + prompt + '\')">' + text(c[0]) + '</button>';
    }).join('') + '</div>';
  },

  preview(arg, lines) {
    return rows(lines).map((c) => {
      const m = c[0].match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) || [null, c[0], c[0]];
      let host = '';
      try { host = new URL(m[2]).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
      return '<a class="preview" href="' + esc(m[2]) + '"><b>' + text(m[1]) + '</b>' + (c[1] ? '<span>' + text(c[1]) + '</span>' : '') + (host ? '<small>' + esc(host) + '</small>' : '') + '</a>';
    }).join('');
  },

  tabs(arg, lines) {
    return '<div class="tabs">' + rows(lines).map((c) => {
      const m = c[0].match(/^\[([^\]]+)\]\((#[^)\s]+)\)$/);
      return m ? '<a href="' + esc(m[2]) + '">' + text(m[1]) + (c[1] ? '<span>' + text(c[1]) + '</span>' : '') + '</a>' : '';
    }).join('') + '</div>';
  },

  src(arg, lines) {
    return '<div class="src">' + lines.filter((l) => l.trim()).map((l) => text(l.trim())).join('<br>') + '</div>';
  },
};

/* The callout and quote blocks also answer to Docusaurus-style `:::tip`. */
for (const k of Object.keys(ALERTS)) {
  DIRECTIVES[k] = (arg, lines, ctx) => '<div class="cal ' + ALERTS[k] + '"><div>' + blocks((arg ? [arg] : []).concat(lines), nested(ctx)).join('') + '</div></div>';
}

module.exports = { compile, inline };

if (require.main === module) {
  let src = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { src += d; });
  process.stdin.on('end', () => {
    const r = compile(src);
    for (const w of r.warnings) process.stderr.write('md: ' + w + '\n');
    process.stdout.write(r.html + '\n');
  });
}
