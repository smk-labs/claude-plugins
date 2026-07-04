---
name: photo-pass
description: Run a conservative, end-to-end art-direction photo pass over a whole website: audit where photos genuinely earn their place, define one visual language, source free images, melt them into the design, verify in both themes, and record credits. Use when the user asks for a "photo pass", wants photography/warmth/imagery added across a site or landing page ("add photos to the site", "make it feel warmer with real photos"), or Persian requests like "به سایت عکس بده" / "پاس عکس بزن". For a single one-off image, use the getpix skill instead.
---

# Photo Pass: add photography only where it earns its place

Run an art-direction photo pass on this project's website. Work end to end: audit, select, integrate, verify. Be conservative: the goal is warmth and depth, not decoration. All sourcing runs through the getpix script (see Tooling at the end).

## 1. Audit first (decide WHERE)

- Survey every page and section. Shortlist only spots where a photo genuinely adds meaning: portfolio/product cards, story or about sections, blog covers, and at most one ultra-subtle background texture (e.g. closing CTA bands).
- Target 3-6 placements total. When in doubt, leave it imageless.
- Write the placement list with a one-line rationale per spot BEFORE touching code.

## 2. One art direction (decide WHICH)

- Derive palette, mood, and light/dark behavior from the site's design tokens and styles first.
- Define a single visual language for ALL picks (e.g. warm natural light, organic subjects, muted tones). Every image must belong to the same family.
- Judge candidates by viewing the actual images (thumbnails), never metadata alone.
- Hard NOs: corporate stock clichés (handshakes, suits, whiteboards), "AI brain / circuit" art, oversaturated or palette-fighting shots, anything ethically questionable.

## 3. Sourcing rules

- Reputable free libraries only: Unsplash, Pexels, Pixabay. License must allow commercial use without required attribution; still record photographer + source link for every image in a CREDITS.md in the repo.
- Source width >= 2000px. Deliver optimized WebP sized to the slot (cards ~800px, content ~1200-1400px, full-bleed ~1600-1920px). Never upscale. Keep total added weight under ~1MB.
- If assets ship behind long-lived/immutable caching, every new or changed image gets a NEW filename.

## 4. Integration rules

- Photos must sit INSIDE the design, not on top of it: melt them into the background or card surface with gradient overlays/masks built ONLY from the site's existing color tokens, plus slight desaturation, so light and dark themes both stay correct automatically.
- Zero layout shift: explicit width/height on every img. loading="lazy" below the fold; eager + fetchpriority="high" above it; decoding="async". Meaningful alt text in the site's content language.
- RTL-safe if applicable: logical properties only (inset-inline-*, margin-inline), never left/right.
- No new dependencies. Match the codebase's existing conventions and lint rules.

## 5. Definition of done

- Production build passes and lint is clean.
- Screenshot every changed section in both themes, desktop and mobile; review the shots yourself and include them as proof.
- Credits recorded, dead/replaced assets deleted, changes committed with a clear message.
- If multi-agent delegation is available, hand mechanical work (downloads, CSS wiring, lint fixes) to cheaper agents, but keep the two sensitive decisions yourself: where each image goes, and which image wins.

## Tooling

Script: `${CLAUDE_PLUGIN_ROOT}/scripts/getpix.sh`

- Search per placement, keyed sources only (they match the no-required-attribution rule; skip Openverse/Wikimedia here unless you verify the per-image license): `search "query" -n 5 -o landscape -s pexels`, then repeat with `-s pixabay` / `-s unsplash` if needed.
- Judge by eye: `thumb N` prints a local path; Read it. Filter for the shared visual language, and drop any candidate under 2000px source width (dimensions are in the search output).
- Fetch the winner: `get N -d <assets dir> -w <slot width> --name <new-filename>`. The output line includes photographer, source link, and license: copy it into CREDITS.md.
- One search plus at most 3 thumbnails per placement. Reword once if results are off-family, then move on; a placement with no worthy image stays imageless.
