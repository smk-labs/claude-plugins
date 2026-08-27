'use strict';
/**
 * THE kit module: the only code anywhere that understands assets/rc.css.
 *
 * rc.css is the design system's single source, and its shape is a contract:
 * everything above the first `@TAG` marker is BASE (always shipped, every
 * path), and each `@TAG` opens one independently-deliverable component snippet.
 * Reading that contract used to be spread across server.js, two hand-written
 * markdown files and a python script; here it is one interface:
 *
 *   base()        BASE css, comments intact
 *   snippets()    [{tag, css}] in SHEET ORDER
 *   all()         the whole sheet
 *   imports()     the @import lines BASE declares
 *   signature()   the readable signature markup, off the @sig line
 *   tagsFor(html) which components that card's html actually uses
 *   cssFor(html)  those components' css, minified, ready to deliver
 *
 * Sheet order is preserved on delivery because every specificity-tie invariant
 * in the sheet depends on it (e.g. @CARD's chip restore following its own child
 * inversion).
 */
const paths = require('./paths.js');

const CSS = paths.read('rc.css');
const TAG_RE = /\/\*@([A-Z]+)/;

/* @REPORT is a tier divider with no CSS of its own and @PRINT never ships to an
 * iframe, so neither is a component. Named here rather than at each call site:
 * the completeness test, the generator and cssFor() all need the same list. */
const NON_COMPONENT_TAGS = ['REPORT', 'PRINT'];

/* Detectors: a component ships when the card's HTML uses one of its class
 * tokens or element names. Tokens are matched EXACTLY (parsed out of class
 * attributes), not by substring, so `class="cards c2"` cannot be missed and
 * `.src` cannot be triggered by an unrelated word. Over-inclusion costs bytes;
 * a MISS renders a component unstyled, so anything ambiguous is listed
 * deliberately. Every @TAG in the sheet must appear here — test.js fails the
 * build otherwise, because a new component with no detector would render
 * silently unstyled. */
const DETECT = {
  TABLE: { cls: ['scroll-table', 'wide'], tags: ['table', 'thead', 'tbody', 'th', 'td'] },
  ZEBRA: { cls: ['zebra', 'dense'], tags: [] },
  KV: { cls: ['kv'], tags: [] },
  KPI: { cls: ['grid', 'kpi', 'trend'], tags: [] },
  BARS: { cls: ['bars', 'bar', 'duo'], tags: [] },
  SPARK: { cls: ['spark'], tags: ['polyline', 'polygon'] },
  FLOW: { cls: ['flow'], tags: [] },
  TL: { cls: ['tl'], tags: [] },
  HUB: { cls: ['hub', 'tree'], tags: [] },
  BADGE: { cls: ['badge'], tags: [] },
  CTA: { cls: ['cta', 'btns'], tags: ['button'] },
  CARD: { cls: ['cards', 'card', 'pick'], tags: [] },
  BOX: { cls: ['box', 'lbl'], tags: [] },
  COLS: { cls: ['cols'], tags: [] },
  QUOTE: { cls: [], tags: ['blockquote', 'cite'] },
  SRC: { cls: ['src'], tags: [] },
  NUMBERED: { cls: ['numbered'], tags: [] },
  SECTIONS: { cls: ['sections'], tags: [] },
  TABS: { cls: ['tabs'], tags: [] },
  DONUT: { cls: ['donut', 'donut-w', 'leg'], tags: [] },
  FOLD: { cls: ['fold'], tags: ['details', 'summary'] },
  ICON: { cls: ['ic'], tags: [] },
  FIG: { cls: [], tags: ['figure', 'figcaption', 'img'] },
  /* `live` is listed next to `preview` deliberately: it never appears without
   * it today, but a miss on either renders the frame at full desktop width,
   * with no lid over it and no radius joining it to the card above. */
  PREVIEW: { cls: ['preview', 'live'], tags: [] },
};

/* A snippet may lean on BASE and on what it declares here, never on a sibling
 * happening to be present: @BOX takes its panel + child inversion from @CARD,
 * and @ZEBRA restyles rows @TABLE has to have drawn first. */
const NEEDS = { BOX: ['CARD'], ZEBRA: ['TABLE'] };

const BASE = CSS.split('/*@')[0];

const SNIPPETS = (() => {
  const out = [];
  for (const part of CSS.split(/(?=\/\*@)/)) {
    const m = part.match(TAG_RE);
    if (m) out.push({ tag: m[1], css: part });
  }
  return out;
})();

/* The signature's one literal lives on rc.css's @sig line — see the comment
 * there for why it is BASE and why it mounts as the last child of .rc. Anchored
 * on the '<' because prose ABOUT the marker mentions @sig too, and an
 * unanchored match happily froze a sentence fragment into the template. The
 * single-quote ban is the card template's: it ships inside a single-quoted JS
 * string literal there. */
