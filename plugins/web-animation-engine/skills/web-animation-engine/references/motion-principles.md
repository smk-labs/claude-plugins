# Motion Principles

Tech-agnostic theory for time-driven animation. Read this before composing motion. Synthesized from Emil Kowalski's animations.dev course (Vercel's `web-animation-design`), HyperFrames' motion-principles guidance, and impeccable@animate.

---

## Easing is emotion

The transition is the verb. The easing is the adverb.

- `easeOutExpo` → confident, decisive
- `easeOutQuint` → snappy, modern
- `easeOutCubic` → smooth, professional
- `easeInOutSine` → dreamy, ambient
- `easeOutBack` → playful, springy (overshoots)
- `easeOutElastic` → cartoonish, kinetic (overshoots a lot — use sparingly)

**Don't use the same ease on every tween.** A scene with five identical eases reads as flat. Vary by purpose: entries punchy, holds calm, exits decisive.

### When to use which

| Situation | Ease |
|---|---|
| Element entering or exiting the frame | `easeOut*` family — the "jump then settle" feel |
| Element moving across the frame mid-scene | `easeInOut*` family — natural acceleration + deceleration |
| Subtle hover / color shift / breathing | `easeInOutSine` or default `ease` |
| Continuous motion (loops, marquees) | `linear` |
| Number counter climbing | `easeOutQuart` or `easeOutQuint` |
| Rare playful moment | `easeOutBack` (gentle) — avoid `easeOutElastic` unless the scene calls for it |

`easeIn*` alone is almost never right — it makes the motion feel sluggish at the start, delaying visual feedback.

### Cubic-bezier values (use directly when the project's named eases don't fit)

Sorted weak → strong. Same family ranked by intensity.

```
--ease-out-quad:    cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-out-cubic:   cubic-bezier(0.215, 0.61, 0.355, 1);
--ease-out-quart:   cubic-bezier(0.165, 0.84, 0.44, 1);
--ease-out-quint:   cubic-bezier(0.23, 1, 0.32, 1);
--ease-out-expo:    cubic-bezier(0.19, 1, 0.22, 1);
--ease-out-circ:    cubic-bezier(0.075, 0.82, 0.165, 1);

--ease-in-out-quad:  cubic-bezier(0.455, 0.03, 0.515, 0.955);
--ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1);
--ease-in-out-quart: cubic-bezier(0.77, 0, 0.175, 1);
--ease-in-out-expo:  cubic-bezier(1, 0, 0, 1);
```

Three "premium" curves worth memorizing for serious work — trustworthy, decisive, confident in that order: `(0.25, 1, 0.5, 1)`, `(0.22, 1, 0.36, 1)`, `(0.16, 1, 0.3, 1)`.

**Avoid bounce and elastic curves in serious or documentary contexts** — they call attention to the animation itself rather than the content. Use them only when the piece is explicitly playful.

---

## Speed is weight

Duration tells the viewer how heavy something is.

| Duration | Feel | Use for |
|---|---|---|
| 0.15–0.3 s | urgent, energetic | UI feedback, quick reveals |
| 0.3–0.5 s | professional, attentive | mid-scene transitions |
| 0.5–0.8 s | gravity, intent | hero entrances, big stat reveals |
| 0.8–2.0 s | cinematic | scene transitions, ambient drift |

**Cinematic scenes break the UI sub-300ms ceiling.** A 15-second explainer needs 0.6–1.5s entries to read; clamping to 250ms makes everything feel anxious. UI rules don't apply here.

**Exit ≈ 75% of entry duration.** The viewer's eye has already moved on; lingering on the way out feels laggy.

**Larger elements take longer.** A full-screen hero needs ~2× the duration of a 100px badge.

---

## Scene rhythm — build / breathe / resolve

Every beat (or full scene) has three phases:

- **Build (0–30%):** elements enter, attention focuses
- **Breathe (30–70%):** one ambient motion holds the frame; let the viewer read
- **Resolve (70–100%):** the punch, the exit, the transition

Skipping the breathe phase makes a scene feel rushed and unreadable. Without resolve, scenes feel limp.

The opposite mistake: stretching breathe to 90% of the scene. If nothing is happening for too long, the viewer disengages.

---

## Choreography hierarchy

The element that moves first is perceived as most important. **Stagger by importance, not DOM order.**

- Hero text leads. Supporting elements follow 0.1–0.3s later.
- Identical elements: stagger 0.05–0.15s between them. Faster than that, they read as one event; slower, they read as a delayed line.
- Don't enter everything from the same direction. If the hero comes from below, let supporting elements come from the sides or fade in place.
- **Offset the first beat 0.1–0.3s from t=0.** Animations that start at t=0 feel like glitches — like the page wasn't ready yet.

---

## Hero moment — the one signature beat

Every scene should have **one** signature animation. Not five. The hero beat is what the viewer remembers; everything else supports it.

When budget is scattered across many small effects, nothing reads as important and the whole scene feels noisy. When one beat is dramatic and the rest is quiet, the dramatic moment lands.

Ask yourself: *"If a viewer watches this once, which beat are they going to describe to a friend?"* That's the hero. Spend the budget there.

---

## Paired elements rule

Elements that animate together must use the same easing and duration.

- Modal + overlay → same ease, same duration
- Tooltip + arrow → same ease, same duration
- A node + its connecting edge entering together → same ease, same duration

Mismatched timings on visually-paired elements read as broken. Even a 50ms desync is visible.

---

## Frequency principle

Don't animate things users see 100+ times a day. Animation that's delightful at first viewing becomes friction at the hundredth.

Examples:
- A modal that opens 5×/day → animate
- A list-item that re-renders 200×/day → don't animate

For scene compositions this rarely applies (a 15-second explainer plays once or on demand), but if you embed a scene in a high-frequency surface (e.g. a dashboard widget that auto-replays), respect the principle.

---

## Performance — only animate transform and opacity

These two properties skip the layout and paint stages and run on the GPU. Anything else risks dropped frames.

- ✅ `transform: translate / scale / rotate`, `opacity`
- ✅ SVG attribute changes that don't trigger reflow (`r`, `cx`, `cy`, `stroke-dashoffset`)
- ❌ `width`, `height`, `top`, `left`, `padding`, `margin` — trigger layout, jank inevitable
- ❌ `box-shadow` animation, large `filter: blur(>20px)` — expensive, especially on Safari

When you need a "size change" effect, use `transform: scale()` instead of `width` / `height`.

---

## Accessibility

When the animation embeds in a real website, respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable all animations or set duration to ~0.01ms */
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

For React-driven animations like this engine: read `window.matchMedia('(prefers-reduced-motion: reduce)').matches` once at mount and either skip the playback loop entirely (just render the final state of each Sprite at `progress=1`) or shorten total duration to a token value.

For touch devices, gate hover-only animations:

```css
@media (hover: hover) and (pointer: fine) {
  .interactive:hover { /* hover effects */ }
}
```

Touch devices fire hover on tap, causing false positives.

---

## Quick "Don't" list

- Same ease everywhere
- Everything entering from the same direction
- Beats that start exactly at t=0
- Animation without a reason (decoration without communication)
- Bounce or elastic in serious explainers
- Animating layout properties (width, height, top, left)
- Forgetting `prefers-reduced-motion` when embedding in a site
- Skipping the breathe phase (the viewer needs time to read)
- Scattered effort — many small effects with no hero beat
