'use strict';
/**
 * A project's own skin (4.13.0): a committable .readable/brand.css of palette
 * overrides, optionally a brand.json and a logo.svg, that reskins its cards.
 *
 * The interface is four questions, and every one of them takes the workspace
 * roots rather than reaching for them:
 *
 *   dirFor(explicit, roots)   which .readable dir, if any, this call belongs to
 *   css(dir)                  its normalized CSS  (throws on a bad dir)
 *   cssOrNone(dir, roots)     the same, for callers where a bad dir is not an
 *                             error but simply "no brand"
 *   signatureOff(dir, roots)  has this project turned the signature off
 *
 * WHY dirFor guesses so carefully: the desktop app runs ONE server for every
 * open project and may report them all as roots, so the explicit per-call dir
 * (announced per-project by the plugin's SessionStart hook) is the only
 * session-accurate source. 4.13.0 guessed anyway and skinned one project's
 * cards with a parallel project's brand.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const CSS_MAX = 16 * 1024;
const cache = new Map(); // dir -> { key, css }

function isBrandDir(d) {
  return typeof d === 'string' && d.trim() !== '' && path.isAbsolute(d) &&
    path.basename(d) === '.readable' && fs.existsSync(path.join(d, 'brand.css'));
}

/* Explicit call arg first. Otherwise guess only when the guess is unambiguous:
 * a lone workspace root, or (rootless spawn) a bounded walk up from cwd, which
 * stops before home and / so a stray ~/.readable can never brand everything.
 * With several roots open one shared server cannot attribute a call to a
 * project, so it must not guess at all. */
function dirFor(explicit, roots) {
  if (isBrandDir(explicit)) return path.resolve(String(explicit));
  const rs = roots || [];
  if (rs.length > 1) return null;
  if (rs.length === 1) {
    const c = path.join(rs[0], '.readable');
    return isBrandDir(c) ? c : null;
  }
  let d = process.cwd();
  if (!d || d === '/' || d === os.homedir()) return null;
  for (let i = 0; i < 8; i++) {
    const c = path.join(d, '.readable');
    if (isBrandDir(c)) return c;
    const up = path.dirname(d);
    if (up === d || up === os.homedir() || up === '/') break;
    d = up;
  }
  return null;
}

/* The letterhead is a .rc::before rule, so it ships INSIDE the brand css at
 * runtime and costs the 30KB template ceiling nothing. The wordmark renders as
 * the pseudo's text content; a logo rides as a data-URI — a currentColor mark
 * uses -webkit-mask so it tints to the text colour and theme-flips (logo-only
 * case), otherwise a background-image keeps the mark's own colours. It sits at
 * the very top of the card, above the title, and is invisible to every #card
 * exporter (pseudo-elements never serialize), mirroring the report whose .brand
 * header lives outside #card. Trusted (committed config) but hardened: the svg
 * loses its xml prolog, comments, any <script>, every on*= handler and any
 * javascript: url before it ever reaches the iframe. */
