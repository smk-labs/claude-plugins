#!/usr/bin/env bash
# getpix: search and fetch free, licensed images. Zero packages: bash + curl + python3.
# Sources: Openverse + Wikimedia (no key), Pexels + Pixabay + Unsplash (free key via env).
set -uo pipefail

CD="${TMPDIR:-/tmp}/getpix"; mkdir -p "$CD"
CACHE="$CD/last.json"
UA="getpix/1.0 (+https://github.com/smk-labs/claude-plugins)"

die(){ echo "getpix: $*" >&2; exit 1; }
have(){ command -v "$1" >/dev/null 2>&1; }
have python3 || die "python3 is required"
have curl || die "curl is required"

usage(){ cat <<'EOF'
Usage:
  getpix.sh sources                                  key status per source
  getpix.sh search "query" [-n 5] [-o landscape|portrait|square] [-s SOURCE]
                                                     SOURCE: all|openverse|wikimedia|pexels|pixabay|unsplash
  getpix.sh thumb N                                  download small preview of result N, prints path
  getpix.sh get N -d DIR [-w 1600] [-f webp|jpg] [--name slug]
EOF
}

urlenc(){ python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; }

cmd="${1:-}"; [ $# -gt 0 ] && shift

case "$cmd" in

sources)
  [ -n "${PEXELS_API_KEY:-}" ]     && echo "pexels: ready"   || echo "pexels: skipped, set PEXELS_API_KEY (free: pexels.com/api)"
  [ -n "${PIXABAY_API_KEY:-}" ]    && echo "pixabay: ready"  || echo "pixabay: skipped, set PIXABAY_API_KEY (free: pixabay.com/api/docs)"
  [ -n "${UNSPLASH_ACCESS_KEY:-}" ] && echo "unsplash: ready" || echo "unsplash: skipped, set UNSPLASH_ACCESS_KEY (free: unsplash.com/developers)"
  echo "openverse: ready, no key (anon limit ~200/day)"
  echo "wikimedia: ready, no key"
  ;;

search)
  Q="${1:-}"; [ -n "$Q" ] || die 'search needs a query: search "two or three words"'
  shift
  N=5; ORI=""; SRC="all"
  while [ $# -gt 0 ]; do case "$1" in
    -n) N="${2:?}"; shift 2;;
    -o) ORI="${2:?}"; shift 2;;
    -s) SRC="${2:?}"; shift 2;;
    *) die "unknown option: $1";;
  esac; done
  QE=$(urlenc "$Q")
  rm -f "$CD"/raw_*.json "$CD"/thumb_* "$CD"/orig_*
  want(){ [ "$SRC" = "all" ] || [ "$SRC" = "$1" ]; }

  if want openverse; then
    ar=""; case "$ORI" in landscape) ar="&aspect_ratio=wide";; portrait) ar="&aspect_ratio=tall";; square) ar="&aspect_ratio=square";; esac
    curl -sL -m 25 -A "$UA" -o "$CD/raw_openverse.json" \
      "https://api.openverse.org/v1/images/?q=$QE&page_size=$N&license_type=commercial$ar" &
  fi
  if want wikimedia; then
    curl -sL -m 25 -A "$UA" -o "$CD/raw_wikimedia.json" \
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=filetype%3Abitmap%20$QE&gsrnamespace=6&gsrlimit=$N&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=1600" &
  fi
  if want pexels && [ -n "${PEXELS_API_KEY:-}" ]; then
    o=""; [ -n "$ORI" ] && o="&orientation=$ORI"
    curl -sL -m 25 -A "$UA" -H "Authorization: $PEXELS_API_KEY" -o "$CD/raw_pexels.json" \
      "https://api.pexels.com/v1/search?query=$QE&per_page=$N$o" &
  fi
  if want pixabay && [ -n "${PIXABAY_API_KEY:-}" ]; then
    o=""; case "$ORI" in landscape) o="&orientation=horizontal";; portrait) o="&orientation=vertical";; esac
    curl -sL -m 25 -A "$UA" -o "$CD/raw_pixabay.json" \
      "https://pixabay.com/api/?key=$PIXABAY_API_KEY&q=$QE&per_page=$N&image_type=photo&safesearch=true$o" &
  fi
  if want unsplash && [ -n "${UNSPLASH_ACCESS_KEY:-}" ]; then
    o=""; case "$ORI" in landscape) o="&orientation=landscape";; portrait) o="&orientation=portrait";; square) o="&orientation=squarish";; esac
    curl -sL -m 25 -A "$UA" -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY" -o "$CD/raw_unsplash.json" \
      "https://api.unsplash.com/search/photos?query=$QE&per_page=$N$o" &
  fi
  wait

  ORI="$ORI" SRC="$SRC" python3 - "$CD" "$CACHE" "$Q" <<'PY'
