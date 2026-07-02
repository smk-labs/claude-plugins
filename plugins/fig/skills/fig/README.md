# fig

A Claude skill for making a **fig**: a single looping animated SVG, one self-contained HTML file you can drop in an email or a slide.

Use it when an idea moves (flows, loops, retries, queues, fan-outs). Faster than a paragraph, livelier than a static diagram. No player, no deck.

## Install

### Claude Code

```bash
git clone https://github.com/SMKeramati/fig.git ~/.claude/skills/fig
```

The skill auto-loads on next session.

### Claude desktop or web

Download the packaged `fig.skill` from releases and drag it into the Claude app.

## What's in here

```
SKILL.md             The skill itself, loaded into Claude's context when triggered.
scripts/html2gif.sh  Optional helper. Converts a fig to a looping GIF
                     using Playwright + ffmpeg. Used only when asked.
LICENSE              MIT.
```

## License

MIT.
