# fig

A Claude skill for making a **fig**: a single looping animated SVG, one self-contained HTML file you can drop in an email or a slide.

Use it when an idea moves (flows, loops, retries, queues, fan-outs). Faster than a paragraph, livelier than a static diagram. No player, no deck.

## Stack (1.1.0)

One inline `<svg>`, motion in CSS `@keyframes` or SMIL. No JavaScript, no CDN, no build step.

Before 1.1.0 the template drove motion from React plus Babel over a CDN, which contradicted the one thing a fig is for. A fig is made to be embedded: as an `<img>` in a report, an attachment in an email, a paste in a slide. In every one of those the svg is lifted out and rendered as its own document, where no script runs and nothing is fetched. Those figures froze on their first frame or showed nothing at all. Declarative motion survives the trip, and drops three CDN dependencies on the way out.

Consequences worth knowing: everything the figure needs lives inside the `<svg>`, the `xmlns` is mandatory, the markup is parsed as strict XML (no bare `<` or `&`, including inside a CSS comment), and RTL must be declared on the svg itself (`style="direction:rtl"`) because `dir` is an HTML attribute that means nothing there.

## Install

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install fig@smk
```

## What's in here

```
SKILL.md             The skill itself, loaded into Claude's context when triggered.
scripts/html2gif.sh  Optional helper. Converts a fig to a looping GIF
                     using Playwright + ffmpeg. Used only when asked.
LICENSE              MIT.
```

## License

MIT.
