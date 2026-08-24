---
name: connect
description: Turn the Claude desktop card server on or off for every profile on this machine, or report where it currently stands. Use when the user asks to "connect readable", "turn cards on", "register the card server", "readable isn't rendering", "cards show raw HTML", "disconnect readable", "کارت‌ها رندر نمی‌شن", "ریدبل رو وصل کن", "ریدبل رو قطع کن", or invokes /readable:connect. Also use before diagnosing any missing-card complaint, because status answers it in one command.
---

# readable connect

Chat cards in the Claude desktop app come from an MCP server the app has to know about, and only a server listed in a desktop profile config renders MCP Apps widgets. A plugin cannot register itself there without writing into the user's config, and readable no longer does that on its own: through 5.x a session hook wrote the entry silently, knew a single profile path, and left a backup file behind each time, which is how one machine ended up with the entry in some profiles, stale paths in others, and secrets copied around inside hand-duplicated configs.

So registration is one explicit command, and it covers every profile at once.

## Run it

```bash
sh "$CLAUDE_PLUGIN_ROOT/hooks/connect.sh" status
```

`status` lists every Claude profile found on this machine and, for each, whether `readable-card` is registered and whether the path it names still exists. Read it out to the user before doing anything else: a missing card is almost always one of three states, and status names which.

- `connect` copies the server to a version-free stable path and registers it in every profile. An existing entry that points at a real file is left alone, because someone set that deliberately.
- `disconnect` removes the entry from every profile and deletes the copy.

Both end with the same caveat, so pass it on: a running app keeps the server list it started with, so the user must quit and reopen the app once. Not a window, the app.

## What to tell the user afterwards

After `connect`, cards work in desktop chat. They do not appear inside Claude Code sessions and that is correct, not a bug: those hosts negotiate no MCP Apps UI, so the card tool is not offered there at all, and the reply arrives as a widget or as BiDi-safe plain text instead. If a user reports raw HTML in a chat bubble, they are on a version older than 6.0.0; the fix is an update, not a reconnect.

## Do not

Do not hand-edit `claude_desktop_config.json` to fix a card problem. Do not point an entry into `~/.claude/plugins/cache/...`: that path carries a version number and dies on the next update, which is the whole reason the stable path exists.
