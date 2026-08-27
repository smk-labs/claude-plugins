'use strict';
/**
 * assets/blocks.md, parsed: the block vocabulary as data.
 *
 * Two shapes come out of one source. tier 1 is the `card` tool's description,
 * which the model is handed in every session, so it carries SHAPES only. tier 2
 * is the on-demand widget kit, so it carries shapes plus the craft notes. See
 * the header of blocks.md for the field meanings; the rules are enforced here
 * and pinned by test.js.
 */
const paths = require('./paths.js');

const SRC = paths.read('blocks.md');

const SECTIONS = (() => {
  const out = new Map();
  const parts = SRC.split(/^<!--@([a-z0-9 ]+)-->$/m);
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i].trim(), parts[i + 1].trim());
  return out;
})();

function section(name) {
  if (!SECTIONS.has(name)) throw new Error('blocks.md has no section @' + name);
  return SECTIONS.get(name);
}

/* One entry per `### TAG`, fields as `key: value` lines. A field is one line:
 * these values are long, and a continuation syntax would be one more rule to
 * remember for no gain in a file this size. */
const ENTRIES = (() => {
  const out = [];
  const body = section('components');
  for (const chunk of body.split(/^### /m).slice(1)) {
    const lines = chunk.trim().split('\n');
    const entry = { tag: lines[0].trim(), covers: [], tier: 'all' };
    for (const line of lines.slice(1)) {
      const m = line.match(/^([a-z]+):\s*(.*)$/);
      if (!m) throw new Error('blocks.md: ' + entry.tag + ' has a line that is not a field: ' + line.slice(0, 40));
      if (m[1] === 'covers') entry.covers = m[2].split(/[,\s]+/).filter(Boolean);
      else entry[m[1]] = m[2].trim();
    }
    if (!entry.shape) throw new Error('blocks.md: ' + entry.tag + ' has no shape');
    out.push(entry);
  }
  return out;
})();

/* Every @TAG this entry delivers CSS for, itself included. */
function tagsOf(entry) { return [entry.tag].concat(entry.covers); }

/* The entries a chat tier advertises: report-only blocks never, tier-2-only
 * blocks in tier 2 alone. */
function chat(tier) {
  return ENTRIES.filter((e) => e.tier !== 'r' && (tier === 2 || e.tier !== '2'));
}

/* One entry as prose. Notes ride along only where they are affordable. */
function describe(entry, withNotes) {
  const head = entry.tag + ' — ' + entry.shape;
  return withNotes && entry.notes ? head + ' ' + entry.notes : head;
}

function forTier(tier) {
  const list = chat(tier).map((e) => '- ' + describe(e, tier === 2)).join('\n');
  return [
    section('lead tier' + tier),
    section('text'),
    list,
    section('guidance'),
    section('close tier' + tier),
  ].join('\n\n');
}

module.exports = { forTier, section, entries: () => ENTRIES.slice(), chat, describe, tagsOf };
