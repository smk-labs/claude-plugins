# getpix

Claude finds a good free photo on the internet, downloads it, optimizes it, and puts it in your project. Say "add a hero image about coffee to the blog" and it happens. It also works in plain conversation: ask "show me what a capybara looks like" and the photo appears right in the chat.

- Sources: Pexels, Pixabay, Unsplash (free API keys) plus Openverse and Wikimedia Commons (no key at all). Works out of the box with zero setup; keys unlock the better catalogs.
- One shell script (`scripts/getpix.sh`, bash + curl + python3, no packages) does search, preview, download, and WebP conversion. Never upscales.
- Claude can preview thumbnails with its own eyes before choosing ("picky mode"), or pick from metadata only ("fast mode", cheaper).
- Every fetch prints the file path, an alt-text suggestion, and the exact attribution line the license needs.

## Photo pass

`/getpix:photo-pass` runs a whole-site art-direction pass: audit where photos genuinely earn their place (3 to 6 spots, no decoration), define one visual family, pick every image by eye, melt them into the design with the site's own color tokens, verify both themes, and record every credit in CREDITS.md.

## Setup (optional)

```bash
export PEXELS_API_KEY=...      # pexels.com/api
export PIXABAY_API_KEY=...     # pixabay.com/api/docs
export UNSPLASH_ACCESS_KEY=... # unsplash.com/developers
```

## Use

`/getpix hero image of a mountain lake for the landing page`

Or just ask naturally: "find a photo of a wooden desk for the post".
