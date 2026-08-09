---
name: open-design-guide
description: Use the Open Design content library: 151 design systems with real tokens (Apple, Vercel, Linear, Stripe, Notion, GitHub, Raycast, plus styles like brutalism and claymorphism), 71 design and frontend skills, and 114 rendering templates for decks, documents, video frames, and social cards. Use when building or restyling any UI, picking a visual direction, needing real design tokens instead of invented ones, matching a known brand's look, animating with GSAP, or producing a deck, report, poster, or social card. Also use when the user says "open design", "od", "design system", "brand contract", or "DESIGN.md", or names one of the bundled systems.
---

# Open Design guide

This skill does not contain the library. It knows how to find it and how to use it well.

The library is a local, offline clone of the content half of [Open Design](https://github.com/nexu-io/open-design). Plain files. No `od` binary, no daemon on port 7456, no desktop app.

## Step 1: locate the library

Read `~/.claude/open-design-guide.local.md`. Its `library:` field is the absolute path to the clone.

If that file does not exist, the library is not installed. Stop and tell the user to run:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/install.sh"
```

Do not guess a path and do not fall back to the network. One clone, one recorded location.

## Step 2: find the right entry

Read `CATALOGUE.md` at the library root. That is the index: every design system grouped by category with its real tagline, every skill, every template.

Never guess a folder name. Names are not obvious (`linear-app`, not `linear`).

## Step 3: read the entry, then work

**Design systems** live at `design-systems/<name>/`.

Read `DESIGN.md` first. It is the brand contract and it governs every other file in the folder: the atmosphere, the typographic logic, the reason a color exists. Skipping it and grabbing `tokens.css` alone produces output that has the right hex codes and the wrong soul.

Then take real values from `tokens.css` or `design-tokens.json`, and copy component markup from `components.html`. Once a system is in play, invent nothing: no new colors, no new spacing steps, no new type scale.

`USAGE.md` covers how the authors intend the tokens to be applied. `DESIGN-<lang>.md` files are translations of the same contract, useful when writing UI copy in that language.

**Skills** live at `skills/<name>/SKILL.md`. Self-contained instructions for one job: taste and anti-slop passes, GSAP animation, image-to-code, redesigns, brand extraction, design briefs. Read the whole file before acting on any part of it. Some are long on purpose.

**Design templates** live at `design-templates/<name>/SKILL.md`. Rendering shapes: decks, editorial documents, video frames, device mockups, social cards.

## Rules

- One design system per artifact. Mixing two produces mush.
- The clone is read-only reference material. Never edit it, never commit into it. Copy what you need into the project being built.
- Ship no attribution to Open Design in the output. It is Apache-2.0 source material, not a credit line.
- Around 91 folders under `skills/` are stubs: frontmatter plus a link to an upstream repo, no instructions of their own. `CATALOGUE.md` leaves them out on purpose. If the user names one, open its `SKILL.md` for the upstream URL and say the real bundle has to be fetched separately.

## Updating

Rerunning the install script pulls the latest content and rebuilds `CATALOGUE.md`.

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/install.sh"
```
