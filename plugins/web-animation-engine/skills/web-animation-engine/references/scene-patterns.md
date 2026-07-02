# Scene Patterns

Five patterns for how a scene composition might *feel*. Read them for inspiration, not as templates. **Don't copy any of them shape-for-shape.** They're starting frames for thinking; the actual composition should respond to the subject.

Every pattern below is described in three lines: the *feel*, the *typical beats*, and *primitives that fit*. Implementation is your call.

---

## 1. Diagrammatic-documentary

**Feel.** Like a science explainer or technical documentary. Sparse, technical, confident. Mono captions. Abstract shapes (nodes, edges, traveling pulses) carry the meaning. There's a HUD chyron in the corner with a figure number and timecode.

**Typical beats.** (a) two distant nodes appear, slight blink between them — the unspoken signal; (b) a loop forms, signal travels A→B→A; (c) the loop replicates across a network, the network charges; (d) the punchline — one quiet humming loop, headline overlaid.

**Primitives that fit.** Inline SVG `<g>` for nodes (concentric circles + halo), `stroke-dashoffset` animation for edges drawing in, traveling-pulse dots positioned along quadratic Béziers for curved arcs. HTML layer for HUD + caption text. Background: dot grid with a subtle drift, vignette mask.

The Feedback Loop demo in the user's project is a complete example of this pattern — study it but don't replicate it.

---

## 2. Narrative montage

**Feel.** Like a slow film opener. Sequential text-and-image beats, one after another, each holding for ~2–3 seconds. Ken Burns drift on every image — slow zoom, slight pan. Text fades in, holds, fades out. The viewer reads each beat fully before the next arrives.

**Typical beats.** A title card → an image with a single sentence overlay → a quote → another image with a counterpoint → a final image that lands the message. Five beats, ~3s each, total ~15s.

**Primitives that fit.** `<ImageSprite>` with `kenBurns` enabled. `<TextSprite>` for sentences. The HTML layer carries everything; SVG isn't needed unless there's a diagrammatic interlude. Use `easeOutCubic` for entries; let exits be `easeInQuad` so they read as "moving on."

---

## 3. Data reveal

**Feel.** Information builds in layers. Numbers count up. Bars draw in. A chart fills with data. The viewer sees the structure before the takeaway. Confident, analytical, slightly suspenseful.

**Typical beats.** (a) axes draw in, label appears; (b) bars/lines/dots populate, staggered by importance; (c) a "velocity index" (or whatever the headline metric is) eases up to its final value; (d) one data point gets singled out — an annotation, a glow, a callout — and the takeaway lands.

**Primitives that fit.** SVG `<rect>` heights driven by `interpolate()`, SVG `<line>` with `stroke-dasharray` for axis draw-in, a counter component reading `useTime()` directly to climb a number with `easeOutQuart`. Tabular numerals (`fontVariantNumeric: 'tabular-nums'`) prevent layout thrash on the counter.

---

## 4. Hero loop

**Feel.** A single ambient motion that loops cleanly. No beats, no story arc — it's a living illustration. Lives in a website's hero section, runs forever, shouldn't fight for attention. Hypnotic, calm.

**Typical beats.** There are no beats — there's one motion that has a clean loop point. The trick is making the end-state visually equal to the start-state. Examples: a node pulse cycling forever, a line drawing itself and erasing, a loop arc with a pulse traveling back and forth.

**Primitives that fit.** Single `<Sprite>` covering the whole duration, motion driven by `useTime()` modulo a period: `Math.sin(time * 0.7)` for breathing, `(time * 0.5) % 1` for a traveling dot. `Stage` with `loop={true}` and a duration that's an exact multiple of the motion's period — otherwise the loop point shows.

---

## 5. Stat slam

**Feel.** Big number. Big impact. Restraint everywhere else. The whole composition exists to land one fact. Bold, declarative, a little theatrical.

**Typical beats.** (a) the room is dark and quiet for ~0.5s — the viewer leans in; (b) the number SLAMS into place with a confident `easeOutExpo`, type huge; (c) a ripple, a shockwave, or a glow expands outward from it; (d) supporting copy fades in below; (e) hold on the final state until the duration ends.

**Primitives that fit.** Huge `<TextSprite>` for the number (using tabular numerals so it doesn't shift width if it's animated counting up). SVG concentric expanding circles for the ripple — opacity fading with the radius. Display font, tight letter-spacing, OKLCH-tinted accent color from `/frontend-design`'s palette.

---

## Picking a pattern (or not)

These five don't cover everything. Many compositions sit between two patterns, or use a different one entirely. Use these to *prime* your thinking, then make the composition the user actually needs.

If you find yourself writing code that looks exactly like one of these patterns, that's fine — but ask whether the subject deserves something more specific. The Feedback Loop wasn't generic "diagrammatic-documentary"; it was *that subject* expressed *that way*. Aim for the same level of fit.
