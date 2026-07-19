#!/usr/bin/env python3
"""Assemble a decode atlas: inject the generated body into the atlas shell."""
import argparse
import datetime
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SHELL = HERE / "assets" / "atlas.html"


def main():
    ap = argparse.ArgumentParser(description="Build a decode atlas HTML file")
    ap.add_argument("content", help="HTML file holding only the atlas body sections")
    ap.add_argument("-o", "--out", required=True, help="output HTML path")
    ap.add_argument("--title", default="اطلس کدبیس")
    ap.add_argument("--subtitle", default="")
    a = ap.parse_args()

    body = pathlib.Path(a.content).read_text(encoding="utf-8")
    shell = SHELL.read_text(encoding="utf-8")
    html = (
        shell.replace("{{TITLE}}", a.title)
        .replace("{{SUBTITLE}}", a.subtitle)
        .replace("{{DATE}}", datetime.date.today().isoformat())
        .replace("{{BODY}}", body)
    )
    out = pathlib.Path(a.out)
    out.write_text(html, encoding="utf-8")
    print(f"atlas written: {out.resolve()}")


if __name__ == "__main__":
    main()
