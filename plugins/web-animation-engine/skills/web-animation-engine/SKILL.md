---
name: web-animation-engine
description: Build code-driven animated web sections, scenes, and explainers using a tiny bundled React + SVG runtime (Stage / Sprite / playhead). Use this skill whenever the user wants to *create* an animation from scratch — animated heroes, motion graphics, diagrammatic explainers, animated dashboards, scrubable scene compositions, or "bring this SVG to life" requests. Output is runnable HTML (CDN React + Babel, no npm) embeddable in any website or used standalone in presentations. Pairs with /frontend-design for visual polish; differs from UI-micro-interaction skills which polish *existing* UIs rather than compose new animated content.
license: MIT
---

# Web Animation Engine

A tiny bundled runtime for composing time-driven web animations: multi-scene explainers, animated heroes, motion graphics, diagrammatic videos. Code-only — no image editor, no MP4 export, just runnable HTML.

## When to use this skill

Use it when the user wants to **build** animated content:

- "animate this hero section"
- "make a motion graphic explaining X"
- "bring this SVG diagram to life"
- "animated explainer for our pitch deck"
- "scrubable timeline showing the data reveal"

Do NOT use it for:

- Polishing motion on an existing UI (button hovers, modal slide-ins, page-load staggers) → that's UI-micro-interaction territory; use `/frontend-design` for the visual layer or a UI animation skill if installed.
- Producing video files (MP4/GIF) → this engine outputs runnable HTML, not exports.
- Static design (typography, color, layout) → defer to `/frontend-design`.

## Two-step rule: script first, code second

Never start with code. Time-driven animation falls apart without a script. Always:

1. **Write the beats.** Three to six sentences describing what happens, in order, with rough seconds. *"0–3s: two distant nodes appear. 3–6s: a loop forms between them. 6–10s: the loop replicates across a network. 10–15s: punchline."* This is the entire script for a 15-second piece.
2. **Build the scenes.** One `<Sprite start={x} end={y}>` per beat. Inside each Sprite, compose SVG/HTML that reads the beat's progress and animates accordingly.

If the user gave you a vague request, draft the beats first and confirm with them before writing code. Skipping this step produces incoherent animations.

For deeper guidance on beat writing, rhythm, easing-as-emotion, and choreography, read [`references/motion-principles.md`](references/motion-principles.md). For pattern inspiration (diagrammatic-documentary, narrative montage, data reveal, hero loop, stat slam) read [`references/scene-patterns.md`](references/scene-patterns.md) — these are *thinking* patterns, not code templates. Stay creative; don't copy them shape-for-shape.

## The engine in 30 seconds

The bundled runtime in [`assets/animations.jsx`](assets/animations.jsx) gives you:

- **`<Stage width height duration background>`** — wraps everything, drives a `time` value (seconds) via `requestAnimationFrame`, provides a playback bar with scrub/play/pause.
- **`<Sprite start={x} end={y}>`** — only renders during that time window; gives children `localTime` and `progress` (0→1) via `useSprite()`.
- **`useTime()`** — read the global playhead anywhere in the tree.
- **`Easing`** — ~15 hand-rolled easing functions (easeOutCubic, easeInOutQuart, easeOutBack, etc.).
- **`interpolate(input, output, ease)`** — Popmotion-style keyframe interpolation.
- **`animate({ from, to, start, end, ease })`** — single-segment tween.
- **`TextSprite`, `ImageSprite`, `RectSprite`** — convenience components for common entries.

Full API reference: [`references/engine-api.md`](references/engine-api.md). Read it when you reach for a primitive.

## How to start a new animation

1. Copy `assets/animations.jsx` and `assets/starter.html` into the project (rename `starter.html` to whatever fits, e.g. `feedback-loop.html`).
2. Create `scenes.jsx` next to them. Define a top-level component (e.g. `VideoScene`) that returns a tree of `<Sprite>` blocks, one per beat.
3. Adjust the `<Stage>` props in the HTML (`width`, `height`, `duration`, `background`) to match your composition.
4. Open the HTML in a browser. The playback bar appears at the bottom; scrub through to verify each beat.

The runtime is React 18 + Babel standalone, both loaded from CDN. No npm, no build step. The whole thing is three files (HTML + animations.jsx + scenes.jsx).

## Mental model

- **SVG layer** for diagrammatic content (nodes, edges, paths, traveling pulses). Inline `<svg>` inside a `<Sprite>`, attributes driven by `useSprite().progress` or `useTime()`.
- **HTML layer** for text and images (captions, HUD, hero copy). Regular `<div>`s positioned absolutely; opacity/transform driven by progress.
- **One source of time.** `Stage` owns it. Everything else reads it. Don't add side-channel timers or animation loops — they desync.

## Anti-rules

- Don't reach for npm packages. The runtime is intentionally CDN-only; adding GSAP, Framer Motion, or anime.js fragments the time source and bloats the output.
- Don't replace the runtime. If it's missing something, extend it (add an easing, a primitive) — don't swap it.
- Don't put motion in `/frontend-design`'s lane. Typography, color palette, spatial composition belong there. This skill handles movement *over time*; the other handles look at any single frame.
- Don't skip the beats step. Even a 5-second hero animation has 2–3 beats. Naming them prevents incoherent transitions.

## When motion goes on a real website

If the animation will embed in a production site (not just a presentation), respect `prefers-reduced-motion` — the engine's principles reference covers the patterns. See [`references/motion-principles.md`](references/motion-principles.md#accessibility).

## How this skill composes with others

- `/frontend-design` → visual decisions (palette, typography, layout). Run it alongside this one when building animated UI from scratch — it picks the look, this skill makes it move.
- UI micro-interaction skills (e.g. `impeccable@animate`, `web-animation-design`) → polish on existing components. Different problem; can coexist.
- Design-thinking and UX skills → upstream of this. They decide *what* should be animated; this skill executes the *how*.
