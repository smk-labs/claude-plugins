'use strict';
/**
 * The two OS integrations this server needs, and the locale fix both depend on.
 */
const { spawnSync } = require('child_process');

/* Every child process this server starts is handed a UTF-8 ctype (5.7.0).
 *
 * The server is spawned by a GUI app, so it inherits no LANG and no LC_*: the
 * environment a desktop app hands its children has no locale in it at all.
 * macOS command line tools read that as Mac OS Roman, so pbcopy took perfectly
 * good UTF-8 bytes on stdin, decoded each one as a MacRoman character, and put
 * the result on the clipboard. Copying a Persian card produced "ŸÖÿ≥ÿ™ŸÜÿØ"
 * where "مستند" was written: two bytes per letter, each byte shown as its own
 * glyph. The bytes leaving node were never wrong; the transcoding at the far
 * end was. osascript decodes its -e script the same way, which mangled a
 * Persian default filename in the save panel and could hand back a mangled path
 * to write to.
 *
 * LC_CTYPE is the one variable that decides this, so it is the one we set. */
function utf8Env(extra) {
  return Object.assign({}, process.env, { LC_CTYPE: 'UTF-8' }, extra || null);
}

/* READABLE_COPY_CMD overrides the helper (tests use `cat` so runs never touch
 * the developer's real clipboard). clip.exe reads UTF-16LE; the text is encoded
 * as bare UTF-16LE with NO BOM — a leading BOM (U+FEFF) is pasted as a literal
 * zero-width character, which showed up as a stray glyph beside every copy and
 * mangled Persian snippets (field bug on Windows). Everywhere else the input is
 * an explicit UTF-8 Buffer, so node's default string encoding never gets a vote
 * either. Returns the helper that worked, for the card UI's toast. */
function copyText(text) {
  const override = process.env.READABLE_COPY_CMD;
  const cands = override ? [override.split(' ')] :
    process.platform === 'darwin' ? [['pbcopy']] :
    process.platform === 'win32' ? [['clip']] :
    [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '-ib']];
  const input = !override && process.platform === 'win32'
    ? Buffer.from(text, 'utf16le')
    : Buffer.from(text, 'utf8');
  for (const [cmd, ...args] of cands) {
    const r = spawnSync(cmd, args, { input, env: utf8Env() });
    if (!r.error && r.status === 0) return cmd;
  }
  throw new Error('no clipboard helper worked');
}

/* WHICH surface is on the other end (6.3.0)? Every client calls itself
 * claude-ai/0.1.0, and the same name negotiates MCP Apps on one connection and
 * not on the next: one machine's log held 163 YES against 45 NO in a day, all
 * under that one name. From the outside that reads as a coin flip, and a whole
 * afternoon can go into guessing which surface a given session was. The parent
 * process knows, so ask it once and put it in the handshake line beside the
 * answer. Cheap, best-effort, and it never blocks the handshake: no parent, no
 * ps, or a slow ps, all just yield "?". */
let parentCache = null;
function parentProcess() {
  if (parentCache !== null) return parentCache;
  parentCache = '?';
  try {
    const ppid = process.ppid;
    if (!ppid) return parentCache;
    const win = process.platform === 'win32';
    const r = spawnSync(
      win ? 'wmic' : 'ps',
      win ? ['process', 'where', 'ProcessId=' + ppid, 'get', 'Name'] : ['-p', String(ppid), '-o', 'args='],
      { encoding: 'utf8', timeout: 2000 }
    );
    const line = String((r && r.stdout) || '').trim().split('\n')[0] || '';
    /* The interesting part is which app/binary it is, not the full argv, and a
     * full argv here would put the user's paths into a log they may paste. */
    const m = line.match(/([^\/\\ ]+)(?:\.app\/Contents\/[^ ]*)?\s*$/) || line.match(/([^\/\\]+)$/);
    const app = (line.match(/\/([^\/]+)\.app\//) || [])[1];
    parentCache = (app || (m && m[1]) || '?').slice(0, 40) + '/pid' + ppid;
  } catch (e) { /* diagnostics must never break the handshake */ }
  return parentCache;
}

/* One place decides what reaches stderr, so a log line can never throw into the
 * protocol. Every message is prefixed with the server name, which is what makes
 * a desktop app's shared log greppable. */
function log(msg) {
  try { process.stderr.write('[readable-card] ' + msg + '\n'); } catch (e) { /* never break the session */ }
}

module.exports = { utf8Env, copyText, parentProcess, log };
