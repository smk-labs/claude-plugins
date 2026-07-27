---
name: getpix
description: Search and fetch free, licensed stock images from the internet (Pexels, Pixabay, Unsplash, Openverse, Wikimedia Commons). Two jobs: add optimized WebP images to sites, blogs, and docs, or show a fitting photo right in the chat while answering about a topic. Use when the user wants to find, download, insert, or see a real photo, e.g. "find an image of X", "show me a photo of X", "add a hero photo", "getpix", or Persian requests like "عکس پیدا کن" / "عکسشو نشونم بده" / "عکس بذار". Also use proactively when a photo would genuinely help an answer (a place, animal, object, dish). Not for AI image generation.
---

# getpix

Find a good free image, then either show it in the chat or install it into a project. Everything goes through one script; never call the image APIs yourself and never dump raw API JSON into context.

Script: `${CLAUDE_PLUGIN_ROOT}/scripts/getpix.sh`

## Show in chat (no project file involved)

When the user just wants to see an image, or a photo would make an answer clearer:

1. `search "english words" -n 5`
2. `thumb N` for the most promising result; it prints a local file path.
3. Read that file: it renders inline in the conversation for the user. If it is clearly wrong, try one other candidate, then stop.
4. Under it, give a one-line source note: title, creator, source, license (all already in the search output). No `get`, no optimization needed.

Cost: one search plus 1 to 2 thumbnails. Do this proactively when it genuinely helps, not on every reply.

## Insert into a project (site, blog, docs)

1. **Query in English, 2 to 4 concrete words.** Stock APIs are English-centric: translate the user's request first ("قهوه و لپتاپ" becomes `laptop coffee desk`). Prefer subject + setting over abstract words.
2. **Search:**
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/getpix.sh" search "laptop coffee desk" -n 5 -o landscape
   ```
   Output is a compact numbered list: source, dimensions, license, title, creator. Sources without keys are skipped automatically; Openverse and Wikimedia always work keyless.
3. **Pick.**
   - **Fast mode (default):** choose from the metadata alone: dimensions fit the slot, license is easy, title/alt matches the topic. Spend zero images.
   - **Picky mode** (user asked for "best", "beautiful", a hero image, or the pick really matters): preview at most 2 to 3 candidates:
     ```bash
     bash "${CLAUDE_PLUGIN_ROOT}/scripts/getpix.sh" thumb 3   # prints a local file path
     ```
     Read each printed file, judge subject, composition, and whether colors fit the site, then pick.
4. **Fetch and optimize** (only the chosen one; never download originals of the losers):
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/getpix.sh" get 3 -d ./public/images -w 1600 --name coffee-desk-hero
   ```
   The script downloads a reasonably sized variant, converts to WebP (magick, else cwebp, else JPEG via sips), and never upscales. Widths: content 1200 to 1600, hero 1920, card/thumb 640.
5. **Insert.** Use the printed path. Write a descriptive `alt` (the printed alt suggestion is a starting point), add `loading="lazy"` below the fold, and set width/height if the framework wants them.
6. **Attribution.** The `get` output says exactly what each source needs. Pexels and Pixabay: none required. Unsplash: required, add the credit line near the image or in the page footer. Openverse and Wikimedia: follow the printed license line. Never skip a printed "REQUIRED" attribution.

## Token and speed rules

- One search is usually enough. If results are bad, reword once (different nouns), do not loop.
- Preview at most 3 thumbnails per request, whatever the mode.
- Never `cat` the raw JSON in `${TMPDIR}/getpix/`; the script's stdout is the only interface.
- If a `get` fails with a slow-origin error, take the next candidate instead of retrying the same one.

## Running several at once

getpix stores search results in one cache file. Two runs that share it overwrite each other, so `get 3` quietly downloads the other run's third result. When several agents or workers use getpix at the same time, give each one its own session id:

```bash
export GETPIX_SESSION=hero-coffee    # e.g. the slug this worker owns
```

Or per command: `search "..." --session hero-coffee`, then `get 1 --session hero-coffee`. Ids keep letters, digits, dot, dash and underscore; anything else is replaced.

- One id per worker, on every getpix call that worker makes. The same id on two workers is the same bug again.
- `get` prints the search it resolved against: `from search "espresso crema" (5 results)`. If that names a query you did not ask for, the cache was shared.
- Each session leads with a different source, so a fleet spreads its downloads over the five APIs instead of aiming them all at one. To spread the search calls too, pin a different `-s` per worker.
- Session dirs under `${TMPDIR}/getpix/` are swept after a day. Nothing to clean up by hand.

## Keys (all free, all optional)

| Env var | Where | Free limit |
| --- | --- | --- |
| `PEXELS_API_KEY` | pexels.com/api | 200/hour |
| `PIXABAY_API_KEY` | pixabay.com/api/docs | 100/min |
| `UNSPLASH_ACCESS_KEY` | unsplash.com/developers | 50/hour (demo) |
| none needed | Openverse | ~200/day anonymous |
| none needed | Wikimedia Commons | generous |

No keys at all still works (Openverse + Wikimedia). With keys, quality and volume improve; `sources` subcommand shows what is active. If every source errors, tell the user which env var to check instead of retrying.
