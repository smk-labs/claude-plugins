#!/usr/bin/env bash
# card-header.sh — prepend the standard worker status header to a report card.
#
# The header carries post-run facts only the runner knows (session id, elapsed
# seconds, model), plus the Cursor logo floated into the card's corner. Workers
# never write this line themselves (assets/report-card.md forbids it); the
# orchestrating side runs this once, right before rendering the card with the
# readable `card` tool's htmlFile argument.
#
# Usage: card-header.sh <card-file> <session_id> <seconds> <model> [status-word]
#   status-word defaults to "تمام شد" (rendered as a green badge).
#
# Idempotent: a card that already has the header is left untouched (exit 0).
set -euo pipefail

f="${1:?usage: card-header.sh <card-file> <session_id> <seconds> <model> [status]}"
sid="${2:-unknown}"
secs="${3:-?}"
model="${4:-auto}"
status="${5:-تمام شد}"

[ -f "$f" ] || { echo "card-header: no such file: $f" >&2; exit 1; }
if grep -q 'کارگر Cursor' "$f"; then
  echo "card-header: header already present, skipping"
  exit 0
fi

icon_file="$(cd "$(dirname "$0")/.." && pwd)/cursor-icon.svg"
icon="$(cat "$icon_file")"

# UUID -> first segment, matching the cursor_run footer style (c777948d).
sid_short="${sid%%-*}"

# Persian digits for the elapsed time; sed replaces single ASCII bytes with
# UTF-8 sequences, which is safe where multibyte tr is not.
secs_fa="$(printf '%s' "$secs" | sed -e 's/0/۰/g' -e 's/1/۱/g' -e 's/2/۲/g' -e 's/3/۳/g' -e 's/4/۴/g' -e 's/5/۵/g' -e 's/6/۶/g' -e 's/7/۷/g' -e 's/8/۸/g' -e 's/9/۹/g')"

# RTL card: the far corner is the left one, so the logo floats left while the
# status line reads right-to-left at the top.
hdr="<p><span style=\"float:left;margin-top:2px\">${icon}</span><span class=\"badge ok\">${status}</span> کارگر Cursor — نشست <code>${sid_short}</code> — ${secs_fa} ثانیه — مدل <code>${model}</code></p>"

tmp="${f}.hdr.$$"
{ printf '%s\n' "$hdr"; cat "$f"; } > "$tmp" && mv "$tmp" "$f"
echo "card-header: header added to $f"
