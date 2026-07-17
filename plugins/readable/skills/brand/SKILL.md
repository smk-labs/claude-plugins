---
name: brand
description: Give THIS project its own readable brand - after this, every chat card and /report in the project renders in the project's palette, logo, and font. Detects the identity from the repo (design tokens, tailwind config, DESIGN.md, logos) or interviews the user when none exists, then writes a committable .readable/ layer. Use when the user asks to "brand readable", "brand the cards/reports", "make reports match our brand", "رنگ و لوگوی خودمون روی کارت‌ها/گزارش‌ها", or invokes /readable:brand.
---

# brand: a per-project skin for cards and reports

Output = a small committable `.readable/` dir at the project root. From then on `/report` reskins automatically, and chat cards do too (the session hook announces the dir; cards need an app restart to pick up a brand created mid-session).

## 1. Detect before asking

Search the repo for an existing identity, in this order; quote what you find to the user before generating:

1. Design tokens: `**/tokens.css`, `**/design-system/**`, CSS custom props in the main stylesheet, `tailwind.config.*` color scales.
2. `DESIGN.md` / `BRAND.md` / brand guidelines docs.
3. Logos: `media/brand/`, `public/*.svg`, favicon SVGs. Prefer a mark that uses `currentColor` (theme-flips for free).
4. Fonts: `@font-face` files in the repo, or the families the site loads.

If ≥ a primary/accent color and a light-or-dark character are found, generate directly. Otherwise interview with AskUserQuestion, ONE batch: accent color (offer 3 sensible hues + custom hex), light surface character (pure white / warm cream / cool gray), dark base (ink navy / graphite / near-black), wordmark text + optional logo path, one tone word (serious/friendly/technical — store it, it guides future doc copy). Never ask what detection already answered.

## 2. Generate `.readable/`

**`brand.css`** — variable overrides only, in EXACTLY this vocabulary (card template + report shell both consume it). Author card-first: a `:root{}` light block and a bare `[data-theme="dark"]{}` dark block (consumers normalize selectors themselves). Vars: `--text-primary --text-secondary --text-accent --surface-1 --surface-2 --border --border-strong --bg-success --bg-accent --bg-warning --bg-danger --font-mono` (report-only extra: `--page-bg`). Chart hues go on `.rc{--ca:… --cb:… --cc:… --cd:…}` (dark tweaks via `[data-theme="dark"] .rc{…}`).

Rules of taste: derive the full ramp from the 1-2 given colors — tinted, not gray, surfaces; `--bg-accent` = a soft wash of the accent; keep `--text-accent` ≥ 4.5:1 contrast on `--surface-1` in BOTH themes (compute it, don't eyeball); dark theme is a designed palette, not inverted light. A Google-Fonts family may be declared via `brand.json`; never `@import` other hosts (cards strip them).

**`brand.json`** (optional but recommended):

```json
{ "name": "پایا", "wordmark": "پایا", "kind": "سند داخلی تیم",
  "logo": "logo.svg", "tone": "صنعتی، ساده",
  "font": { "family": "Vazirmatn", "google": "Vazirmatn:wght@400;500;700",
            "files": { "400": "fonts/X-Regular.woff2", "700": "fonts/X-Bold.woff2" } } }
```

`wordmark`/`kind`/`logo` feed the report header (cards stay colors-only, no letterhead). `font.files` are inlined into reports; `font.google` is the only font path that also reaches chat cards.

**`logo.svg`** — copy the project mark VERBATIM (no redesign), ≤ 8KB, `currentColor` preferred.

## 3. Prove it, then hand over

1. Build a sample report through the report skill's `build.py` with a 5-block fragment; verify in a browser: both themes, palette applied, header shows, accent contrast holds.
2. Render one chat card passing `brand: "<abs>/.readable"` — if the running card server predates 4.13 it ignores the param harmlessly; tell the user cards start branding after an app restart.
3. Tell the user to commit `.readable/` (it is team-shared config, not local state).
