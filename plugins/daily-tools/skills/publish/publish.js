#!/usr/bin/env node
// Publish a file, a folder, or a zip to the Partnerz portal as a Page.
//
// The portal's MCP tool takes the archive as base64 in its arguments, so
// calling it as a tool would push the whole document (fonts included)
// through the model's context. This reads the bytes from disk instead and
// posts them itself, so nothing but the command line is ever in context.
//
// Usage:
//   node publish.js <file|dir|zip> [--name "..."] [--slug s] [--access mode]
//                                  [--viewer a@b.com]... [--page-id ID]
//
// --page-id replaces an existing page in place (same URL, same access).
// Auth comes from the token mcp-remote already keeps for this server.

const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')

const SERVER = process.env.PORTAL_MCP_URL || 'https://portal.partnerz.io/mcp'
const MAX_BYTES = 25 * 1024 * 1024
const MAX_ENTRIES = 500

// ---------- args ----------

function parseArgs (argv) {
  const out = { viewers: [], access: 'allowlist' }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--name') out.name = argv[++i]
    else if (a === '--slug') out.slug = argv[++i]
    else if (a === '--access') out.access = argv[++i]
    else if (a === '--viewer') out.viewers.push(argv[++i])
    else if (a === '--page-id') out.pageId = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--out') out.out = argv[++i]
    else rest.push(a)
  }
  out.src = rest[0]
  return out
}

// ---------- zip ----------

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32 (buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

// Minimal deflate zip writer. UTF-8 names, fixed 1980 timestamp so the same
// input always produces the same archive.
function makeZip (entries) {
  const locals = []
  const central = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const deflated = zlib.deflateRawSync(e.data, { level: 9 })
    const store = deflated.length >= e.data.length
    const body = store ? e.data : deflated
    const method = store ? 0 : 8
    const crc = crc32(e.data)

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6) // UTF-8 names
    lh.writeUInt16LE(method, 8)
    lh.writeUInt16LE(0, 10) // time
    lh.writeUInt16LE(0x0021, 12) // date: 1980-01-01
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(body.length, 18)
    lh.writeUInt32LE(e.data.length, 22)
    lh.writeUInt16LE(name.length, 26)
    lh.writeUInt16LE(0, 28)
    locals.push(lh, name, body)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(method, 10)
    ch.writeUInt16LE(0, 12)
    ch.writeUInt16LE(0x0021, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(body.length, 20)
    ch.writeUInt32LE(e.data.length, 24)
    ch.writeUInt16LE(name.length, 28)
    ch.writeUInt32LE(0, 30) // extra + comment lengths
    ch.writeUInt16LE(0, 34) // disk number
    ch.writeUInt16LE(0, 36) // internal attrs
    ch.writeUInt32LE(0, 38) // external attrs
    ch.writeUInt32LE(offset, 42)
    central.push(ch, name)

    offset += lh.length + name.length + body.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

function walk (dir, base, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = path.join(dir, name)
    const st = fs.lstatSync(full)
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) walk(full, base, acc)
    else if (st.isFile()) {
      acc.push({ name: path.relative(base, full).split(path.sep).join('/'), data: fs.readFileSync(full) })
    }
  }
  return acc
}

function buildArchive (src) {
  const st = fs.statSync(src)
  if (st.isDirectory()) {
    const entries = walk(src, src, [])
    if (!entries.length) die(`no files in ${src}`)
    if (!entries.some(e => e.name === 'index.html')) {
      die(`${src} has no root-level index.html`)
    }
    return { buf: makeZip(entries), entries }
  }
  if (src.toLowerCase().endsWith('.zip')) {
    return { buf: fs.readFileSync(src), entries: null }
  }
  // A single file becomes the site's index.
  const ext = path.extname(src).toLowerCase()
  const name = ext === '.html' || ext === '.htm' ? 'index.html' : path.basename(src)
  const entries = [{ name, data: fs.readFileSync(src) }]
  return { buf: makeZip(entries), entries }
}

