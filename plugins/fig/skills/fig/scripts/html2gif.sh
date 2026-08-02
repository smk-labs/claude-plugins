#!/bin/bash
# html2gif: convert an animated HTML file (a fig) to a perfectly looping HQ GIF.
#
# Pipeline: Playwright opens the page with a virtual clock injected
# (performance.now + requestAnimationFrame are stubbed), advances one
# frame at a time, screenshots after each tick. ffmpeg assembles the
# frames into a GIF with palettegen+paletteuse and diff_mode=rectangle
# so static regions don't get re-encoded; that's why static-bg +
# moving-pulse animations end up tiny.
#
# Usage:
#   html2gif.sh <input.html> [loop_sec] [width] [fps] [vp_w] [vp_h]
#
# Examples:
#   html2gif.sh fig.html                      # all defaults
#   html2gif.sh fig.html 5                    # 5-second loop
#   html2gif.sh fig.html 8 800 20 1200 700    # everything custom

set -euo pipefail

# ====== PARAMETERS (override via CLI args) ======
INPUT="${1:?usage: html2gif.sh <input.html> [loop_sec=8] [width=1000] [fps=15] [vp_w=1500] [vp_h=820]}"
LOOP_SEC="${2:-8}"      # seconds per loop. must match the source animation's period
WIDTH="${3:-1000}"      # output GIF width in px (height auto-scaled, aspect preserved)
FPS="${4:-15}"          # output frame rate (15 is plenty for slow easings; 20+ for fast motion)
VP_W="${5:-1500}"       # browser viewport width (the rendering canvas)
VP_H="${6:-820}"        # browser viewport height

# Locate Playwright. Auto-detects via `npm root -g`. Override via env if yours
# lives elsewhere: NODE_PATH_PW=/path/to/node_modules html2gif.sh ...
NODE_PATH_PW="${NODE_PATH_PW:-$(npm root -g 2>/dev/null)/@playwright/test/node_modules}"

# ffmpeg encoding tuning:
MAX_COLORS=128          # palette size (128 is fine for near-monochrome diagrams; 256 max)
DITHER="bayer:bayer_scale=5"   # bayer = clean ordered dither; alternatives: sierra2_4a, none
# =================================================

# Dependency checks. Do not auto-install; just report what's missing.
command -v node >/dev/null || { echo "Missing: node. Install from https://nodejs.org" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "Missing: ffmpeg. Install with 'brew install ffmpeg' (macOS) or 'apt install ffmpeg' (Linux)." >&2; exit 1; }
[ -d "$NODE_PATH_PW/playwright" ] || { echo "Missing: Playwright at $NODE_PATH_PW. Install with 'npm install -g @playwright/test && npx playwright install chromium', or set NODE_PATH_PW to your own install path." >&2; exit 1; }

ABSPATH="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
[ -f "$ABSPATH" ] || { echo "Not found: $ABSPATH" >&2; exit 1; }

OUTPUT="${ABSPATH%.html}.gif"
TMPDIR=$(mktemp -d)
FRAMES="$TMPDIR/frames"
mkdir -p "$FRAMES"
trap "rm -rf $TMPDIR" EXIT

N_FRAMES=$(( LOOP_SEC * FPS ))
echo "→ Capturing $N_FRAMES frames (${LOOP_SEC}s × ${FPS}fps) at ${VP_W}×${VP_H}"

NODE_PATH="$NODE_PATH_PW" node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: $VP_W, height: $VP_H } });
  const page = await ctx.newPage();

  // Virtual clock: animation progress is driven by us, not wall time.
  await page.addInitScript(() => {
    let virtual = 0;
    Object.defineProperty(performance, 'now',
      { value: () => virtual, configurable: true, writable: true });
    let nextId = 1;
    const queue = new Map();
    window.requestAnimationFrame = (cb) => { const id = nextId++; queue.set(id, cb); return id; };
    window.cancelAnimationFrame  = (id) => queue.delete(id);
    window.__advance = (ms) => {
      virtual += ms;
      const cbs = Array.from(queue.values());
      queue.clear();
      cbs.forEach(cb => { try { cb(virtual); } catch(e) {} });
    };
    window.__queueSize = () => queue.size;
  });

  await page.goto('file://$ABSPATH', { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});

  // Wait until the page actually renders something. Babel Standalone compile
  // plus React mount is wildly variable (1 to 30+ seconds on cold loads), so
  // a fixed sleep is unreliable. Wait for both signals: the root has DOM
  // children (proves the JSX rendered) AND a rAF is queued (proves a
  // useTime-style hook is wired up and ready to receive ticks).
  await page.waitForFunction(() => {
    const root = document.getElementById('root');
    return root && root.children.length > 0 && window.__queueSize && window.__queueSize() > 0;
  }, { timeout: 90000 })
    .catch(() => { console.error('Warning: page did not mount within 90s. The page may not be React-based, may not use #root, or may not use requestAnimationFrame. Frames may be empty.'); });
  await page.waitForTimeout(200);   // small buffer for React to flush initial state

  const N  = $N_FRAMES;
  const dt = 1000 / $FPS;
  const pad = (n) => String(n).padStart(4, '0');

  for (let i = 0; i < N; i++) {
    await page.evaluate((ms) => window.__advance(ms), dt);
    await page.waitForTimeout(8);   // let React flush setState then DOM
    await page.screenshot({ path: '$FRAMES/f_' + pad(i) + '.png' });
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
"

echo "→ Encoding GIF (width=${WIDTH}px, palettegen+paletteuse, diff_mode=rectangle)"
ffmpeg -hide_banner -loglevel warning -y \
  -framerate "$FPS" -i "$FRAMES/f_%04d.png" \
  -filter_complex "scale=$WIDTH:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=$MAX_COLORS:stats_mode=diff[p];[s1][p]paletteuse=dither=$DITHER:diff_mode=rectangle" \
  -loop 0 \
  "$OUTPUT"

SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')
echo "✓ $OUTPUT ($SIZE)"
