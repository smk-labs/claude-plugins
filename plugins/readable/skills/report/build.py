#!/usr/bin/env python3
"""Assemble a standalone readable-styled HTML report from a content fragment.

The kit CSS (assets/rc.css, the same single source the chat cards use) is
injected by THIS script, so the model never retypes or reads any styling.

Usage:
  python3 build.py CONTENT.html -o report.html [--lang fa|en] [--title "..."]

fa (default): RTL, Vazirmatn (already imported by the kit).
en: LTR, Inter, text-align and the CTA arrow flipped.
"""
import argparse
import datetime
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
KIT = HERE.parents[1] / "assets" / "rc.css"
SHELL = HERE / "assets" / "shell.html"

EN_EXTRA = (
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap');\n"
    ".rc{font-family:Inter,system-ui,-apple-system,sans-serif;text-align:left}\n"
    ".rc thead th,.rc tbody td{text-align:left}\n"
    ".rc .cta::after{content:'\\2192'}\n"
    ".rc .flow .s:not(:last-child)::before{transform:translateY(-50%) rotate(225deg)}\n"
    ".meta{font-family:Inter,system-ui,sans-serif}\n"
)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("content", help="path to the content HTML fragment (building blocks only, no <style>)")
    ap.add_argument("-o", "--out", default="report.html", help="output file (default: ./report.html)")
    ap.add_argument("--lang", choices=["fa", "en"], default="fa")
    ap.add_argument("--title", default=None, help="page <title> (defaults to first <h2> text or a generic title)")
    a = ap.parse_args()

    content = pathlib.Path(a.content).read_text(encoding="utf-8").strip()
    if "<style" in content.lower() or "<script" in content.lower():
        sys.exit("content must be building-block HTML only: no <style> or <script>")

    title = a.title
    if not title and "<h2>" in content:
        title = content.split("<h2>", 1)[1].split("</h2>", 1)[0]
        for tag in ("<", ">"):
            if tag in title:
                title = None
                break
    if not title:
        title = "گزارش" if a.lang == "fa" else "Report"

    html = (
        SHELL.read_text(encoding="utf-8")
        .replace("{{LANG}}", a.lang)
        .replace("{{DIR}}", "rtl" if a.lang == "fa" else "ltr")
        .replace("{{TITLE}}", title)
        .replace("{{KIT}}", KIT.read_text(encoding="utf-8"))
        .replace("{{EXTRA}}", EN_EXTRA if a.lang == "en" else "")
        .replace("{{DATE}}", datetime.date.today().isoformat())
        .replace("{{CONTENT}}", content)
    )

    out = pathlib.Path(a.out).resolve()
    out.write_text(html, encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