// ---------- title ----------

function titleFrom (src) {
  const ext = path.extname(src).toLowerCase()
  if (ext !== '.html' && ext !== '.htm') return null
  const html = fs.readFileSync(src, 'utf8')
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
            html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
  if (!m) return null
  const t = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return t || null
}

// ---------- auth ----------

function readToken () {
  const root = path.join(os.homedir(), '.mcp-auth')
  const hash = crypto.createHash('md5').update(SERVER).digest('hex')
  if (!fs.existsSync(root)) die(noAuth())
  const dirs = fs.readdirSync(root)
    .filter(d => d.startsWith('mcp-remote-'))
    .map(d => path.join(root, d))
    .sort()
    .reverse()
  for (const d of dirs) {
    const f = path.join(d, `${hash}_tokens.json`)
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'))
      if (j.access_token) return j.access_token
    }
  }
  die(noAuth())
}

function noAuth () {
  return `no saved login for ${SERVER}.\nRun once:  npx -y mcp-remote ${SERVER}\nApprove in the browser, then Ctrl+C and retry.`
}

// ---------- call ----------

async function call (token, name, args) {
  const res = await fetch(SERVER, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  })
  const text = await res.text()
  if (res.status === 401) die(`portal rejected the token (401).\n${noAuth()}`)
  if (!res.ok) die(`portal returned ${res.status}\n${text.slice(0, 400)}`)
  const line = text.trim().split('\n').map(l => l.replace(/^data: /, '')).filter(Boolean).pop()
  let j
  try { j = JSON.parse(line) } catch { die(`unreadable reply:\n${text.slice(0, 400)}`) }
  if (j.error) die(`portal error: ${JSON.stringify(j.error)}`)
  const content = j.result && j.result.content && j.result.content[0]
  const raw = content && content.text ? content.text : JSON.stringify(j.result)
  if (j.result && j.result.isError) die(`tool failed: ${raw}`)
  try { return JSON.parse(raw) } catch { return { raw } }
}

function die (msg) {
  console.error(msg)
  process.exit(1)
}

// ---------- main ----------

async function main () {
  const a = parseArgs(process.argv.slice(2))
  if (!a.src) die('usage: node publish.js <file|dir|zip> [--name "..."] [--slug s] [--access mode] [--viewer a@b.com] [--page-id ID]')
  if (!fs.existsSync(a.src)) die(`no such path: ${a.src}`)

  const { buf, entries } = buildArchive(a.src)
  if (entries && entries.length > MAX_ENTRIES) die(`${entries.length} files is more than this publishes at once (${MAX_ENTRIES})`)
  if (buf.length > MAX_BYTES) die(`archive is ${(buf.length / 1048576).toFixed(1)}MB, over the ${MAX_BYTES / 1048576}MB cap`)

  console.error(`zip: ${(buf.length / 1024).toFixed(0)}KB from ${entries ? entries.length + ' file(s)' : 'existing archive'}`)

  if (a.out) {
    fs.writeFileSync(a.out, buf)
    console.log(JSON.stringify({ wrote: path.resolve(a.out), bytes: buf.length }, null, 2))
    return
  }

  const b64 = buf.toString('base64')

  if (a.dryRun) {
    console.log(JSON.stringify({ dry_run: true, zip_bytes: buf.length, base64_bytes: b64.length, entries: entries && entries.map(e => e.name) }, null, 2))
    return
  }

  const token = readToken()
  let out
  if (a.pageId) {
    out = await call(token, 'pages_reupload_from_zip', { page_id: a.pageId, zip_base64: b64 })
  } else {
    const args = { zip_base64: b64, access_mode: a.access, notify_viewers: false }
    const name = a.name || titleFrom(a.src)
    if (name) args.name = name
    if (a.slug) args.slug = a.slug
    if (a.viewers.length) args.viewers = a.viewers
    out = await call(token, 'pages_create_from_zip', args)
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => die(e && e.stack ? e.stack : String(e)))
