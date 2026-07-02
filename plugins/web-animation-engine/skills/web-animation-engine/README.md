# web-animation-engine

> Animated explainers as code: `Stage`, `Sprite`, playhead. Claude-skill ready.

A Claude skill and ~700-line React + SVG runtime for composing animated web scenes, explainers, and motion graphics. CDN-only, no npm, no build step.

## What's in here

```
SKILL.md                          The skill (loaded into Claude's context on trigger)
references/
  motion-principles.md            Tech-agnostic motion theory: easing as emotion, rhythm, performance, a11y
  engine-api.md                   Stage / Sprite / hooks / Easing / interpolate / animate
  scene-patterns.md               Five thinking patterns (no code templates)
assets/
  animations.jsx                  The runtime — drop into your project unmodified
  starter.html                    Minimal CDN React + Babel wrapper
```

## Install

### Claude Code

```bash
git clone https://github.com/SMKeramati/web-animation-engine.git \
  ${CLAUDE_PLUGIN_ROOT}/skills/web-animation-engine
```

The skill auto-loads on next session.

### Claude.ai customize

Download a release zip (or `git archive HEAD --format=zip --prefix=web-animation-engine/ -o web-animation-engine.zip`), then:

> Settings → Customize → Skills → "+" → upload the `.zip`

Requires Pro/Max/Team/Enterprise with code execution enabled.

### Cowork desktop

Same zip; upload via Customize → Skills.

## How it works

1. **Script first.** A 15-second piece is 3–6 sentences describing what happens, in order. Don't open an editor without one.
2. **One `<Stage>` at the root.** It owns the playhead (seconds) and provides the playback bar.
3. **One `<Sprite start={x} end={y}>` per beat.** Sprites only render in their window; their children read `progress` (0→1) via `useSprite()`.
4. **Two layers.** SVG for diagrams (nodes, edges, traveling pulses), HTML on top for text and images.
5. **No npm.** React 18 + Babel standalone load from CDN. Three files: HTML + animations.jsx + scenes.jsx.

## How it composes with other skills

- **`/frontend-design`** picks typography, color, layout. This skill handles motion. Run them together when building animated UI from scratch.
- **`pbakaus/impeccable@animate`** and similar UI-micro-interaction skills polish *existing* components (button hover, modal slide-in). Different problem; can coexist.

## Use cases

Animated heroes for marketing pages · diagrammatic explainers · pitch-deck motion graphics · animated dashboards · scrubable scene compositions · "bring this SVG to life."

Not for: video file export (the output is runnable HTML), or motion polish on existing UIs.

## License

MIT. See [LICENSE](LICENSE).
