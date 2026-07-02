# Engine API

Reference for the runtime in [`../assets/animations.jsx`](../assets/animations.jsx). Read this when reaching for a primitive. Stays minimal on purpose — the source is the source of truth for edge cases.

---

## `<Stage>` — root container

Wraps the whole composition. Owns the playhead, scales to viewport, renders the playback bar.

```jsx
<Stage
  width={1080}
  height={1080}
  duration={15}            // seconds
  background="#0B0D10"
  fps={60}                 // not enforced; rAF runs at display rate
  loop={true}              // restart at end
  autoplay={true}
  persistKey="animstage"   // localStorage key for playhead position
>
  <YourScene />
</Stage>
```

What it provides via `TimelineContext`:
- `time` — current playhead in seconds
- `duration`
- `playing`
- `setTime(seconds)` and `setPlaying(bool)`

Keyboard shortcuts (built-in): Space = play/pause, ←/→ = seek 0.1s (Shift = 1s), 0/Home = restart.

---

## `<Sprite>` — time-windowed wrapper

Only renders during `[start, end]`. Provides children a sub-context with `localTime`, `progress`, `duration`, `visible`.

```jsx
<Sprite start={3} end={6} keepMounted={false}>
  {({ localTime, progress, duration }) => (
    <Thing x={progress * 100} />
  )}
</Sprite>

// or as a plain wrapper — children call useSprite() themselves
<Sprite start={3} end={6}>
  <MyComponent />
</Sprite>
```

`keepMounted` — keep children mounted before/after the window (rare; useful for components doing setup work or holding refs).

---

## Hooks

```jsx
const time = useTime();                   // seconds since stage start
const { time, duration, playing } = useTimeline();
const { localTime, progress, duration, visible } = useSprite();
```

`useTime()` works anywhere inside `<Stage>`. `useSprite()` works inside `<Sprite>`. Outside their providers they return the default zero state — safe but not useful.

---

## `Easing` — easing functions

All take `t ∈ [0,1]` and return eased `t`. Some overshoot.

| Name | Curve |
|---|---|
| `linear` | `t` |
| `easeInQuad` / `easeOutQuad` / `easeInOutQuad` | quadratic |
| `easeInCubic` / `easeOutCubic` / `easeInOutCubic` | cubic |
| `easeInQuart` / `easeOutQuart` / `easeInOutQuart` | quartic |
| `easeInExpo` / `easeOutExpo` / `easeInOutExpo` | exponential |
| `easeInSine` / `easeOutSine` / `easeInOutSine` | sinusoidal |
| `easeInBack` / `easeOutBack` / `easeInOutBack` | overshoots (gentle) |
| `easeOutElastic` | overshoots (heavy) |

For when to use which, see [`motion-principles.md`](motion-principles.md#easing-is-emotion).

If you need a curve not in the list, don't add a new dependency — extend the `Easing` object in `animations.jsx`.

---

## `interpolate(input, output, ease)`

Popmotion-style keyframe interpolation. Maps `t` across input keyframes to output values.

```js
const x = interpolate(
  [0, 0.5, 1],          // input keyframes (t values)
  [0, 100, 50],         // output values
  Easing.easeOutCubic   // single ease, or array per segment
)(progress);
```

Outside the input range, the value clamps to the first / last output. Pass an array for `ease` to give each segment its own curve.

---

## `animate({ from, to, start, end, ease })`

Single-segment tween. Returns a function of `t`. Returns `from` before `start`, `to` after `end`.

```js
const opacity = animate({
  from: 0,
  to: 1,
  start: 0,
  end: 0.6,
  ease: Easing.easeOutCubic
})(localTime);
```

Useful when you want a tween that's tied to *seconds*, not normalized progress. Pair with `useSprite().localTime`.

---

## `clamp(v, min, max)`

Standard clamp. Handy for guarding `progress` calculations.

---

## Convenience components

These cover common needs. For anything specific, write your own — they're not contracts.

### `<TextSprite>`

Fades + slides text in on entry, holds, fades out on exit. Built on the HTML layer.

Props: `text`, `x`, `y`, `size`, `color`, `font`, `weight`, `entryDur`, `exitDur`, `entryEase`, `exitEase`, `align` (`'left' | 'center' | 'right'`), `letterSpacing`.

### `<ImageSprite>`

Scales + fades in; optional Ken Burns drift during the hold phase.

Props: `src`, `x`, `y`, `width`, `height`, `entryDur`, `exitDur`, `kenBurns` (bool), `kenBurnsScale`, `radius`, `fit`, `placeholder` (`{label: string}` for striped placeholder).

### `<RectSprite>`

Simple rectangle entry/exit. Has a `render` prop for per-frame style overrides.

Props: `x`, `y`, `width`, `height`, `color`, `radius`, `entryDur`, `exitDur`, `render: (spriteCtx) => styleOverrides`.

---

## SVG primitives — write your own

The convenience components above are HTML. For SVG diagrams (nodes, edges, traveling pulses, paths), write your own components inside a `<Sprite>` and read `useSprite().progress` to drive attributes:

```jsx
function Node({ x, y, r = 28, charge = 0, appear = 0 }) {
  const a = clamp(appear, 0, 1);
  const c = clamp(charge, 0, 1);
  return (
    <g transform={`translate(${x}, ${y}) scale(${0.6 + 0.4 * a})`} opacity={a}>
      <circle r={r + 16 + c * 30} fill="#0af" opacity={c * 0.18} />
      <circle r={r} fill="#0B0D10" stroke="#fff" strokeWidth={1.5} />
    </g>
  );
}
```

The `Edge`, `LoopArcs`, `PulseDot`, `PulseOnQuad` components in the project's example `scenes.jsx` are good shapes to study but not part of the runtime — they're scene-specific composition.

---

## Composition pattern

```jsx
function VideoScene() {
  return (
    <>
      {/* SVG layer for diagrams */}
      <svg viewBox="0 0 1080 1080" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
        <Sprite start={0} end={3}><Scene1Diagram /></Sprite>
        <Sprite start={3} end={6}><Scene2Diagram /></Sprite>
      </svg>

      {/* HTML layer for text / captions */}
      <Sprite start={0} end={3}><Scene1Caption /></Sprite>
      <Sprite start={3} end={6}><Scene2Caption /></Sprite>
    </>
  );
}
```

Two layers, same time source. The SVG layer stays pointer-events-none so HTML stays interactive (rare in scenes, but cheap insurance).
