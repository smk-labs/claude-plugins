# readable

Easy-to-read outputs from Claude: four small tools, one goal.

## 1. RTL cards (automatic)

Chat clients lay plain text out left-to-right, so mixed Persian/English replies scramble: trailing periods jump to the head of the line, Latin tokens reorder, numbers flip. One fix patches the app itself ([claude-rtl](https://github.com/smk-labs/claude-rtl)); this one fixes Claude's replies with no app changes.

A `SessionStart` hook injects one short rule: reply in Persian as a single self-contained widget card. The model writes its answer as HTML plus a fixed `<style>` kit (Vazirmatn font, per-block direction resolution via `unicode-bidi: plaintext`, LTR-isolated code and paths, accent headings, framed tables, callouts, check/cross status lists). The kit is constant CSS the model copies verbatim, never invents, so polish is nearly free: styling is defined once and the model only spends class names (`ok`, `tip`, `note`, `warn`).

Since 3.2.0 the kit is pay-per-use. Every card carries a small BASE block (~2.5 KB: card frame, headings, text, lists, callouts, code). Components (table, badge, kv, kpi, bars, donut, flow, timeline, cta) each have their own snippet the model appends only when the reply actually uses them. A prose answer costs about a quarter of the old fixed kit; a full dashboard still costs less than the old kit did.

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

- Protocol-tested: `node plugins/readable/mcp/test.js` runs a 16-check JSON-RPC exchange, including capability negotiation (`io.modelcontextprotocol/ui`), template mime `text/html;profile=mcp-app`, `_meta.ui.resourceUri` linkage, and the no-UI-host fallback (tool answer tells the model to fall back to the rule skeleton).
- Template-tested: the bridge (`ui/initialize` → `ui/notifications/tool-input` → `ui/notifications/size-changed`) renders the card correctly in a sandboxed iframe; CTA buttons map `sendPrompt()` onto `ui/message`.
- Registered project-scope in this repo's `.mcp.json`. Global opt-in: `claude mcp add --scope user readable-card -- node <path>/plugins/readable/mcp/server.js`.
- Not wired into the plugin manifest yet: whether a given host renders MCP Apps from local servers must be verified per client first. Until then the hook rule (section 1) stays the delivery path.

## 4. report (skill, explicit export only)

Turns a chat card (or fresh content) into a standalone HTML report file in the exact same template, without the model ever writing CSS: the model writes content-only HTML, and [skills/report/build.py](skills/report/build.py) injects the kit from `assets/rc.css` into a page shell (light/dark toggle, print styles for PDF). Persian is RTL with Vazirmatn; `--lang en` gives the same design fully LTR with Inter (arrows and alignment auto-flip).

Triggers ONLY on an explicit ask ("همین کارت رو ذخیره کن", "save this card as a report") or `/readable:report`. Generic "write a report" requests never trigger it, by design.

## Install

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install readable@smk
```

Restart the session after installing (the rule loads at session start).

## Requirements and scope

- A client that runs Claude Code plugins and has the `mcp__visualize__show_widget` tool (Claude Desktop / Cowork). Without that tool, the rule falls back to BiDi-safe plain text.
- No dependencies of any kind: the only hook is a `cat` of the rule at session start. No Python, no Node, no network.
- readable styles Claude's replies. It does not change how the app renders the text you type; that is what [claude-rtl](https://github.com/smk-labs/claude-rtl) fixes at the app level.
