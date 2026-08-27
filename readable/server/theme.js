'use strict';
/**
 * The card's copy of the shared palette and the shared LTR overrides.
 *
 * Both sheets are authored once under assets/ and read here; this module owns
 * the one adaptation each needs for a CHAT CARD, and nothing else:
 *
 *   palette()  `:root[data-theme=...]` -> `html[data-theme=...]`, which drops
 *              the block to the same specificity a brand's own dark rules get
 *              from server/brand.js. They tie, and the brand wins by source
 *              order. Left as `:root` the brand would lose and a branded card
 *              would paint dark in the kit's colours.
 *   ltr()      delivered as authored: a chat card mixes languages, so the
 *              rules stay scoped to `.rc[dir=ltr]` and the bridge stamps dir
 *              from the content's majority script.
 *
 * Host CSS variables do not exist inside the sandboxed MCP Apps iframe, which
 * is why the card ships a palette at all. The page then paints itself with
 * --surface-1 edge to edge: a transparent page is NOT safe, because the host
 * composites the iframe onto an opaque light canvas and dark-theme text came
 * out on a white backing. color-scheme rides along in the palette so native UI
 * and the canvas agree too.
 */
const paths = require('./paths.js');
const kit = require('./kit.js');

const PALETTE = kit.stripComments(paths.read('palette.css'))
  .replace(/:root\[data-theme/g, 'html[data-theme')
  .replace(/:root:not\(\[data-theme/g, 'html:not([data-theme')
  .replace(/\n{2,}/g, '\n').trim();

const LTR_SRC = kit.stripComments(paths.read('ltr.css'));
/* Same line-anchored hoist as the kit's own imports, and for the same reason:
 * the Google Fonts URL is full of semicolons. */
const LTR_IMPORTS = (LTR_SRC.match(/@import[^\n]+/g) || []).slice();
const LTR = LTR_SRC.replace(/@import[^\n]+/g, '').replace(/\n{2,}/g, '\n').trim();

/* The card renders flush inside the host's own rounded, framed cell: no border,
 * radius or margin of its own, which read as a cheap nested box. Card-only, so
 * rc.css keeps the frame for the tier 2 path where a card floats bare in the
 * chat column. */
const FLUSH = '.rc{margin:0;border:none;border-radius:0;background:transparent}';

const PAGE = 'html,body{margin:0;background:var(--surface-1);overflow:hidden}';

module.exports = {
  palette: () => PALETTE,
  page: () => PAGE,
  flush: () => FLUSH,
  ltr: () => LTR,
  ltrImports: () => LTR_IMPORTS.slice(),
  /* Every font the card can paint with: the kit's own (Vazirmatn) plus the LTR
   * face. server/fonts.js embeds exactly this list, so a font added to either
   * sheet is embedded in PNG exports with no second edit. */
  fontImports: () => kit.imports().concat(LTR_IMPORTS),
};
