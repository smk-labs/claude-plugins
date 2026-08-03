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
