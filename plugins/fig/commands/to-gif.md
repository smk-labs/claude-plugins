---
description: Convert an animated HTML file (like /fig output) to a perfectly looping high-quality small GIF using Playwright + ffmpeg
argument-hint: <input.html> [loop_seconds=8] [width=1000]
---

Convert the animated HTML at `$1` into a seamlessly looping GIF.

Pipeline (single command — Playwright records one loop as webm, ffmpeg encodes GIF with palettegen+paletteuse for quality, small size):

!${CLAUDE_PLUGIN_ROOT}/skills/fig/scripts/html2gif.sh "$1" "${2:-8}" "${3:-1000}"
