'use strict';
/**
 * What the client on the other end of the pipe can actually do.
 *
 * Everything about the card tool hangs off one answer — uiReady() — so it lives
 * in one place: whether the tool is listed, and whether a call to it is honoured
 * or refused. It is a function and not a captured boolean because the handshake
 * lands after every module has loaded.
 */
const sys = require('./sys.js');

let supportsUi = false;
let supportsRoots = false;
let roots = [];

const UI_EXT = 'io.modelcontextprotocol/ui';
const UI_MIME = 'text/html;profile=mcp-app';

/* Reads the initialize params and logs the one line that answers "which surface
 * is this?" — see sys.parentProcess for why the parent pid is in it. */
function negotiate(params) {
  const caps = (params && params.capabilities) || {};
  const ext = caps.extensions;
  const ui = ext && ext[UI_EXT];
  supportsUi = Boolean(ui && Array.isArray(ui.mimeTypes) && ui.mimeTypes.indexOf(UI_MIME) !== -1);
  supportsRoots = Boolean(caps.roots);
  const ci = (params && params.clientInfo) || {};
  sys.log('client=' + (ci.name || '?') + '/' + (ci.version || '?') +
    ' mcp-apps=' + (supportsUi ? 'YES' : 'NO') +
    ' roots=' + (supportsRoots ? 'YES' : 'NO') +
    ' spawnedBy=' + sys.parentProcess() +
    ' extensions=' + JSON.stringify(ext ? Object.keys(ext) : []));
}

/* Can this host actually paint a card?
 *
 * READABLE_NO_CARD is a HARD no, checked before anything the client claims. It
 * exists because a client can declare the MCP Apps extension and still be unable
 * to paint: Claude Code's plugin bridge does exactly that. The gate trusts the
 * declaration, so on that host the card tool was offered, the call succeeded, and
 * the html came back as structuredContent and printed raw in the chat — the
 * original defect this whole server was rewritten to kill. The plugin's own
 * scoped server therefore sets this and carries the export tools only; the
 * desktop-registered server, which really does paint, sets nothing.
 *
 * READABLE_FORCE_UI=1 is the escape hatch for a host whose handshake lands late. */
function uiReady() {
  if (process.env.READABLE_NO_CARD === '1') return false;
  return supportsUi || process.env.READABLE_FORCE_UI === '1';
}

function rootPath(uri) {
  try {
    const u = new URL(String(uri));
    if (u.protocol !== 'file:') return null;
    const p = decodeURIComponent(u.pathname);
    return process.platform === 'win32' ? p.replace(/^\/([A-Za-z]:)/, '$1') : p;
  } catch (e) { return null; }
}

/* Asked once on initialized and again whenever the client says the list moved.
 * `request` is passed in so this module never reaches for the transport. */
function refreshRoots(request) {
  if (!supportsRoots) return;
  request('roots/list', {}, (res, err) => {
    roots = (!err && res && Array.isArray(res.roots) ? res.roots : [])
      .map((r) => rootPath(r && r.uri)).filter(Boolean);
    sys.log('roots=' + JSON.stringify(roots));
  });
}

module.exports = {
  negotiate,
  uiReady,
  refreshRoots,
  roots: () => roots.slice(),
  UI_EXT,
  UI_MIME,
};
