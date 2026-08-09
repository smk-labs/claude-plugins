# claude-plugins

The marketplace repo for my plugins. One plugin per folder under `plugins/`, listed once in `.claude-plugin/marketplace.json`.

## One source, always the remote

Every machine and every Claude surface installs these plugins from the remote marketplace, `https://github.com/smk-labs/claude-plugins.git`. A second copy anywhere means two versions, and the stale one wins half the time.

So never leave any of these behind:

- a skill copied into `~/.claude/skills/<name>/` or a command into `~/.claude/commands/<name>.md` when a plugin here already ships it
- a marketplace registered with `source: directory` pointing at this checkout
- `claude plugin install` from a local path
- a dev override in the Claude desktop config (for readable, an `mcpServers.readable-card` entry whose path points into this checkout instead of `~/.claude/plugins/data/readable/server/server.js`)

## Test from the checkout, then clean up

Run a plugin's own tests in place, for example `node readable/server/test.js`. For a visual check, render a scratch HTML file somewhere outside the repo and open it. If a check needed a local install or a dev override, delete it in the same session that created it. Nothing test-related stays on the machine, and nothing test-related gets committed.

## Shipping is a push

1. Bump the version in `plugins/<name>/.claude-plugin/plugin.json`.
2. Bump the same version in `.claude-plugin/marketplace.json`. The two must match; a stale listing is why an update silently never arrives.
3. Commit and push to `origin/main`.

Consumers then pick it up on their own: the CLI on `claude plugin update <name>@smk`, the desktop app on its next marketplace refresh. Never hand-copy a build to a machine to make it arrive sooner.

## Before you commit

The repo is often open in more than one session. Run `git status` first, and if files you did not touch are already modified, commit only your own paths and leave the rest. Never sweep another session's work in progress into your commit or push it.
