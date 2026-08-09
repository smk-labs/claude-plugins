---
name: fig
description: Make a fig. A single looping animated SVG, one self-contained HTML file you can drop in an email or a slide. Use it when an idea moves (flows, loops, retries, queues, fan-outs). Faster than a paragraph, livelier than a static diagram. No player, no deck.
---

Some ideas are explained better by a 5-second looping animation than by 100 lines of text.

Sketch the figure in ASCII first: static layout, labelled motion, loop length. Get a yes before writing the svg.

After building, look at the rendered file as a stranger would and refine once before handing back. ASCII covers structure; visual issues (collisions, weak contrast, orphan elements, dated chrome, loose components that should be grouped) only appear on screen.

## Guidelines

- **Subject fit.** Invent a visual metaphor for this specific idea. The same concept can be drawn many ways (a flow as a path, ripples, falling sand, expanding rings; a network as nodes, a constellation, a colony of pulses). Reach past the obvious shape.
- **One accent.** One thing moves meaningfully, in one accent colour. Show direction through motion, not a second hue.
- **Loop cleanly.** End frame equals start frame, or fade-pause-fade. No jerk at the seam.
- **Caption economy.** One short title plus a 5-word caption at most. The figure carries it.
- **Calm by default.** 5 to 10 second loops, `easeInOutCubic` or `easeInOutSine`. Bounce and elastic read as toy.

Pick fonts, palette, background, canvas, and layout for the subject. Nothing below is a default.

## Stack

One HTML file, one inline `<svg>`, motion in CSS. No JavaScript, no CDN, no build step.

That is not taste, it is the delivery format. A fig is made to be embedded: as an `<img>` in a report, as an attachment in an email, as a paste in a slide. Every one of those lifts the `<svg>` out and renders it as its own document. In that document **no script ever runs and nothing is fetched**. A figure animated from JavaScript freezes on its first frame there, or shows nothing at all. CSS `@keyframes` and SMIL are the only motion that survives the trip.

Five rules that document imposes. Break one and the figure dies quietly, looking fine on your screen:

1. **Everything lives inside `<svg>`.** The `<style>`, the gradients, the filters. Only the svg element travels; whatever sits in `<head>` is left behind.
2. **`xmlns="http://www.w3.org/2000/svg"` on the svg.** An HTML parser forgives a missing namespace. An `<img>` renders nothing without it.
3. **Strict XML.** Every tag closes, and no bare `<` or `&` anywhere, including inside a CSS comment, where it is easiest to forget. Write `&lt;` and `&amp;`.
4. **No `<script>`, no event handlers, no `requestAnimationFrame`.**
5. **RTL is declared, never inherited.** `dir="rtl"` is an HTML attribute and means nothing to an svg document, and the host page's direction stops at the image boundary. Put `style="direction:rtl"` on the `<svg>` itself, or every `text-anchor="start"` label jumps to the wrong side of its anchor.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title></title>
<style>html, body { margin: 0; padding: 0; }</style>
</head>
<body>
<!-- One element, self-contained. Add style="direction:rtl" for an RTL figure. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" role="img" aria-label="">
<style>
  /* Palette, type, layout: design for the subject. */
  svg { --accent: #4f46e5; }

  /* Easing, as the cubic-bezier of the curve you want.
     easeInOutCubic  cubic-bezier(.65, 0, .35, 1)
     easeInOutSine   cubic-bezier(.37, 0, .63, 1)
     easeOutCubic    cubic-bezier(.33, 1, .68, 1)      */

  /* ONE duration for every animation in the figure, so the seam lines up.
     Offset a copy in time with a NEGATIVE delay, never a different duration. */
  .pulse   { animation: pulse 8s cubic-bezier(.65, 0, .35, 1) infinite; }
  .pulse.b { animation-delay: -2.67s; }

  /* First and last keyframe identical: that is what makes the loop seamless. */
  @keyframes pulse {
    0%, 100% { opacity: .25; transform: translateX(0); }
    50%      { opacity: 1;   transform: translateX(120px); }
  }

  @media (prefers-reduced-motion: reduce) { * { animation: none; } }
</style>

<!-- The figure. -->

</svg>
</body>
</html>
```

`transform` on an SVG element animates around the element's own origin; set `transform-box: fill-box; transform-origin: center` when you want it to rotate or scale in place. Reach for SMIL (`<animateMotion>`, `<animate>`) for the two things CSS cannot do here: moving along a `<path>`, and animating a geometry attribute that is not a CSS property in every renderer.

## Check it before handing it back

Open the file. Then open it a second way, because that is the way it will actually be seen:

```html
<img src="fig.html" alt="">
```

If the figure is still and the first view moved, the motion is in the wrong place. Static frame plus a broken-image glyph means the XML is malformed: rule 2 or 3.

## GIF (only if the user asks)

A fig is HTML. If the user wants a GIF (Slack previews, slide screenshots, mail clients that strip `<style>` even out of an svg), use the bundled converter:

`bash scripts/html2gif.sh <file.html> <loop_seconds>`

It needs Playwright and ffmpeg installed locally. If either is missing, the script will tell the user how to install it. Do not install dependencies yourself, just relay what the script reports. The `loop_seconds` argument must match the figure's actual loop, otherwise the GIF jumps at the seam.

## Never

No play/pause, no scrub, no multi-scene. Those belong to `web-animation-engine`. The recipient opens the file and the idea plays itself.
