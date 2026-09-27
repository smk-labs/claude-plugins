'use strict';
/**
 * The tool registry: one entry per tool, and ONE dispatcher.
 *
 * Adding a tool used to be a three-place edit — a schema constant, a name in
 * the tools/list array, and a branch of an eight-deep if-chain in tools/call,
 * where each branch spelled out the same validate → try → respond → catch →
 * isError shape by hand. Here a tool is data:
 *
 *   name, description, inputSchema   what the host is told
 *   needsUi                          listed only where a card can be painted
 *   nonEmpty                         args that must not be blank strings
 *   failure                          prefix for a RUNTIME failure, which comes
 *                                    back as an isError RESULT (the call
 *                                    happened, the work did not). Omit it and a
 *                                    throw propagates as a protocol error.
 *   run(args, ctx)                   the actual work: return a string for a
 *                                    plain text result, or a full result object
 *
 * Bad arguments are a PROTOCOL error (-32602), never an isError result: the
 * model has to be able to tell "I called this wrong" from "it ran and failed".
 *
 * ctx carries what the session knows and this module must not reach for:
 * { uiReady(), roots() }.
 */
const paths = require('./paths.js');
const kit = require('./kit.js');
const theme = require('./theme.js');
const blocks = require('./blocks.js');
const brand = require('./brand.js');
const files = require('./files.js');
const fonts = require('./fonts.js');
const sys = require('./sys.js');

/* The email transform is not written here: assets/email.js is THE single source,
 * shared verbatim with the standalone report (skills/report/build.py inlines the
 * same file). Until 5.4.0 each host carried its own adapter and they drifted
 * apart; the only thing this side owns is resolving the project brand into the
 * palette the transform paints with. */
const renderEmail = require(paths.asset('email.js'));
/* The authoring format: md in, the kit's building-block HTML out. Same
 * single-source rule as email.js; the report build runs the same file. */
const md = require(paths.asset('md.js'));

const CARD_URI = 'ui://readable/card.html';

/* Invalid arguments: reported as JSON-RPC -32602 so the model can correct the
 * call. Anything else thrown by a run() is a runtime failure. */
class ParamError extends Error {}
/* A protocol error with a code of its own — today only the card refusal. */
class ProtocolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const NO_MARKUP = /<\s*(style|script)\b/i;