import json, os, re, sys
cd, cache, query = sys.argv[1], sys.argv[2], sys.argv[3]
ori, src_filter = os.environ.get("ORI",""), os.environ.get("SRC","all")

def load(name):
    p = os.path.join(cd, f"raw_{name}.json")
    if not os.path.exists(p): return None
    try:
        with open(p) as f: return json.load(f)
    except Exception: return "error"

def strip_html(s): return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()

LIC = {"by":"CC BY","by-sa":"CC BY-SA","cc0":"CC0","pdm":"Public Domain"}
recs, notes = {}, []

d = load("openverse")
if d == "error" or (d and not isinstance(d.get("results"), list)):
    notes.append("openverse: error")
elif d:
    out = []
    for r in d["results"]:
        out.append(dict(src="openverse", title=r.get("title") or "", w=r.get("width"), h=r.get("height"),
            license=LIC.get(r.get("license"), ("CC "+(r.get("license") or "?").upper())),
            creator=r.get("creator") or "", page=r.get("foreign_landing_url") or "",
            thumb=r.get("thumbnail") or "", full=r.get("url") or "", alt=r.get("title") or "",
            attr=r.get("attribution") or "", dl=""))
    recs["openverse"] = out

d = load("wikimedia")
if d == "error": notes.append("wikimedia: error")
elif d:
    out = []
    for p in (d.get("query") or {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        w, h = ii.get("width"), ii.get("height")
        if ori == "landscape" and not (w and h and w > h): continue
        if ori == "portrait" and not (w and h and h > w): continue
        if ori == "square" and not (w and h and abs(w-h) <= min(w,h)*0.15): continue
        em = ii.get("extmetadata") or {}
        get = lambda k: strip_html((em.get(k) or {}).get("value",""))
        full = ii.get("thumburl") or ii.get("url") or ""
        thumb = re.sub(r"/(\d+)px-", "/640px-", full) if "px-" in full else full
        title = re.sub(r"^File:|\.\w+$", "", p.get("title",""))
        out.append(dict(src="wikimedia", title=title, w=w, h=h,
            license=get("LicenseShortName") or "see page", creator=get("Artist"),
            page=ii.get("descriptionurl") or "", thumb=thumb, full=full, alt=title, attr="", dl=""))
    recs["wikimedia"] = out

d = load("pexels")
if d == "error" or (d and "photos" not in d): notes.append("pexels: error (check PEXELS_API_KEY)")
elif d:
    recs["pexels"] = [dict(src="pexels", title=r.get("alt") or "", w=r.get("width"), h=r.get("height"),
        license="Pexels", creator=r.get("photographer") or "", page=r.get("url") or "",
        thumb=r["src"].get("medium",""), full=r["src"].get("large2x") or r["src"].get("large",""),
        alt=r.get("alt") or "", attr="", dl="") for r in d["photos"]]

d = load("pixabay")
if d == "error" or (d and "hits" not in d): notes.append("pixabay: error (check PIXABAY_API_KEY)")
elif d:
    recs["pixabay"] = [dict(src="pixabay", title=r.get("tags") or "", w=r.get("imageWidth"), h=r.get("imageHeight"),
        license="Pixabay", creator=r.get("user") or "", page=r.get("pageURL") or "",
        thumb=r.get("webformatURL",""), full=r.get("largeImageURL") or r.get("webformatURL",""),
        alt=r.get("tags") or "", attr="", dl="") for r in d["hits"]]

d = load("unsplash")
if d == "error" or (d and "results" not in d): notes.append("unsplash: error (check UNSPLASH_ACCESS_KEY)")
elif d:
    out = []
    for r in d["results"]:
        raw = (r.get("urls") or {}).get("raw","")
        out.append(dict(src="unsplash", title=r.get("alt_description") or "", w=r.get("width"), h=r.get("height"),
            license="Unsplash", creator=(r.get("user") or {}).get("name",""),
            page=(r.get("links") or {}).get("html",""), thumb=(r.get("urls") or {}).get("small",""),
            full=raw + "&w=1920&fm=jpg&q=82&fit=max" if raw else "",
            alt=r.get("alt_description") or "", dl=(r.get("links") or {}).get("download_location",""), attr=""))
    recs["unsplash"] = out

# round-robin interleave so the top of the list mixes sources
order = [s for s in ("pexels","unsplash","pixabay","openverse","wikimedia") if recs.get(s)]
merged, i = [], 0
while any(len(recs[s]) > i for s in order):
    for s in order:
        if len(recs[s]) > i: merged.append(recs[s][i])
    i += 1

with open(cache, "w") as f: json.dump({"query": query, "results": merged}, f)

parts = [f"{s} ok({len(recs[s])})" for s in order] + notes
skipped = [s for s in ("pexels","pixabay","unsplash") if s not in recs and not any(n.startswith(s) for n in notes) and src_filter in ("all", s)]
if skipped: parts.append("skipped (no key): " + ",".join(skipped))
print("sources: " + " | ".join(parts) if parts else "sources: none ran")
if not merged:
    print("no results. Try simpler English words, or -s all."); sys.exit(0)
for idx, r in enumerate(merged, 1):
    t = (r["title"] or r["alt"] or "untitled")[:52]
    c = (r["creator"] or "?")[:22]
    print(f'{idx}) [{r["src"]}] {r["w"]}x{r["h"]} {r["license"]} | {t} (by {c})')
print('next: "thumb N" to preview, "get N -d DIR" to fetch')
PY
  ;;

thumb)
  IDX="${1:-}"; [ -n "$IDX" ] || die "thumb needs a result number"
  [ -f "$CACHE" ] || die "no search cache; run search first"
  URL=$(python3 -c 'import json,sys;r=json.load(open(sys.argv[1]))["results"][int(sys.argv[2])-1];print(r["thumb"])' "$CACHE" "$IDX") || die "bad index"
  [ -n "$URL" ] || die "no thumbnail for this result"
  EXT="jpg"; case "$URL" in *.png*) EXT="png";; esac
  OUT="$CD/thumb_$IDX.$EXT"
  curl -sL -m 40 -A "$UA" -o "$OUT" "$URL" || die "thumbnail download failed"
  [ -s "$OUT" ] || die "empty thumbnail"
  echo "$OUT"
  ;;

