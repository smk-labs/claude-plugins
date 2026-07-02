---
name: fig
description: Make a fig. A single looping animated SVG, one self-contained HTML file you can drop in an email or a slide. Use it when an idea moves (flows, loops, retries, queues, fan-outs). Faster than a paragraph, livelier than a static diagram. No player, no deck.
---

Some ideas are explained better by a 5-second looping animation than by 100 lines of text.

Sketch the figure in ASCII first: static layout, labelled motion, loop length. Get a yes before writing JSX.

After building, look at the rendered file as a stranger would and refine once before handing back. ASCII covers structure; visual issues (collisions, weak contrast, orphan elements, dated chrome, loose components that should be grouped) only appear on screen.

## Guidelines

- **Subject fit.** Invent a visual metaphor for this specific idea. The same concept can be drawn many ways (a flow as a path, ripples, falling sand, expanding rings; a network as nodes, a constellation, a colony of pulses). Reach past the obvious shape.
- **One accent.** One thing moves meaningfully, in one accent colour. Show direction through motion, not a second hue.
- **Loop cleanly.** End frame equals start frame, or fade-pause-fade. No jerk at the seam.
- **Caption economy.** One short title plus a 5-word caption at most. The figure carries it.
- **Calm by default.** 5 to 10 second loops, `easeInOutCubic` or `easeInOutSine`. Bounce and elastic read as toy.

Pick fonts, palette, background, canvas, and layout for the subject. Nothing below is a default.

## Stack

Single HTML, React 18 + Babel via CDN. No npm, no sidecars.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title></title>
<style>
  html, body { margin: 0; padding: 0; }
  /* Layout, sizing, fonts, palette: design for the subject. */
  @media (prefers-reduced-motion: reduce) { /* simplify motion */ }
</style>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
// Plumbing (copy as-is)
const Easing = {
  linear: (t) => t,
  easeOutCubic: (t) => --t * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeOutBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// interpolate([0, 0.5, 1], [0, 100, 50], ease) -> fn(t)
function interpolate(input, output, ease = Easing.linear) {
  return (t) => {
    if (t <= input[0]) return output[0];
    if (t >= input[input.length - 1]) return output[output.length - 1];
    for (let i = 0; i < input.length - 1; i++) {
      if (t >= input[i] && t <= input[i + 1]) {
        const span = input[i + 1] - input[i];
        const local = span === 0 ? 0 : (t - input[i]) / span;
        const easeFn = Array.isArray(ease) ? ease[i] || Easing.linear : ease;
        return output[i] + (output[i + 1] - output[i]) * easeFn(local);
      }
    }
    return output[output.length - 1];
  };
}

// animate({from, to, start, end, ease})(t): single-segment tween.
function animate({ from = 0, to = 1, start = 0, end = 1, ease = Easing.easeInOutCubic }) {
  return (t) => {
    if (t <= start) return from;
    if (t >= end) return to;
    return from + (to - from) * ease((t - start) / (end - start));
  };
}

// useTime(duration): seamlessly looping playhead in [0, duration) seconds.
function useTime(duration) {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf, t0 = performance.now();
    const tick = (now) => {
      setT(((now - t0) / 1000) % duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);
  return t;
}

// Figure: your design (SVG, HTML, or both). One time source.
function Scene() {
  const t = useTime(/* loop seconds */);
  return null; // compose freely
}

ReactDOM.createRoot(document.getElementById('root')).render(<Scene />);
</script>
</body>
</html>
```

## GIF (only if the user asks)

A fig is HTML. If the user wants a GIF (for email clients that strip JS, slack previews, slide screenshots), use the bundled converter:

`bash scripts/html2gif.sh <file.html> <loop_seconds>`

It needs Playwright and ffmpeg installed locally. If either is missing, the script will tell the user how to install it. Do not install dependencies yourself, just relay what the script reports. The `loop_seconds` argument must match the figure's actual loop, otherwise the GIF jumps at the seam.

## Never

No play/pause, no scrub, no multi-scene. Those belong to `web-animation-engine`. The recipient opens the file and the idea plays itself.
