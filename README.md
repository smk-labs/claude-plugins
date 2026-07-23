# SMK Claude Code Plugins

Everything I built for Claude Code, in one marketplace, organized by category.

## Install

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install <name>@smk
```

For example, to install the fig plugin:

```
/plugin install fig@smk
```

## Visual and Animation

| Plugin | What it does | Install command |
| --- | --- | --- |
| fig | Single-file looping animated SVG explainers, plus a to-gif converter command. | `/plugin install fig@smk` |
| web-animation-engine | Animated scenes and explainers: a skill plus a React/SVG runtime. | `/plugin install web-animation-engine@smk` |

## Thinking

| Plugin | What it does | Install command |
| --- | --- | --- |
| principles-first | First-principles and design-thinking checks for product and architecture decisions. | `/plugin install principles-first@smk` |

## Engineering Workflow

| Plugin | What it does | Install command |
| --- | --- | --- |
| dev-agents | A ten-agent dev squad (architect, frontend, backend, devops, tester, reviewer and more) plus a browser-test command. | `/plugin install dev-agents@smk` |
| multirepo-git | Branch and merge across multiple sub-repos with two commands: isolate and merge. | `/plugin install multirepo-git@smk` |
| spring-clean | Repo housekeeping (خونه تکونی): delete dead surfaces, gitignore build artifacts, split huge files, draw package boundaries, and leave architecture tests that keep it clean. | `/plugin install spring-clean@smk` |
| portal-skills | Platform engineering and security: GitLab CI/CD + Helm chart generation for Kubernetes (gitlab-helm-deploy), Prometheus-driven pod rightsizing and KEDA tuning (k8s-rightsize), a proactive secure-coding baseline (secure-coding), and a deep OWASP reference incl. LLM and agentic AI security (owasp-security). | `/plugin install portal-skills@smk` |

## Writing and Docs

| Plugin | What it does | Install command |
| --- | --- | --- |
| tldr | Bilingual English and Persian TL;DR summaries, written for product managers. | `/plugin install tldr@smk` |
| readable | Easy-to-read outputs: Persian/RTL replies as clean styled cards at near zero token cost, plus a visualize skill for light diagrams on demand. | `/plugin install readable@smk` |

## Content and Media

| Plugin | What it does | Install command |
| --- | --- | --- |
| getpix | Finds free licensed images from five sources (works with zero API keys), shows them right in the chat, or drops optimized WebP into your project with alt text and attribution. Includes photo-pass, a whole-site art-direction pass. | `/plugin install getpix@smk` |

## Task Management

| Plugin | What it does | Install command |
| --- | --- | --- |
| backlog-md | Backlog.md task management as a plugin: MCP server, hooks, and a docs-migration skill. | `/plugin install backlog-md@smk` |

## Packaged from Others

| Plugin | What it does | Install command |
| --- | --- | --- |
| gstack | Garry Tan's gstack dev workflow (53+ skills) packaged for Claude Code. Not our work: all credit to Garry Tan. | `/plugin install gstack@smk` |
| gstack-installer | Installs gstack natively from upstream: runs its real `./setup` build (browse binary, 60+ bin tools), always current. | `/plugin install gstack-installer@smk` |

gstack is Garry Tan's work. It is only packaged here as a Claude Code plugin. I claim no ownership of it. All credit and ongoing development belong upstream: https://github.com/garrytan/gstack

Two ways to get gstack, pick one: the `gstack` plugin is a self-contained snapshot that works out of the box; `gstack-installer` runs the upstream installer for the full native setup (compiled browse binary and bin tools) and always tracks the latest upstream version.

## Related CLI tools

- [claude-sync](https://github.com/smk-labs/claude-sync): see your Claude Code sessions across every account.
- [claude-rtl](https://github.com/smk-labs/claude-rtl): fixes right-to-left Persian text in Claude Desktop on macOS.
- [backlog-overview](https://github.com/smk-labs/backlog-overview): cross-project Backlog.md overview in pure bash.

## License

MIT for this repo's own content. See [LICENSE](LICENSE). The gstack content belongs to its original author, Garry Tan.
