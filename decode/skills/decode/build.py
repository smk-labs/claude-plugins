#!/usr/bin/env python3
"""Assemble a decode tour: inject the generated body and tree into the shell."""
import argparse
import datetime
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
SHELL = HERE / "assets" / "atlas.html"
TREE_MARKER = "<!--TREE-->"
# The atlas is readable-styled output (it carries the kit's palette), so it also
# carries readable's signature - read from readable's own single source, never
# copied. Sibling plugin dir: plugins/<this>/skills/decode -> plugins/readable.
READABLE_KIT = HERE.parents[2] / "readable" / "assets" / "rc.css"
HREF = re.compile(r'href="#([^"]+)"')
ID = re.compile(r'\bid="([^"]+)"')
# A relation chip, and a <code> inside one that looks like a file path.
CHIP = re.compile(r'<span[^>]*\bclass="[^"]*\bs\b[^"]*"[^>]*>(.*?)</span>', re.S)
FILEY = re.compile(r"<code>([^<]*\.[a-z0-9]{1,5})</code>", re.I)


def dead_links(raw: str) -> list[str]:
    """Every hop the reader can take has to land somewhere.

    Navigation is the atlas: the story, the chips and the tree are all anchors into
    canvases. A dead one is worse than none, because it states the causal chain and
    then refuses to walk it. The contract says every named file resolves to a canvas
    id, so this is where that gets proved rather than hoped."""
    ids = ID.findall(raw)
    seen = set(ids)
    errs = []
    dead = sorted({t for t in HREF.findall(raw) if t not in seen})
    if dead:
        errs.append("links to nothing: " + "  ".join("#" + d for d in dead))
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        errs.append("id used twice, so :target picks one canvas: " + "  ".join(dupes))
    return errs


def unlinked_chips(raw: str) -> list[str]:
    """Relation chips that name a file and are not links.

    Only a warning: a chip may name a file that is out of the tour's scope, and a
    missing door must not fail a build. But it is the defect this contract exists to
    prevent, so it never passes silently either."""
    return sorted({m.group(1) for c in CHIP.findall(raw) for m in FILEY.finditer(c)})


def signature() -> str:
    """readable's signature line, lifted from its @sig marker in rc.css.

    Not a copy: the same literal every readable path uses, so the two can never
    drift. If readable is not installed beside this plugin the line is dropped and
    the tour still builds - a missing credit must never fail a build."""
    try:
        m = re.search(r"@sig[ \t]+(<[^\n\r]+)", READABLE_KIT.read_text(encoding="utf-8"))
    except OSError:
        m = None
    if not m:
        print("readable not found beside decode; atlas built unsigned", file=sys.stderr)
        return ""
    return m.group(1).strip()


def main():
    ap = argparse.ArgumentParser(description="Build a decode tour HTML file")
    ap.add_argument("content", help="HTML file: main body, then <!--TREE-->, then the tree")
    ap.add_argument("-o", "--out", required=True, help="output HTML path")
    ap.add_argument("--title", default="قصهٔ کدبیس")
    ap.add_argument("--subtitle", default="")
    a = ap.parse_args()

    raw = pathlib.Path(a.content).read_text(encoding="utf-8")

    for chip in unlinked_chips(raw):
        print(f"decode: chip names {chip} but is not a link, so the reader cannot follow it", file=sys.stderr)
    errs = dead_links(raw)
    if errs:
        for e in errs:
            print("decode: " + e, file=sys.stderr)
        sys.exit(1)

    parts = raw.split(TREE_MARKER, 1)
    body = parts[0].strip()
    tree = parts[1].strip() if len(parts) > 1 else ""

    shell = SHELL.read_text(encoding="utf-8")
    html = (
        shell.replace("{{TITLE}}", a.title)
        .replace("{{SUBTITLE}}", a.subtitle)
        .replace("{{DATE}}", datetime.date.today().isoformat())
        .replace("{{SIG}}", signature())
        .replace("{{BODY}}", body)
        .replace("{{TREE}}", tree)
    )
    out = pathlib.Path(a.out)
    out.write_text(html, encoding="utf-8")
    print(f"tour written: {out.resolve()}")


if __name__ == "__main__":
    main()