const SIGNATURE = (() => {
  const m = CSS.match(/@sig[ \t]+(<[^\n]+)/);
  if (!m) throw new Error('assets/rc.css is missing its @sig signature line');
  const s = m[1].trim();
  if (s.indexOf("'") !== -1) throw new Error('@sig must not contain a single quote');
  if (s.slice(0, 16) !== '<div class="sig"') throw new Error('@sig must be a single <div class="sig"> line');
  return s;
})();

/* THE FRAME, and who is allowed to draw it. BASE gives .rc a surface, a hairline
 * border, a radius and generous padding, which is right when the card floats bare
 * in a chat column. A host that already draws a rounded, framed cell around the
 * card must not draw a second one inside it: that reads as a cheap nested box.
 *
 * Both delivery paths need the same policy and reach it differently, so the
 * declarations are named ONCE here:
 *   tier 1  overrides them (server/theme.js flush()), because BASE is injected
 *           and one extra rule is cheaper than rewriting the sheet
 *   tier 2  strips them, because the model copies BASE by HAND on that path and
 *           every line it must transcribe is a line it can get wrong
 * Each edit asserts it matched. A silent miss here is a framed card inside a
 * framed cell, which is exactly the regression this names. */
const FRAME_EDITS = [
  ['background:var(--surface-1);', ''],
  ['border:.5px solid var(--border);border-radius:14px;', ''],
  ['padding:1.2rem 1.4rem;', 'padding:.2rem .1rem;'],
];
function unframed(css) {
  let out = css;
  for (const [from, to] of FRAME_EDITS) {
    if (out.indexOf(from) === -1) throw new Error('kit: rc.css no longer contains the frame declaration "' + from + '" — update FRAME_EDITS');
    out = out.replace(from, to);
  }
  return out;
}

/* Sources stay heavily commented — they ARE the documentation — but comments
 * and newlines have no business on the wire. */
function stripComments(css) { return css.replace(/\/\*[^]*?\*\//g, ''); }
function minify(css) { return stripComments(css).replace(/\n+/g, '').trim(); }

/* @import is only valid before all other rules, so every consumer hoists these
 * to the top of its own <style>. Line-anchored, because the Google Fonts URL
 * itself contains semicolons (wght@400;500;...): matching to the first ';'
 * truncates mid-url and the leftover garbage eats the first rule through CSS
 * error recovery. */
function imports() {
  return (stripComments(BASE).match(/@import[^\n]+/g) || []).slice();
}

function tokensOf(html) {
  const cls = new Set();
  const tags = new Set();
  const s = String(html);
  let m;
  const cre = /class\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  while ((m = cre.exec(s))) {
    for (const t of String(m[1] !== undefined ? m[1] : m[2]).split(/\s+/)) if (t) cls.add(t);
  }
  const tre = /<\s*([a-zA-Z][a-zA-Z0-9-]*)/g;
  while ((m = tre.exec(s))) tags.add(m[1].toLowerCase());
  return { cls, tags };
}

/* Which components this card needs, dependency closure included. */
function tagsFor(html) {
  const { cls, tags } = tokensOf(html);
  const want = new Set();
  const add = (tag) => {
    if (want.has(tag)) return;
    want.add(tag);
    for (const dep of NEEDS[tag] || []) add(dep);
  };
  for (const { tag } of SNIPPETS) {
    const d = DETECT[tag];
    if (d && (d.cls.some((c) => cls.has(c)) || d.tags.some((t) => tags.has(t)))) add(tag);
  }
  return want;
}

/* The component CSS for one card. BASE is already wherever this is going, so
 * only snippets ship. Var names stay long (unlike the card template, which
 * aliases them): a delivered snippet must not depend on an alias defined by one
 * particular consumer's copy of BASE to resolve its colours. */
function cssFor(html) {
  const want = tagsFor(html);
  return minify(SNIPPETS.filter((s) => want.has(s.tag)).map((s) => s.css).join(''));
}

/* Components in sheet order, dividers dropped: what the generator writes out
 * and what the completeness test counts. */
function componentTags() {
  return SNIPPETS.map((s) => s.tag).filter((t) => NON_COMPONENT_TAGS.indexOf(t) === -1);
}

module.exports = {
  all: () => CSS,
  base: () => BASE,
  snippets: () => SNIPPETS.slice(),
  componentTags,
  imports,
  signature: () => SIGNATURE,
  tagsFor,
  cssFor,
  stripComments,
  minify,
  unframed,
  DETECT,
  NEEDS,
  NON_COMPONENT_TAGS,
};
