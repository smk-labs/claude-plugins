'use strict';
/**
 * Layout probe: the ONE place that knows this server ships in two shapes.
 *
 *   plugin layout   server/server.js  next to  assets/rc.css
 *   flat layout     server.js         next to  rc.css
 *
 * The flat one is not hypothetical: hooks/connect.sh copies the server and its
 * assets into a version-free stable dir so a plugin update cannot break the
 * path the desktop app has registered, and a .mcpb bundle is flat too. Four
 * separate candidate arrays used to spell this out, one per asset, so a fifth
 * asset meant remembering the trick a fifth time.
 */
const fs = require('fs');
const path = require('path');

/* Both layouts are tried in order and the first that exists wins. A miss is
 * fatal and says where it looked: an asset silently resolving to undefined
 * used to surface as `readFileSync(undefined)` three frames away. */
function asset(name) {
  const candidates = [path.join(__dirname, '..', 'assets', name), path.join(__dirname, name)];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('readable: asset not found: ' + name + ' (looked in ' + candidates.join(', ') + ')');
  return hit;
}

/* \r-strip on every read: a CRLF checkout (autocrlf=true on Windows) would
 * otherwise leak one stray byte per line into the card template and eat the
 * host's 30KB resource budget. */
function read(name) {
  return fs.readFileSync(asset(name), 'utf8').replace(/\r\n/g, '\n');
}

function readJson(name) {
  return JSON.parse(read(name));
}

/* The build banner exists to say WHICH build the host loaded, so the version is
 * read off the manifest, never typed in. As a literal it drifted: it still said
 * 4.14.1 after 4.16.0 shipped, i.e. it lied exactly when you reach for it.
 * Existence is not enough here (a file can be present and unparsable), so each
 * candidate is tried through the parse; a .mcpb manifest.json carries `version`
 * too, so one field name covers both layouts. */
const MANIFESTS = [
  path.join(__dirname, '..', '.claude-plugin', 'plugin.json'),
  path.join(__dirname, 'manifest.json'),
];
function version() {
  for (const p of MANIFESTS) {
    try {
      const v = JSON.parse(fs.readFileSync(p, 'utf8')).version;
      if (v) return String(v);
    } catch (e) { /* absent or unparsable: try the next layout */ }
  }
  return 'unknown';
}

module.exports = { asset, read, readJson, version };
