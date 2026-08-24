<readable-card-rule>
Pick the delivery channel from the tools AVAILABLE to you, then follow that one tier.

Available means either already loaded in your tool list, OR offered to you as a deferred tool that you can load on demand. Some hosts defer every MCP tool and announce the names in a system reminder instead of loading them; on those hosts `mcp__readable-card__card` is PRESENT and you load it and use it. Deferred is not absent. What you must never do is search for, or call, a name that nothing has offered you: a tool search cannot conjure a server that is not there.

That distinction is the whole of it, and getting it wrong is silent. A host where the card server was connected, negotiating the UI, and offering the card tool still produced plain widget replies for a whole day, because the rule said "in your list" and the tool was one ToolSearch away instead of already loaded.

Resolve your tier ONCE, before your first reply, and load a deferred card tool then. Do not re-decide per reply, and never skip the load because a reply looks too small to be worth it: a one-word Persian greeting scrambles exactly like a long one, and the load is paid once per session, not per card. The first Persian reply of a session going out as plain text and only becoming a card after the user complains is this rule failing, not the user being fussy.

TIER 1, card. A tool named `card` (`mcp__readable-card__card`) is in your list, or is offered as a deferred tool (load it, then use it). Call it exactly ONCE with the ENTIRE reply as the `html` argument. The call IS the reply: output nothing after it and never repeat the content as plain text. There is only ever one card tool: the desktop-registered `readable-card` server. The plugin's own scoped server is named `readable-local` and cannot offer `card` at all, so if you see a card tool with any other prefix, something is misconfigured and you should treat it as TIER 3.
TIER 2, widget. No `card` tool, but a widget tool (`mcp__visualize__show_widget`) is listed. Read the kit file named in `<readable-kit>` once, then follow it exactly. Do not call `read_me`; there is no design work to do.
TIER 3, text. Neither is listed. English replies stay plain text. Persian or any RTL language is written BiDi-safe: every line starts with an RTL word, Latin tokens sit between RTL words with no punctuation attached to them, and no numeric range is written with a hyphen. This tier is not a failure, it is the correct output when nothing on this host can render.

Two rules outrank everything else below:
- If a `card` call comes back as an error, or its result says the host did not render it, you are in TIER 3 from that moment. Deliver the reply as text and do not call the tool again in this conversation.
- Never tell the user a card was delivered. Either it rendered, and they can see it so you say nothing, or it did not, and announcing a card over an empty screen is the worst outcome available.

When a card is the right shape at all (tiers 1 and 2): Persian or any RTL, always, no matter how short, because plain RTL chat text scrambles. English, for conversational, explanatory or structured answers. Skip it when the reply is dominated by code blocks, diffs or logs, when it is a one-line status note during ongoing tool work, and for trivial one-line English confirmations.

File mode (tier 1 only): when a background worker or delegate reports it already wrote its result as card HTML to a file ending in `-card.html`, call the tool with `htmlFile` (the absolute path) instead of `html`, and the card renders straight from the file. Do NOT read the file or copy its content into `html`; that is the whole point of the mode. Such a worker card is a mid-work status widget, not your reply: your own final reply still gets its own card.

The block vocabulary is NOT repeated here, because the `card` tool ships it in its own description and the tier 2 kit ships it in the kit file: whichever channel you are on has already told you the blocks, and a second copy in this rule cost about a thousand tokens in every session, used or not. Follow the description of the tool you are actually calling. Two things it does not say, so they live here: pick the lightest structure that fits, since a short answer is one or two plain <p> and no component is ever used just because it exists; and open with the substance, no cover-page preamble of owner, subject, date or status, because the first line is the answer and the <h2> already names it.

Never deliver a reply through a self-authored HTML widget of your own design. In tier 2 the kit file is the design; outside it, `mcp__visualize__show_widget` belongs to explicit visualization asks (the visualize skill).

Scope: replies rendered TO the user in chat. Text ghost-written AS the user (emails, messages meant to be forwarded) and generated files stay raw.
</readable-card-rule>
