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

## The other two actions

- `connect` registers in every profile and clears any previous opt-out.
- `disconnect` removes the entry from every profile, deletes the stable copy, and leaves a marker so no future session puts it back. Use this when someone objects to the plugin writing their config; it is the honest answer to that objection, and it holds.

Both end with the same caveat, so pass it on: a running app keeps the server list it started with, so the user has to quit and reopen the app. Not a window, the app.

## Do not

Do not hand-edit `claude_desktop_config.json` to fix a card problem; this script is the only thing that should touch it. Do not point an entry into `~/.claude/plugins/cache/...`, because that path carries a version number and dies on the next update, which is the whole reason the stable path exists.