function letterheadCss(dir) {
  let meta = {};
  const mf = path.join(dir, 'brand.json');
  try { if (fs.existsSync(mf)) meta = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { meta = {}; }
  const wordmark = String(meta.wordmark || meta.name || '');
  let uri = '', mono = false;
  const lf = path.join(dir, String(meta.logo || 'logo.svg'));
  try {
    if (fs.existsSync(lf) && path.extname(lf) === '.svg' && fs.statSync(lf).size <= 8 * 1024) {
      const svg = fs.readFileSync(lf, 'utf8')
        .replace(/<\?xml[^]*?\?>|<!--[^]*?-->|<script[^]*?<\/script>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript:/gi, '').replace(/[\r\n\t]+/g, ' ').trim();
      mono = /currentColor/i.test(svg);
      uri = 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27') + '")';
    }
  } catch (e) { uri = ''; }
  if (!wordmark && !uri) return '';
  const label = '"' + wordmark.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const bgPos = '.rc[dir=rtl]::before{background-position:right center}.rc[dir=ltr]::before{background-position:left center}';
  if (uri && wordmark) {
    return '.rc::before{content:' + label + ';display:block;font-weight:800;font-size:14.5px;line-height:24px;color:var(--text-primary);margin-bottom:14px;padding-inline-start:32px;background:' + uri + ' no-repeat;background-size:24px 24px}' + bgPos;
  }
  if (uri) {
    if (mono) return '.rc::before{content:"";display:block;height:24px;margin-bottom:14px;background:var(--text-primary);-webkit-mask:' + uri + ' no-repeat center/24px;mask:' + uri + ' no-repeat center/24px}';
    return '.rc::before{content:"";display:block;height:24px;margin-bottom:14px;background:' + uri + ' no-repeat left center/24px}.rc[dir=rtl]::before{background-position:right center}';
  }
  return '.rc::before{content:' + label + ';display:block;font-weight:800;font-size:14.5px;color:var(--text-primary);margin-bottom:12px}';
}

/* The css lands in a <style> tag inside the card iframe: '<' never appears in
 * valid CSS, so stripping it kills any </style> breakout. @import lines are
 * dropped except Google Fonts (the one host the iframe CSP is known to allow;
 * it already serves Vazirmatn/Inter), and bare [data-theme="dark"] selectors are
 * raised to html[data-theme="dark"] so they TIE the card template's palette and
 * win by source order — see assets/palette.css for why that tie matters. The
 * letterhead rule rides along only when the brand has a logo/wordmark, so a
 * plain palette brand pays nothing extra. */
function css(dir) {
  if (!isBrandDir(dir)) throw new Error('dir must be an absolute path to a project .readable dir containing brand.css');
  const p = path.join(dir, 'brand.css');
  const st = fs.statSync(p);
  if (st.size > CSS_MAX) throw new Error('brand.css too large (max 16KB)');
  const mtime = (f) => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch (e) { return 0; } };
  const key = st.mtimeMs + ':' + st.size + ':' + mtime('brand.json') + ':' + mtime('logo.svg');
  const hit = cache.get(dir);
  if (hit && hit.key === key) return hit.css;
  let out = fs.readFileSync(p, 'utf8').replace(/</g, '');
  const imports = (out.match(/@import[^\n]+/g) || []).filter((l) => l.indexOf('fonts.googleapis') !== -1);
  out = out.replace(/@import[^\n]+/g, '').replace(/(^|[}\s,])\[data-theme=/g, '$1html[data-theme=');
  out = imports.concat([out]).join('\n');
  const head = letterheadCss(dir);
  if (head) out += '\n' + head;
  cache.set(dir, { key, css: out });
  return out;
}

/* For callers where an unbrandable dir is simply "no brand", not a failure: the
 * email export used to paint a branded card in the kit's blue because its
 * palette was a hardcoded map, and the one artifact most likely to leave the
 * building left it in someone else's colours. */
function cssOrNone(dir, roots) {
  try {
    const d = dirFor(dir, roots);
    return d ? css(d) : '';
  } catch (e) { return ''; }
}

/* SIGNATURE OPT-OUT (5.2.0): "signature": false in .readable/brand.json. One
 * mechanism for both paths (build.py reads the same key), committable, and it
 * sits with the identity that raises the question in the first place — a brand
 * layer is what turns a report into someone else's client-facing document.
 * Resolution reuses dirFor, so an explicit dir wins and an empty one still gets
 * the unambiguous lone-root/cwd guess; a missing or malformed brand.json means
 * opted IN, never a hard failure. */
function signatureOff(dir, roots) {
  const d = dirFor(dir, roots);
  if (!d) return false;
  try {
    const f = path.join(d, 'brand.json');
    return fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).signature === false;
  } catch (e) { return false; }
}

module.exports = { dirFor, css, cssOrNone, signatureOff, isBrandDir, CSS_MAX };