get)
  IDX="${1:-}"; [ -n "$IDX" ] || die "get needs a result number"
  shift
  [ -f "$CACHE" ] || die "no search cache; run search first"
  DIR=""; W=1600; FMT="webp"; NAME=""
  while [ $# -gt 0 ]; do case "$1" in
    -d) DIR="${2:?}"; shift 2;;
    -w) W="${2:?}"; shift 2;;
    -f) FMT="${2:?}"; shift 2;;
    --name) NAME="${2:?}"; shift 2;;
    *) die "unknown option: $1";;
  esac; done
  [ -n "$DIR" ] || die "get needs -d DIR (where to save)"
  mkdir -p "$DIR"

  REC=$(python3 -c '
import json,sys
r=json.load(open(sys.argv[1]))["results"][int(sys.argv[2])-1]
print("\x1f".join(str(r.get(k,"")) for k in ("src","full","page","creator","license","title","alt","attr","dl")))' "$CACHE" "$IDX") || die "bad index"
  IFS=$'\x1f' read -r SRC FULL PAGE CREATOR LICENSE TITLE ALT ATTR DL <<< "$REC"
  [ -n "$FULL" ] || die "no full-size URL for this result"

  TMP="$CD/orig_$IDX"
  curl -sL -m 90 -A "$UA" -o "$TMP" "$FULL" || die "download failed (origin may be slow or blocked); try another result"
  [ -s "$TMP" ] || die "empty download; try another result"

  if [ -z "$NAME" ]; then NAME="${TITLE:-$ALT}"; fi
  SLUG=$(python3 -c 'import re,sys;s=re.sub(r"[^a-z0-9]+","-",sys.argv[1].lower()).strip("-")[:60];print(s or "image")' "$NAME")

  SW=""
  if have magick; then SW=$(magick identify -format %w "$TMP" 2>/dev/null || true)
  elif have sips; then SW=$(sips -g pixelWidth "$TMP" 2>/dev/null | awk '/pixelWidth/{print $2}' || true); fi

  OUT="$DIR/$SLUG.$FMT"; n=2
  while [ -e "$OUT" ]; do OUT="$DIR/$SLUG-$n.$FMT"; n=$((n+1)); done

  ENC=""
  if [ "$FMT" = "webp" ]; then
    if have magick; then
      magick "$TMP" -auto-orient -resize "${W}x${W}>" -quality 78 "$OUT" && ENC="magick"
    elif have cwebp; then
      if [ -n "$SW" ] && [ "$SW" -gt "$W" ] 2>/dev/null; then cwebp -quiet -q 78 -resize "$W" 0 "$TMP" -o "$OUT" && ENC="cwebp"
      else cwebp -quiet -q 78 "$TMP" -o "$OUT" && ENC="cwebp"; fi
    else
      FMT="jpg"; OUT="$DIR/$SLUG.jpg"
      echo "note: no webp encoder found (magick/cwebp); writing jpg instead" >&2
    fi
  fi
  if [ "$FMT" = "jpg" ] && [ -z "$ENC" ]; then
    if have magick; then
      magick "$TMP" -auto-orient -resize "${W}x${W}>" -quality 80 "$OUT" && ENC="magick"
    elif have sips; then
      if [ -n "$SW" ] && [ "$SW" -gt "$W" ] 2>/dev/null; then sips -Z "$W" -s format jpeg -s formatOptions 80 "$TMP" --out "$OUT" >/dev/null && ENC="sips"
      else sips -s format jpeg -s formatOptions 80 "$TMP" --out "$OUT" >/dev/null && ENC="sips"; fi
    else
      cp "$TMP" "$OUT" && ENC="copy (no encoder found; original kept as-is)"
    fi
  fi
  [ -s "$OUT" ] || die "optimize step failed"

  DIMS=""
  if have magick; then DIMS=$(magick identify -format "%wx%h" "$OUT" 2>/dev/null || true)
  elif have sips; then DIMS=$(sips -g pixelWidth -g pixelHeight "$OUT" 2>/dev/null | awk '/pixelWidth/{w=$2}/pixelHeight/{h=$2}END{print w"x"h}' || true); fi
  KB=$(( $(wc -c < "$OUT" | tr -d ' ') / 1024 ))

  # Unsplash API terms: trigger the download endpoint on actual use
  if [ "$SRC" = "unsplash" ] && [ -n "$DL" ] && [ -n "${UNSPLASH_ACCESS_KEY:-}" ]; then
    curl -sL -m 15 -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY" -o /dev/null "$DL" || true
  fi

  echo "saved: $OUT (${DIMS:-?}, ${KB} KB, via $ENC, source: $SRC)"
  [ -n "$ALT" ] && echo "alt suggestion: $ALT"
  case "$SRC" in
    pexels)   echo "attribution: not required (Pexels license). Optional: Photo by $CREATOR on Pexels ($PAGE)";;
    pixabay)  echo "attribution: not required (Pixabay Content License). Optional: $CREATOR / Pixabay";;
    unsplash) echo "attribution REQUIRED: Photo by $CREATOR on Unsplash ($PAGE)";;
    openverse) echo "attribution REQUIRED ($LICENSE): ${ATTR:-\"$TITLE\" by $CREATOR, $LICENSE ($PAGE)}";;
    wikimedia) echo "attribution: check license \"$LICENSE\": \"$TITLE\" by $CREATOR, via Wikimedia Commons ($PAGE)";;
  esac
  ;;

*)
  usage; exit 1;;
esac
