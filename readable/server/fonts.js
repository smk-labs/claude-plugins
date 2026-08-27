'use strict';
/**
 * Base64-embedded @font-face CSS for the kit's web fonts (4.14.1).
 *
 * An SVG rendered via Image->canvas (the card's PNG export) CANNOT load an
 * external @import font — it rasterizes in a system fallback (Vazirmatn ->
 * Tahoma), which is why copied images looked "wrong font". The fix is to inline
 * the actual font bytes. The card UI cannot afford the fetch+base64 code inside
 * the 30KB template, so the server does it and hands back ready CSS.
 *
 * embed(imports) takes the @import lines to resolve, so the module has no
 * opinion about which fonts exist — theme.js owns that list, and a font added
 * to a sheet is embedded with no second edit here.
 */
const paths = require('./paths.js');

/* The css2 api serves woff2 only to a browser UA; anything else gets ttf, which
 * is three times the bytes. Same file skills/report/build.py reads, so the two
 * paths cannot fetch different formats or different subsets. */
const POLICY = paths.readJson('fonts.json');
const TIMEOUT = 8000;

let cache = null;

async function get(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ctrl.signal });
    return r.ok ? r : null;
  } finally { clearTimeout(t); }
}

/* Fetch each sheet (Google Fonts, woff2 via the browser UA), then for every
 * kept @font-face swap its gstatic url for a data: URI of the actual bytes.
 * Cached after the first success; a fully offline run returns '' and is NOT
 * cached, so a later online export can still embed. */
async function embed(imports) {
  if (cache) return cache;
  const urls = [];
  for (const line of imports) {
    line.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) => { urls.push(u); return _; });
  }
  let out = '';
  for (const u of urls) {
    let sheet = '';
    try {
      const r = await get(u, { 'user-agent': POLICY.ua });
      sheet = r ? await r.text() : '';
    } catch (e) { sheet = ''; }
    if (!sheet) continue;
    const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(sheet))) {
      const subset = m[1], body = m[2];
      if (subset && POLICY.subsets.indexOf(subset) < 0) continue;
      const um = body.match(/url\((https:\/\/[^)]+\.woff2)\)/);
      if (!um) continue;
      let data = '';
      try {
        const fr = await get(um[1]);
        if (fr) data = 'data:font/woff2;base64,' + Buffer.from(await fr.arrayBuffer()).toString('base64');
      } catch (e) { data = ''; }
      if (data) out += '@font-face{' + body.replace(um[1], data) + '}';
    }
  }
  if (out) cache = out;
  return out;
}

module.exports = { embed, POLICY };
