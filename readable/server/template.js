'use strict';
/**
 * The predeclared ui:// resource: one static HTML document, assembled once at
 * load, that the host renders the card inside.
 *
 * Static is the constraint that shapes everything here. The resource is served
 * before any card content exists, so it cannot be tailored per card: it carries
 * BASE plus the bridge, and the component CSS for a given card is fetched at
 * paint time through the read_kit tool (see LAZY KIT below). The host's ~30KB
 * ceiling on this one resource is why the assembly compresses at all.
 */
const paths = require('./paths.js');
const kit = require('./kit.js');
const theme = require('./theme.js');
const bridge = require('./bridge.js');

const URI = 'ui://readable/card.html';
const MIME = 'text/html;profile=mcp-app';

/* LAZY KIT (4.20.0). The template used to inline the whole pre-@REPORT sheet.
 * The sheet is no longer WHERE the tailoring happens: BASE ships here, and the
 * app asks the server for the snippets a given card's HTML actually needs
 * (read_kit, the same app-only channel as read_brand). That is genuine
 * pay-per-use, it keeps the card offline-safe (the CSS comes from this server,
 * not a CDN), and it takes the 30KB ceiling off the critical path for good.
 *
 * htmlFile mode is why the CSS cannot simply ride along in the tool result: the
 * server never sees that HTML (the app reads the file itself via
 * read_card_file), so only the app can ask, and it asks once it holds the HTML
 * either way. */
const BASE_NL = kit.stripComments(kit.base()).replace(/@import[^\n]+/g, '')
  /* rc.css keeps one rule per line for diffability; newlines are pure padding
   * to the CSS tokenizer, so assembly strips them (~70 chars of the budget). */
  .replace(/\n+/g, '');

/* Assembly-time compression, TEMPLATE COPY ONLY (the sources and the
 * report/tier-2 paths keep the long names): the kit's hottest var() tokens are
 * aliased once on .rc and every use shrinks to var(--xx). Frees ~0.3KB of the
 * 30KB ceiling, which pays for the per-code-block copy button (4.11.0). Longest
 * pattern first so `.5px solid var(--border)` collapses before the name pass;
 * the alias definitions are injected AFTER the passes so they keep long names. */
const ALIASES = [
  [':.5px solid var(--border)', ':var(--bd)', '--bd:.5px solid var(--border);'],
  ['var(--text-secondary)', 'var(--ts)', '--ts:var(--text-secondary);'],
  ['var(--text-accent)', 'var(--ta)', '--ta:var(--text-accent);'],
  ['var(--border-strong)', 'var(--bs)', '--bs:var(--border-strong);'],
  ['var(--surface-2)', 'var(--s2)', '--s2:var(--surface-2);'],
];
const BASE_CSS = ALIASES.reduce((css, [long, short]) => css.split(long).join(short), BASE_NL)
  .replace('.rc{', '.rc{' + ALIASES.map((a) => a[2]).join(''));

/* Card menu (5x2 copy/download matrix): single-sourced from assets/menu.js and
 * shared verbatim with the standalone report shell. Self-installing IIFE;
 * comment lines are dropped and the rest joined with no separator. Menu.js's
 * style contract (one statement per line, block comments on their own lines) is
 * what makes that join safe. */
const MENU = paths.read('menu.js').split('\n').filter((l) => l.slice(0, 2) !== '/*').join('');

/* Assembly-time JS squeeze, template copy only (same move as the kit's var
 * aliases): the script opens with a few tiny globals and every dotted host-
 * object use shrinks. `document.`/`window.` collapse to D./W.; on top of that
 * the four hottest DOM methods get one-letter helpers — createElement and
 * getElementById (always on document) fold by plain substring,
 * querySelectorAll/querySelector (called on many elements) fold by a receiver
 * regex, All first so the shorter name cannot eat the longer one. Last pass:
 * every ANONYMOUS function literal becomes an arrow. That is only safe because
 * neither source uses `this` or the `arguments` object (the `arguments` in the
 * bridge are MCP tool-call payload keys), and it is worth ~0.4KB across the ~65
 * callbacks; named declarations keep the keyword, since the regex needs `(`
 * straight after it. Frees ~1.2KB, which pays for the pointer-tracked export
 * controls (4.16.0). test.js parse-checks AND behavior-checks the result. */
function squeeze(js) {
  const s = js.split('document.').join('D.').split('window.').join('W.')
    .split('D.createElement(').join('CE(')
    .split('D.getElementById(').join('G(')
    .replace(/([\w$]+)\.querySelectorAll\(/g, 'Q($1,')
    .replace(/([\w$]+)\.querySelector\(/g, 'S($1,')
    .replace(/\bfunction\s*\(([^)]*)\)\s*\{/g, '($1)=>{')
    .replace(/\(([\w$]+)\)=>\{/g, '$1=>{');
  return 'var D=document,W=window,CE=t=>D.createElement(t),G=i=>D.getElementById(i),Q=(e,s)=>e.querySelectorAll(s),S=(e,s)=>e.querySelector(s);' + s;
}

const HTML =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>\n' +
  kit.imports().concat(theme.ltrImports()).join('\n') + '\n' +
  theme.palette() + '\n' + theme.page() + '\n' +
  BASE_CSS + '\n' + theme.flush() + '\n' + theme.ltr() +
  '\n</style></head><body><div class="rc" id="card" dir="rtl"><p>…</p></div>' +
  '<script>' + squeeze(bridge.js(kit.signature()) + MENU) + '</script></body></html>';

/* The resource descriptor the host reads before it ever renders: the CSP the
 * iframe runs under (Google Fonts is the one external host the kit needs, for
 * Vazirmatn and Inter), the clipboard permission the export menu depends on,
 * and prefersBorder:false because theme.flush() already dropped the card's own
 * frame in favour of the host's cell. */
const RESOURCE = {
  uri: URI,
  name: 'readable_card_template',
  description: 'readable RTL card template (kit CSS + MCP Apps bridge)',
  mimeType: MIME,
  _meta: {
    ui: {
      csp: {
        resourceDomains: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        connectDomains: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      },
      permissions: { clipboardWrite: {} },
      prefersBorder: false,
    },
  },
};

module.exports = { html: () => HTML, resource: () => RESOURCE, squeeze, URI, MIME };