const SPECS = [
  {
    name: 'card',
    needsUi: true,
    description: blocks.forTier(1),
    inputSchema: {
      type: 'object',
      properties: {
        md: { type: 'string', description: 'The whole reply, in the Markdown described above.' },
        html: { type: 'string', description: 'Legacy: the reply as building-block HTML. Prefer md.' },
        htmlFile: { type: 'string', description: 'Absolute path to a worker\'s *-card.md or *-card.html file; the card renders from it.' },
        brand: { type: 'string', description: 'Absolute path to the project\'s .readable brand dir. Pass it on every call when the session rule announces one; omit otherwise.' },
      },
    },
    /* alwaysLoad (7.0.0): Claude Code defers MCP tools behind ToolSearch, which
     * cost the first Persian reply of every session one extra turn. This tool is
     * the reply channel, so it is never worth deferring. */
    _meta: { ui: { resourceUri: CARD_URI, visibility: ['model', 'app'] }, 'anthropic/alwaysLoad': true },
    run: card,
  },
  {
    /* App-only: the card menu calls this through the host to save an export with
     * a real, verifiable path. pick (4.12.0): on macOS the server opens the
     * native save panel defaulting to the project root, ACKs the RPC first so
     * the card UI never waits on the dialog, then writes wherever the user
     * chose. READABLE_SAVE_DIR skips the panel entirely. */
    name: 'save_card',
    description: 'Internal: saves a card export (PNG/HTML/Markdown/text) to disk for the card UI menu. Called by the embedded card interface, never by the assistant.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'base file name, e.g. readable-card.png' },
        content: { type: 'string', description: 'file content (utf8 text or base64)' },
        encoding: { type: 'string', enum: ['utf8', 'base64'] },
        pick: { type: 'boolean', description: 'macOS: let the user choose the location in the native save panel (default location = first workspace root)' },
      },
      required: ['filename', 'content'],
    },
    failure: 'save failed: ',
    run: saveCard,
  },
  {
    /* Email clients are not browsers — Gmail strips <style> on forward, Outlook
     * renders through Word — so the card is rebuilt as table-based, inline-styled
     * HTML with literal colours and every pseudo-element decoration materialized
     * as a real character. It runs HERE rather than in the card because the ui://
     * template must stay under the host's ~30KB ceiling. */
    name: 'render_email',
    description: 'Internal: renders card content HTML as email-client-ready inline-styled HTML for the card UI menu (Email copy/download). Called by the embedded card interface, never by the assistant.',
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'card content HTML (building blocks)' },
        theme: { type: 'string', enum: ['light', 'dark'] },
        brand: { type: 'string', description: 'absolute path to the project .readable dir' },
      },
      required: ['html'],
    },
    nonEmpty: ['html'],
    run: (a, ctx) => {
      if (NO_MARKUP.test(a.html)) throw new ParamError('html must not contain <style> or <script>');
      return renderEmail(a.html, { theme: a.theme, brand: brand.cssOrNone(a.brand, ctx.roots()) });
    },
  },
  {
    name: 'read_card_file',
    description: 'Internal: returns the content of a pre-written *-card.html report file for the card UI to render (the card tool\'s htmlFile mode). Called by the embedded card interface, never by the assistant.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'absolute path ending in -card.html' } },
      required: ['path'],
    },
    nonEmpty: ['path'],
    failure: 'read failed: ',
    run: (a) => files.readCardFile(a.path),
  },
  {
    /* Inside the sandboxed MCP Apps iframe, page-level clipboard writes are
     * swallowed (navigator.clipboard is permission-blocked and
     * execCommand('copy') still RETURNS TRUE while writing nothing), so every
     * Copy button lied with a green check. The card UI copies through this tool
     * instead: the server is a local process and can pipe into the OS helper. */
    name: 'copy_text',
    description: 'Internal: copies text to the system clipboard for the card UI menu. Called by the embedded card interface, never by the assistant.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'plain text to copy' } },
      required: ['text'],
    },
    failure: 'copy failed: ',
    run: (a) => 'copied via ' + sys.copyText(a.text),
  },
  {
    name: 'read_brand',
    description: 'Internal: returns a project\'s .readable brand layer (normalized CSS) for the card UI to apply. Called by the embedded card interface, never by the assistant.',
    inputSchema: {
      type: 'object',
      properties: { dir: { type: 'string', description: 'absolute path of the project\'s .readable dir' } },
      required: ['dir'],
    },
    nonEmpty: ['dir'],
    failure: 'brand read failed: ',
    run: (a) => brand.css(a.dir),
  },
  {
    name: 'read_fonts',
    description: 'Internal: returns base64-embedded @font-face CSS (the kit web fonts) so the card UI can inline real font bytes into PNG exports. Called by the embedded card interface, never by the assistant.',
    inputSchema: { type: 'object', properties: {} },
    failure: 'font embed failed: ',
    run: () => fonts.embed(theme.fontImports()),
  },
  {
    /* read_kit (4.20.0): the component half of the kit, selected for one card.
     * The template carries BASE; the app posts the card HTML here and gets back
     * only the snippets that HTML uses. Since 5.2.0 the reply also carries the
     * project's signature opt-out as a leading '!', because this is the one
     * app-only call the first paint waits on. */
    name: 'read_kit',
    description: 'Internal: returns the kit component CSS a specific card needs, selected from its HTML. Called by the embedded card interface, never by the assistant.',
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'The card content HTML to select component CSS for.' },
        md: { type: 'string', description: 'The card content as md: compiled here, and the reply carries the html too.' },
        brand: { type: 'string', description: 'The card call\'s .readable brand dir, if any; carries the signature opt-out.' },
      },
    },
    failure: 'kit select failed: ',
    run: readKit,
  },
];

const BY_NAME = new Map(SPECS.map((s) => [s.name, s]));

/* What the host is told. The card tool is offered ONLY to a host that
 * negotiated MCP Apps: anywhere else it cannot paint, and an unrenderable card
 * tool is worse than no card tool at all — the model calls it, the user sees raw
 * HTML echoed back, and the actual reply is never written. Absent from the list
 * it cannot be called, and a tool search for it correctly finds nothing instead
 * of half-finding a tool that lies. */
function list(ctx) {
  return SPECS.filter((s) => !s.needsUi || ctx.uiReady()).map((s) => {
    const out = { name: s.name, description: s.description, inputSchema: s.inputSchema };
    if (s._meta) out._meta = s._meta;
    return out;
  });
}

/* Required arguments, checked once for every tool off its own schema. */
function validate(spec, args) {
  const props = (spec.inputSchema && spec.inputSchema.properties) || {};
  for (const name of (spec.inputSchema && spec.inputSchema.required) || []) {
    const want = (props[name] && props[name].type) || 'string';
    if (typeof args[name] !== want) throw new ParamError(name + ' (' + want + ') is required');
  }
  for (const name of spec.nonEmpty || []) {
    if (!String(args[name] || '').trim()) throw new ParamError(name + ' (string) is required');
  }
}

/* Run one call and shape the result. Always async, so a host never sees two
 * different completion styles for two tools. */
async function call(name, args, ctx) {
  const spec = BY_NAME.get(name);
  if (!spec) throw new ParamError('unknown tool');
  validate(spec, args);
  try {
    const out = await spec.run(args, ctx);
    return typeof out === 'string' ? { content: [{ type: 'text', text: out }] } : out;
  } catch (e) {
    /* A bad argument stays a protocol error even when the tool found out late. */
    if (e instanceof ParamError || e instanceof ProtocolError) throw e;
    if (!spec.failure) throw e;
    return { isError: true, content: [{ type: 'text', text: spec.failure + String(e && e.message) }] };
  }
}

