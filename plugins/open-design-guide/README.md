# open-design-guide

Claude gets 151 real design systems, 71 design and frontend skills, and 114 rendering templates. Say "rebuild this page in the Vercel system" or "make me a deck in Swiss International style" and it reads the actual brand contract and the actual tokens instead of inventing hex codes.

This plugin is the guide, not the library. It installs the library once, then teaches Claude how to navigate it.

## What the library holds

**151 design systems** at `design-systems/<name>/`. Real ones: Apple, Vercel, Linear, Stripe, Notion, GitHub, Raycast, Superhuman, Airbnb, Binance, BMW. Style families too: brutalism, claymorphism, bento, editorial, mono. Each folder carries `DESIGN.md` (the brand contract, several thousand words on why the system looks the way it does), `tokens.css`, `design-tokens.json`, `tailwind-v4.css`, `components.html`, and `USAGE.md`. The contract is translated into 16 languages, which helps when the UI copy is not English.

**71 skills** at `skills/<name>/SKILL.md`. Taste and anti-slop passes, the full GSAP animation set, image-to-code, whole-site redesigns, brand extraction from a live URL, structured design briefs.

**114 rendering templates** at `design-templates/<name>/SKILL.md`. Decks, editorial documents, video frames, device mockups, social cards.

## What you do not need

Open Design ships as a 301 MB desktop app whose `od` binary starts a daemon on port 7456. That daemon exists to serve the app's own web UI and to spawn agent processes. It serves none of the content above.

The content is plain markdown, CSS, and JSON in an Apache-2.0 repo. So this plugin skips the app entirely.

- No desktop app.
- No `od` binary. On macOS and Linux `od` is already the system octal-dump command, so the name collides anyway.
- No daemon and no open port.
- No Node, no pnpm, no build step.
- No API key and no account.

## Requirements

| Need | Why | Check |
| --- | --- | --- |
| `git` 2.25 or newer | Sparse checkout and partial clone. Older git fetches all 308 MB. | `git --version` |
| `python3` | Builds the catalogue index. Nothing else uses it. | `python3 --version` |
| `bash` | Runs the install script. Git Bash is fine on Windows. | already have it if git works |
| About 124 MB free | 84 MB of content plus 40 MB of git objects. | |
| Network to `github.com` | First install and each update. | |

No Python packages. No npm packages. Standard library only.

## Install

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install open-design-guide@smk
```

Then fetch the library once:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/install.sh"
```

Pass a path to choose where it lands. Otherwise it goes to `$OPEN_DESIGN_HOME`, or `~/open-design-library` if that is unset.

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/install.sh" ~/Projects/references/open-design
```

The script clones only the four content directories, generates `CATALOGUE.md` at the library root, and writes the resolved path to `~/.claude/open-design-guide.local.md`. That last file is how the skill finds the library on any machine, so the library can live wherever you want.

Nothing is written outside the library directory and that one config file.

## Use

Just describe the work. The skill triggers on design language on its own.

```
rebuild the pricing page in the Linear system
give me a quarterly review deck in Swiss International
what design systems do you have for fintech?
run the taste pass on this landing page
```

To force it: `/open-design-guide`.

## Update

Rerun the same script. It pulls into the existing clone and rebuilds the catalogue.

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/install.sh"
```

## Uninstall

Delete the library directory and `~/.claude/open-design-guide.local.md`, then remove the plugin. Nothing else is left behind.

## One honest note

Upstream advertises 139 skills. Around 91 of the folders under `skills/` are catalogue stubs: a few lines of frontmatter and a link to somebody else's repo, with no instructions of their own. `CATALOGUE.md` leaves them out, so Claude is never sent to read an empty file. The 71 that remain are real, and some are very long.

The design systems have no such problem. All 151 are complete.

## License

This plugin is MIT. The library it downloads is [Open Design](https://github.com/nexu-io/open-design), Apache-2.0, and belongs to its authors. Some bundled skills carry their own upstream licenses. Nothing here redistributes their content: the install script pulls it from source at install time.
