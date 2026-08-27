'use strict';
/**
 * Everything this server reads from or writes to the user's disk.
 *
 * Nothing here decides WHERE on its own except saveDir(), which is handed the
 * workspace roots rather than reaching for them: that is what lets the tests
 * drive every branch (lone root, several roots, rootless spawn) without a
 * server handshake.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sys = require('./sys.js');

const CARD_FILE_MAX = 256 * 1024;

/* The app-side half of the card tool's htmlFile mode (4.6). The bridge fetches
 * the content through the host (tools/call), so the HTML reaches the iframe
 * without ever entering the model's context — the measured alternative
 * (structuredContent.html) is echoed back to the model verbatim by the desktop
 * host. Guardrails: absolute path, *-card.html name, size cap, and the same
 * no-<style>/<script> rule as an inline card. */
function readCardFile(p) {
  const abs = String(p);
  if (!path.isAbsolute(abs)) throw new Error('htmlFile must be an absolute path');
  if (!/-card\.html$/.test(path.basename(abs))) throw new Error('htmlFile must end with -card.html');
  let st;
  try { st = fs.statSync(abs); } catch (e) { throw new Error('htmlFile not found: ' + abs); }
  if (!st.isFile()) throw new Error('htmlFile is not a regular file');
  if (st.size > CARD_FILE_MAX) throw new Error('htmlFile too large (max 256KB)');
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.trim()) throw new Error('htmlFile is empty');
  if (/<\s*(style|script)\b/i.test(text)) throw new Error('htmlFile must not contain <style> or <script>');
  return text;
}

/* Where an export lands. A lone workspace root (MCP roots/list) is the session's
 * project; with several open projects the caller is unknown, so fall through
 * rather than dropping the file into whichever root happens to be listed
 * first. */
function saveDir(roots) {
  if (process.env.READABLE_SAVE_DIR) return process.env.READABLE_SAVE_DIR;
  const rs = roots || [];
  if (rs.length === 1 && fs.existsSync(rs[0])) return rs[0];
  const cwd = process.cwd();
  // Plugin-spawned servers inherit the project dir; app-spawned ones sit at /.
  if (cwd && cwd !== '/' && cwd !== os.homedir()) return cwd;
  return path.join(os.homedir(), 'Downloads');
}

/* Keeps Unicode letters (Persian card titles stay Persian on disk); strips path
 * separators and control chars, spaces become dashes. */
function cleanName(filename) {
  const clean = String(filename).normalize('NFC').replace(/\s+/g, ' ').trim()
    .replace(/[^\p{L}\p{N} ._-]+/gu, '_').replace(/ /g, '-').replace(/^[._-]+/, '').slice(0, 80);
  if (!clean) throw new Error('bad filename');
  return clean;
}

function decode(content, encoding) {
  return Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8');
}

/* Never overwrites: an existing name grows a -1, -2 suffix. */
function save(filename, content, encoding, dir) {
  const clean = cleanName(filename);
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(clean);
  const base = clean.slice(0, clean.length - ext.length);
  let target = path.join(dir, clean);
  for (let n = 1; fs.existsSync(target); n++) target = path.join(dir, base + '-' + n + ext);
  fs.writeFileSync(target, decode(content, encoding));
  return target;
}

/* macOS native save panel from this faceless node process: osascript's "choose
 * file name" (StandardAdditions, no TCC prompt). The RPC was already ACKed, so
 * cancel (-128) or failure only logs; the dialog itself is the user feedback.
 * Replace-confirmation is the dialog's, so no -1 suffix loop here. */
function pickAndSave(filename, content, encoding, dir) {
  const clean = cleanName(filename);
  const start = fs.existsSync(dir) ? dir : path.join(os.homedir(), 'Downloads');
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = 'POSIX path of (choose file name with prompt "Save card export" default name "' +
    esc(clean) + '" default location POSIX file "' + esc(start) + '")';
  // encoding + LC_CTYPE both matter here: the first decodes the path osascript
  // hands back, the second decides how osascript reads the Persian default
  // filename we just wrote into the script. See sys.utf8Env.
  require('child_process').execFile('/usr/bin/osascript', ['-e', script],
    { timeout: 180000, encoding: 'utf8', env: sys.utf8Env() }, (err, out) => {
      try {
        if (err) {
          const cancel = String(err.message || '').indexOf('-128') !== -1;
          sys.log('save picker ' + (cancel ? 'cancelled' : 'failed: ' + String(err.message).slice(0, 120)));
          return;
        }
        const target = String(out).trim();
        if (!target) return;
        fs.writeFileSync(target, decode(content, encoding));
        sys.log('save_card picked -> ' + target);
      } catch (e) {
        sys.log('picked save failed: ' + String(e && e.message));
      }
    });
}

module.exports = { readCardFile, saveDir, cleanName, save, pickAndSave, CARD_FILE_MAX };
