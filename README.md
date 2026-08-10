# SMK Claude Code Plugins

Everything I have built for Claude Code, in one marketplace. Most of it exists because I hit the same problem twice and got tired of solving it by hand.

Persian and RTL are first-class here, not an afterthought.

## Install

Most people use these in the **Claude desktop app**, not the terminal, so that comes first. Adding the marketplace and installing a plugin are two separate steps: the first one only registers the catalog, it installs nothing.

### 1. Add the marketplace, once

```
Customize → Plugins → Personal plugins → +  →  Add marketplace → Add from a repository
```

Paste this as the repository:

```
smk-labs/claude-plugins
```

### 2. Install the plugins you want

```
Customize → Plugins → Browse plugins → readable → Install
```

Repeat per plugin. When it asks for a scope: **User** for every project, **Project** to share with everyone on the repo, **Local** for this repo only.

Quicker, without leaving the chat: the **+** button next to the prompt box → **Plugins** → **Add plugin**.

### 3. Keep them current

The marketplace is called **`smk`**, not `claude-plugins`. You need that name here.

Third-party marketplaces do not auto-update by default, so nothing arrives on its own. Either update when you feel like it:

```
/plugin marketplace update smk
/reload-plugins
```

Or switch it on once and stop thinking about it:

```
/plugin → Marketplaces → smk → Enable auto-update
```

### Enable, disable, remove

```
+ → Plugins → Manage plugins
```

Removing the marketplace uninstalls every plugin that came from it.

### If you do live in the terminal

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install readable@smk
```

## The catalog

### Get work done somewhere else

| Plugin | What it does |
| --- | --- |
| **cursor-delegate** | Runs coding and writing tasks on your Cursor subscription's quota instead of Claude's. Claude plans and reviews, Cursor workers execute, one task or a parallel fleet. Long jobs run as short resumable legs, so a dropped connection costs one leg and never the work. Carries `copy-writing-fa` for Persian web copy, with `fa-lint` as the gate. |

### Keep a codebase honest

| Plugin | What it does |
| --- | --- |
| **spring-clean** | Deep-cleans a repo, then leaves guardrails so it stays clean. Deletes dead surfaces, moves dev docs out of the code tree, splits oversized files, draws package boundaries, and writes architecture tests that hold the line. |
| **portal-skills** | Platform engineering and security. GitLab CI/CD and Helm charts for Kubernetes, pod rightsizing from real Prometheus data, a secure-coding baseline that applies while you write, and a deep OWASP reference. |

### Make the output readable

| Plugin | What it does |
| --- | --- |
| **readable** | Replies as styled cards instead of raw chat text. Persian and RTL always render correctly, English by default. Export any card as a standalone HTML report, and give a project its own brand so every card matches it. |
| **decode** | A narrated tour of a codebase for people who do not read code. A two-minute story, a browsable file tree, one clean canvas per file, and pull requests translated into product language. Persian first. |
| **learnable** | Turns any subject into a course you actually finish. A placement quiz finds your real level, the plan aims at your gaps, and each lesson teaches itself one hard question at a time. |

### Show it, do not describe it

| Plugin | What it does |
| --- | --- |
| **fig** | Single-file looping animated SVGs for ideas that move: flows, loops, retries, queues, fan-outs. One HTML file you can drop in an email or a slide. Converts to GIF too. |
| **getpix** | Finds free licensed images from five sources with zero API keys, shows them in the chat, or drops optimized WebP into the project with alt text and attribution. Includes a whole-site art-direction pass. |
| **open-design-guide** | 151 real design systems with real tokens (Apple, Vercel, Linear, Stripe, plus styles like brutalism and claymorphism), 71 design and frontend skills, and 114 templates for decks, documents, video frames, and social cards. Installs the [Open Design](https://github.com/nexu-io/open-design) content library as a sparse clone, so there is no desktop app, no daemon, and no `od` binary. |

### Everyday

| Plugin | What it does |
| --- | --- |
| **daily-tools** | Persian-first helpers: swarm QA campaigns, copy-ready prompt writing, light multi-agent research, plain-language how-to guides, and a one-word resume command. |
| **principles-first** | First-principles and design-thinking checks for product and architecture calls. Built to run before scope is added, not after. |
| **backlog-md** | Backlog.md task management as a plugin: MCP server, hooks, and a skill that imports messy docs into a clean backlog. |

### Packaged from others

| Plugin | What it does |
| --- | --- |
| **gstack** | Garry Tan's [gstack](https://github.com/garrytan/gstack) dev workflow (53+ skills) packaged for Claude Code. Not my work: all credit and ongoing development belong upstream. |

## Related tools

These are CLI tools, not plugins. They live in the same org.

- [claude-deck](https://github.com/smk-labs/claude-deck): run many Claude accounts side by side on one machine, with a usage dashboard. Includes `claude-sync`, which gives every account and profile the same Claude Code session list.
- [claude-config](https://github.com/smk-labs/claude-config): my `~/.claude`, versioned. Clone it as `~/.claude` on a new machine.
- [backlog-overview](https://github.com/smk-labs/backlog-overview): what is in progress across every project, in pure bash.

## License

MIT for this repo's own content. See [LICENSE](LICENSE). The gstack content belongs to its original author, Garry Tan.
