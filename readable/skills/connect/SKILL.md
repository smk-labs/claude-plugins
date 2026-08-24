---
name: connect
description: Report or change where the readable card server is registered across this machine's Claude desktop profiles. Use FIRST when the user says cards are not rendering, show raw HTML, or stopped working, because status answers that in one command. Also use when they ask to "connect readable", "turn cards on", "disconnect readable", "stop readable writing my config", "کارت‌ها رندر نمی‌شن", "ریدبل رو وصل کن", "ریدبل رو قطع کن", or invoke /readable:connect.
---

# readable connect

Registration is automatic: the first session after install copies the server to a version-free stable path and registers it in every Claude desktop profile on the machine, then says so once. So this skill is not a setup step. It is the diagnostic, the opt-out, and the fallback for the one case automation cannot reach.

## Start with status, always

```bash
sh "$CLAUDE_PLUGIN_ROOT/hooks/connect.sh" status
```

It lists every Claude profile found here and, for each, whether `readable-card` is registered and whether the path it names still resolves. Read the result out to the user before doing anything else. A missing-card complaint is almost always one of these, and status tells you which:

- **not registered anywhere** — no Claude Code session has run since install (desktop chat runs no hooks, so nothing had a chance to register). Run `connect`.
- **registered, path does not exist** — a stale hand-made entry pointing into a versioned cache dir. Run `connect`; it replaces that with the stable path.
- **registered and the path resolves** — registration is fine, so the problem is elsewhere. The app has not been restarted since the entry appeared, or the host simply cannot paint cards. Claude Code sessions are the second case and it is not a bug: those hosts negotiate no MCP Apps UI, so the card tool is not offered there at all and replies arrive as a widget or as BiDi-safe plain text instead.

If the user reports raw HTML in a chat bubble, they are on a version older than 6.0.0. The fix is an update, not a reconnect.

## When status says everything is fine and cards still do not appear

Then registration is not the problem and the host is. Read the handshake the server logged, which is the only place that records whether a given host can paint at all:

```bash
grep -a "client=" ~/Library/Logs/Claude/mcp-server-readable-card.log | tail -5
```

Each line ends in `mcp-apps=YES` or `mcp-apps=NO`. NO means that host negotiated no MCP Apps UI, so the card tool was never offered to it and the reply correctly arrived as a widget or as plain text. Do not treat that as a fault to fix.

The same client name reports both, which is the part that misleads people: on one machine this log holds 163 YES and 44 NO handshakes, all of them `claude-ai/0.1.0`. Desktop chat and a Code session inside the desktop app are different hosts wearing one name, and an app update can flip a surface from NO to YES. So a user saying "it never renders here" may simply be remembering a session from before an update. Check the timestamp of the newest handshake against the session they are complaining about before believing either of you.

## A running app can erase what you just wrote

The desktop app holds its own copy of the server list, loaded at launch, and rewrites `claude_desktop_config.json` from that copy whenever something makes it re-derive its state. Anything added to the file while the app was running is gone at that point. Two triggers are confirmed:

- a visit to the MCP settings pane
- a plugin install or update, including `claude plugin update` run from a terminal

Seen in the field, twice within six minutes. Registered at 03:47; the user opened the settings pane at 04:20 and the app rewrote the config at 04:26 with its own nine servers and no `readable-card`; re-registered at 04:29, then a `claude plugin update readable@smk` at 04:30 and the app rewrote it again at 04:31. Re-registered at 04:32 with nothing else touched, and it held. `status` named the state each time, and the file's own modification time named the culprit.

So the order matters, and registering must be the LAST thing done. Update the plugin first, leave the settings pane alone, register, then quit and reopen the app. Registering while the app is closed avoids all of it. If a user says "it worked and then stopped" or "it does not stick", check the config's modification time against the last time they were in Settings before assuming anything else. The session hook re-adds a missing entry on the next session, so the recovery is: open one Code session, then restart the app, in that order.

## Never put this server in a managed (3p) list

A managed (3p) deployment defines its local servers in `managedMcpServers`, and for most servers that is the right place. Not for this one. A managed entry becomes an admin-managed direct-pool connector; the app then drops the user-added definition of the same name, logging `Dropping MCP server "readable-card" — name or key collides with an admin-managed direct-pool connector`; and that connector negotiates no MCP Apps UI, so the card tool is correctly withheld. The result is a readable that connects, reports its export tools, and can never paint a card.

The user-added route in `claude_desktop_config.json` is the one that negotiates the UI. So this server belongs there and nowhere else. If a deployment config lists it, remove it from there and let the session hook keep the user-added entry.

## A profile that manages itself

A managed (3p) deployment takes its local servers from `managedMcpServers` in its own deployment config, which is the sanctioned route there, and a user-added entry in `claude_desktop_config.json` is both redundant and gated by an admin toggle called "Allow user-added MCP servers". For those profiles, put the server in the managed list and drop a `.readable-skip` file in the profile directory, optionally with a one-line reason. Every action then leaves that profile alone, and `status` reports it as skipped with the reason, so nobody has to rediscover why it looks unregistered.

## The other two actions

- `connect` registers in every profile and clears any previous opt-out.
- `disconnect` removes the entry from every profile, deletes the stable copy, and leaves a marker so no future session puts it back. Use this when someone objects to the plugin writing their config; it is the honest answer to that objection, and it holds.

Both end with the same caveat, so pass it on: a running app keeps the server list it started with, so the user has to quit and reopen the app. Not a window, the app.

## Do not

Do not hand-edit `claude_desktop_config.json` to fix a card problem; this script is the only thing that should touch it. Do not point an entry into `~/.claude/plugins/cache/...`, because that path carries a version number and dies on the next update, which is the whole reason the stable path exists.