/* The card tool: the one whose result is not content but a render instruction.
 * md compiles here; the html rides the result's _meta for the host's app
 * channel, and the text content exists only to stop the model repeating itself. */
function card(args, ctx) {
  /* A host that cannot paint gets a REFUSAL, not a note. The note was the bug: a
   * successful result carrying "this did not render" reads as success, the html
   * rides structuredContent into the transcript as raw markup, and the model
   * signs off with "card delivered above" over a reply the user never saw. An
   * error cannot be mistaken for delivery. */
  if (!ctx.uiReady()) {
    throw new ProtocolError(-32011, 'this host has no MCP Apps UI, so a card cannot be rendered here and nothing was shown to the user. Deliver the whole reply as text instead (Persian/RTL: BiDi-safe plain text), and do not call this tool again in this conversation.');
  }
  const htmlFile = args.htmlFile;
  const given = ['md', 'html'].filter((k) => typeof args[k] === 'string' && args[k].trim());
  /* Resolved once per call: explicit arg, else an unambiguous lone-root/cwd
   * guess (never across parallel projects). It rides the result as a PATH only;
   * the bridge pulls the css itself, so branding costs the model nothing. */
  const dir = brand.dirFor(args.brand, ctx.roots());
  if (typeof htmlFile === 'string' && htmlFile.trim()) {
    if (given.length) throw new ParamError('pass exactly one of md | html | htmlFile, not both');
    /* Validated now so the model gets an actionable error while it can still
     * fall back to md; the bridge re-reads via read_card_file. */
    try { files.readCardFile(htmlFile); } catch (e) {
      throw new ParamError(String(e && e.message) + ' — fix the file or pass the content as md');
    }
    sys.log('tools/call card, htmlFile=' + htmlFile + ', brand=' + (dir || 'none'));
    return rendered({ htmlFile }, dir, ' from the file', []);
  }
  if (given.length !== 1) throw new ParamError(given.length ? 'pass exactly one of md | html | htmlFile' : 'md (string) is required (or htmlFile for a worker\'s *-card.md file)');
  const src = args[given[0]];
  if (NO_MARKUP.test(src)) throw new ParamError(given[0] + ' must not contain <style> or <script>; send content only');
  const out = given[0] === 'md' ? md.compile(src) : { html: src, warnings: [] };
  sys.log('tools/call card, ' + given[0] + '=' + src.length + 'B, brand=' + (dir || 'none'));
  return rendered({ html: out.html }, dir, '', out.warnings);
}

/* The result the MODEL reads is the one text line, nothing else. Until 7.0.0
 * the html also rode structuredContent, and Claude Code shows the model
 * JSON.stringify(structuredContent) in place of the text whenever it is
 * present, so every card sat in the transcript twice: once as the call, once
 * as its own echo, re-read on every later turn. The view still needs the html
 * (a host may hand it the result without the input), so it rides _meta, which
 * reaches the app and not the model. */
function rendered(payload, dir, where, warnings) {
  const card = dir ? Object.assign({}, payload, { brand: dir }) : payload;
  const note = warnings.length ? ' Notes: ' + warnings.join('; ') + '.' : '';
  return {
    content: [{ type: 'text', text: 'Card rendered by the host UI' + where + '. The user sees it: end the reply here, no restatement or summary.' + note }],
    _meta: { 'readable/card': card },
  };
}

/* read_kit: the component CSS one card needs. Called by the bridge on every
 * paint, streaming partials included, so it is also where md compiles on the
 * way to the screen: one round trip that was already being paid carries the
 * html back with its css. A md request gets JSON {h, c, n}; an html request
 * keeps the old reply, css with a leading '!' for the signature opt-out. */
function readKit(a, ctx) {
  const off = brand.signatureOff(a.brand, ctx.roots());
  if (typeof a.md === 'string') {
    const html = md.compile(a.md).html;
    return JSON.stringify({ h: html, c: kit.cssFor(html), n: off });
  }
  if (typeof a.html !== 'string') throw new ParamError('html (string) or md (string) is required');
  return (off ? '!' : '') + kit.cssFor(a.html);
}

function saveCard(a, ctx) {
  const dir = files.saveDir(ctx.roots());
  /* Native save panel: the RPC is ACKed BEFORE the dialog so the card UI never
   * waits on the user. READABLE_SAVE_DIR (tests, power users) and non-mac hosts
   * keep the direct write. setImmediate is what guarantees the ACK is on the
   * wire before the panel opens. */
  if (a.pick === true && process.platform === 'darwin' && !process.env.READABLE_SAVE_DIR) {
    setImmediate(() => files.pickAndSave(a.filename, a.content, a.encoding, dir));
    return 'picking: ' + dir;
  }
  const saved = files.save(a.filename, a.content, a.encoding, dir);
  sys.log('save_card -> ' + saved);
  return saved;
}

module.exports = { list, call, ParamError, ProtocolError, CARD_URI, names: () => SPECS.map((s) => s.name) };
