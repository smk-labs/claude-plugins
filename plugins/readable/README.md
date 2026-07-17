# readable

Easy-to-read outputs from Claude: four small tools, one goal.

## 1. RTL cards (automatic)

Chat clients lay plain text out left-to-right, so mixed Persian/English replies scramble: trailing periods jump to the head of the line, Latin tokens reorder, numbers flip. One fix patches the app itself ([claude-rtl](https://github.com/smk-labs/claude-rtl)); this one fixes Claude's replies with no app changes.

A `SessionStart` hook injects one short rule: reply in Persian as a single self-contained widget card. The model writes its answer as HTML plus a fixed `<style>` kit (Vazirmatn font, per-block direction resolution via `unicode-bidi: plaintext`, LTR-isolated code and paths, accent headings, framed tables, callouts, check/cross status lists). The kit is constant CSS the model copies verbatim, never invents, so polish is nearly free: styling is defined once and the model only spends class names (`ok`, `tip`, `note`, `warn`).

Since 4.0.0 the default delivery is the bundled MCP Apps card server (section 3): the `SessionStart` hook injects a ~2 KB dispatch rule instead of an 11 KB CSS kit, the model sends content-only HTML to the `card` tool, and styling lives once in the server template. Persian/RTL always; English conversational and structured answers by default too (code-heavy replies stay plain text; the extra cost of an English card is just HTML tags vs markdown, roughly 10-20% of content). The 3.2.0 self-contained widget path (pay-per-use inline kit) remains available as [hooks/rule-inline.md](hooks/rule-inline.md) for setups without the card tool: point `hooks/hooks.json` at it.

The inline kit itself is pay-per-use since 3.2.0. Every widget card carries a small BASE block (~2.5 KB: card frame, headings, text, lists, callouts, code). Components (table, badge, kv, kpi, bars, spark, donut, flow, timeline, cta) each have their own snippet the model appends only when the reply actually uses them. A prose answer costs about a quarter of the old fixed kit; a full dashboard still costs less than the old kit did.

The card is self-contained by default: components degrade to plain readable text if their CSS is missing, and nothing depends on the network except the font import, which falls back to system fonts. Note: a live probe (2026-07) showed the widget sandbox is an `https://*.claudemcpcontent.com` iframe that DOES run inline scripts and CAN load external stylesheets, fonts, and `fetch()`. Self-contained stays the default for offline safety, but that finding enables the hosted variant below. (`PreToolUse` hook rewrites of `widget_code` are still ignored by the renderer; only what the model itself emits counts.)

Everything adapts to light and dark mode through the host's CSS variables.

### Token cost

The style kit used to ship in full with every reply; now replies pay only for what they use.

- Old (<= 3.1.x): ~9.2 KB CSS ≈ 2,550 output tokens per card, every card.
- New BASE only (prose replies, the common case): ~2.5 KB ≈ 700 tokens.
- New worst case (all snippets): ~7.3 KB ≈ 2,000 tokens.
- Hosted variant (below): BASE + one `@import` line regardless of components used.

### Hosted kit (optional, after push)

[hooks/rule-hosted.md](hooks/rule-hosted.md) is a prepared variant where component CSS comes from one CDN line instead of inline snippets: `@import url('https://cdn.jsdelivr.net/gh/smk-labs/claude-plugins@main/plugins/readable/assets/rc.css')`. BASE stays inline as the offline floor. To activate: push so [assets/rc.css](assets/rc.css) is public, verify the jsDelivr URL resolves, then point `hooks/hooks.json` at `rule-hosted.md`. Cache note: `@main` refreshes within ~12 h; pin `@<tag>` for instant, immutable updates.

## 2. visualize (skill, on demand)

Ask "show me", "visualize this", "با شکل نشون بده" and Claude turns the answer into one light, theme-aware SVG: flows, timelines, hierarchies, comparisons. Explicit request only. Deliberately minimal: a few dozen elements, 2-3 colors, labels only.

## 3. card MCP server (experimental, opt-in)

The endgame for token cost: the model sends only content and never outputs CSS at all. [mcp/server.js](mcp/server.js) is a zero-dependency MCP Apps server (SEP-1865) with one tool, `card`: input is building-block HTML, and the host renders it inside a predeclared `ui://readable/card.html` template that carries the whole kit plus its own light/dark palette (host CSS variables do not reach inside the MCP Apps iframe).

- Protocol-tested: `node plugins/readable/mcp/test.js` runs a 73-check JSON-RPC exchange, including capability negotiation (`io.modelcontextprotocol/ui`), the `roots/list` save-dir handshake, template mime `text/html;profile=mcp-app`, `_meta.ui.resourceUri` linkage, and the no-UI-host fallback (tool answer tells the model to fall back and re-deliver as text/widget).
- Template-tested: the bridge (`ui/initialize` → `ui/notifications/tool-input` → `ui/notifications/size-changed`) renders the card correctly in a sandboxed iframe; CTA buttons map `sendPrompt()` onto `ui/message`.
- Production-verified (2026-07): Claude Desktop chat negotiates `mcp-apps=YES` for local servers and renders the card inline, light and dark.
- Since 4.5.0 the plugin does NOT register the server itself. Root cause (field-debugged 2026-07): only the desktop app's own MCP client (`claude_desktop_config.json`) negotiates MCP Apps; servers spawned by the Claude Code CLI (plugin `mcpServers`, project `.mcp.json`, user scope) connect as `client=claude-code, mcp-apps=NO`, so their cards render as raw tool rows inside the grouped-tools container. Worse, a duplicate registration exposes two same-named `card` tools and the model picks one at random, which surfaced as "the widget sometimes does not render". One registration, the right one: `claude_desktop_config.json` (global to every project's desktop session); with multiple profiles, [claude-sync](https://github.com/smk-labs/claude-sync) v2.2+ propagates that entry everywhere.
- File mode (4.6.0): `card` also accepts `htmlFile` — an absolute path to a pre-written `*-card.html` file — instead of `html`. Built for delegated/background workers (e.g. the cursor-delegate plugin): the worker authors its own report card on its own quota, and the main agent renders it with one ~50-token call. The HTML never enters the model's context in either direction: the args carry only the path, the result's `structuredContent` carries only the path (the desktop host echoes `structuredContent` back to the model verbatim — measured), and the template bridge pulls the actual content itself through the app-only `read_card_file` tool over host `tools/call`, the same channel the Email export uses. Guardrails: absolute path, `-card.html` suffix, 256 KB cap, same no-`<style>`/`<script>` rule.
- Card menu (4.1.0): every card carries a three-dot menu styled after the host's code-block popover, entirely template-side (zero output tokens per reply): Copy image (hand-rolled foreignObject-to-PNG with best-effort inlined fonts), Copy HTML / Markdown / plain text (programmatic DOM-to-Markdown converter), Download PNG, and Save HTML via the spec's `ui/download-file` with `<a download>` fallback.
- Code-block copy (4.11.0): hovering any `<pre>` code block shows a small copy button on its corner that copies that block's plain text, in chat cards and exported reports alike (one shared implementation in [assets/menu.js](assets/menu.js), living outside `#card` so no export path ever sees it). Paid for under the 30KB template ceiling by assembly-time var aliasing: the template copy of the kit shrinks `var(--text-accent)`-class tokens to `var(--ta)`-class aliases defined once on `.rc`; sources and the report/hosted sheets keep the long names.
- Host-first copy (4.11.1): inside the sandboxed MCP Apps iframe, page-level clipboard writes are silently swallowed while `execCommand('copy')` still returns true, so every Copy button showed a false "copied" check (field bug). All card copies now go through the app-only `copy_text` tool: the local server pipes the text into the OS clipboard helper (`pbcopy` / `clip` / `wl-copy`/`xclip`/`xsel`), the same channel saves already use. Browser clipboard stays as the fallback there and as the whole path in standalone reports, where it genuinely works.
- Downloads that land where you work (4.12.0): card downloads open the native macOS save panel (osascript `choose file name`) defaulting to the session's project root — the server asks the client for MCP `roots` and prefers the first one over `~/Downloads`; `READABLE_SAVE_DIR` skips the panel. The `save_card` RPC ACKs (`picking: dir`) before the dialog opens so the card UI never waits on the user. Exports are named after the card title (first `<h2>`, Persian preserved, spaces to dashes) instead of `readable-card.*`. Every menu RPC now carries a deadline: hosts that silently drop `tools/call` (no response at all — the field bug that made all five download buttons hang forever on a spinner) fall through to `ui/download-file`, then to `<a download>`. The email rich-copy dropped its `execCommand` fallback for the same honesty reason as 4.11.1.
- Small-model note (Haiku): tool descriptions alone do not reliably steer small models, and Desktop chat has no hooks. The fix there is one line in your Claude profile preferences (Settings → Profile): "For every Persian/RTL reply, and preferably for structured English replies, call the readable-card `card` tool with the entire reply as building-block HTML; the tool call is the whole reply."

## 4. report (skill, explicit export only)

Turns a chat card (or fresh content) into a standalone HTML report file in the exact same template, without the model ever writing CSS: the model writes content-only HTML, and [skills/report/build.py](skills/report/build.py) injects the kit from `assets/rc.css` into a page shell (light/dark toggle, print styles for PDF). Persian is RTL with Vazirmatn; `--lang en` gives the same design fully LTR with Inter (arrows and alignment auto-flip).

Triggers ONLY on an explicit ask ("همین کارت رو ذخیره کن", "save this card as a report") or `/readable:report`. Generic "write a report" requests never trigger it, by design.

## 5. brand (skill, per-project skin — 4.13.0)

`/readable:brand` gives a project its own look: it detects the identity from the repo (design tokens, tailwind config, DESIGN.md, logo SVGs) or interviews the user when none exists, then writes a committable `.readable/` dir at the project root — `brand.css` (palette variable overrides, light + dark, in the kit's own vocabulary), optional `brand.json` (wordmark, header caption, tone word, fonts) and `logo.svg`.

From then on, in that project: `/report` reskins automatically (palette, logo/wordmark header, brand fonts inlined into the standalone file), and chat cards reskin too. Cards work through three resolution paths, most-reliable first: an explicit `brand` param on the `card` call (the `SessionStart` hook announces the dir per project — required in ccd, which spawns the direct server with neither the project cwd nor `roots`), the client's MCP `roots`, or a bounded walk up from the server's cwd (plugin-spawned CLI servers inherit the project dir, so CLI cards brand with zero model involvement). The css travels through the app-only `read_brand` tool — same channel as `htmlFile` — so it never enters the model's context; a dangling or invalid brand silently degrades to the stock look.

Limits, honestly: already-rendered cards don't re-brand; hosted Claude Desktop (.mcpb) has no project concept and stays stock; card fonts only via Google Fonts (the ~30KB template can't embed font files — reports can and do).

## Install

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install readable@smk
```

Then register the card server once in `~/Library/Application Support/Claude/claude_desktop_config.json` (the only MCP client that renders MCP Apps widgets; point it at a stable checkout of this repo, since the marketplace cache path changes on every version):

```json
"readable-card": {
  "command": "node",
  "args": ["/absolute/path/to/claude-plugins/plugins/readable/mcp/server.js"]
}
```

Restart the session after installing (the rule loads at session start). Do NOT also add the server to plugin `mcpServers`, a project `.mcp.json`, or `claude mcp add`: those spawn a duplicate that cannot render widgets, and the model may pick it.

## Requirements and scope

- A client that runs Claude Code plugins and has the `mcp__visualize__show_widget` tool (Claude Desktop / Cowork). Without that tool, the rule falls back to BiDi-safe plain text.
- No dependencies of any kind: the only hook is a `cat` of the rule at session start. No Python, no Node, no network.
- readable styles Claude's replies. It does not change how the app renders the text you type; that is what [claude-rtl](https://github.com/smk-labs/claude-rtl) fixes at the app level.
