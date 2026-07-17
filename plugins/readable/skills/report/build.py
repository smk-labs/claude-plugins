#!/usr/bin/env python3
"""Assemble a standalone readable-styled HTML report from a content fragment.

The kit CSS (assets/rc.css, the same single source the chat cards use) is
injected by THIS script, so the model never retypes or reads any styling.

Usage:
  python3 build.py CONTENT.html -o report.html [--lang fa|en] [--title "..."] [--no-brand]

fa (default): RTL, Vazirmatn (already imported by the kit).
en: LTR, Inter, text-align and the CTA arrow flipped.

Project brand (4.13.0): when a committable .readable/ dir (brand.css +
optional brand.json + logo.svg) exists above the content file, the report is
reskinned with it automatically — palette overrides, an optional logo/wordmark
header, and font files inlined as data URIs so the output stays one offline
file. --no-brand keeps the stock look.
"""
import argparse
import base64
import datetime
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
KIT = HERE.parents[1] / "assets" / "rc.css"
MENU = HERE.parents[1] / "assets" / "menu.js"
SHELL = HERE / "assets" / "shell.html"

BRAND_HEAD_CSS = (
    ".brand{display:flex;align-items:center;gap:9px;margin:0 4px 12px;color:var(--text-primary)}\n"
    ".brand svg,.brand img{width:22px;height:22px;display:block;flex:none}\n"
    ".brand b{font-size:14.5px;font-weight:800}\n"
    ".brand span{font-size:11px;color:var(--text-secondary);border-inline-start:1px solid var(--border-strong);padding-inline-start:9px}\n"
)


def find_brand(start: pathlib.Path):
    """Nearest .readable/brand.css walking up from the content file; the walk
    never reaches $HOME or /, so a stray ~/.readable can't brand everything."""
    home = pathlib.Path.home()
    d = start
    for _ in range(8):
        if d == home or d.parent == d:
            break
        if (d / ".readable" / "brand.css").is_file():
            return d / ".readable"
        d = d.parent
    return None


def brand_blocks(brand_dir: pathlib.Path, lang: str):
    """(style_css, header_html) for the shell's {{BRAND}}/{{BRANDHEAD}} slots.
    brand.css is authored card-first (:root + bare [data-theme="dark"]); the
    report shell adds system-preference dark, so the dark block is mirrored
    into a prefers-color-scheme media query for un-toggled viewers."""
    css = (brand_dir / "brand.css").read_text(encoding="utf-8")
    dark = re.search(r'\[data-theme="?dark"?\]\s*\{([^}]*)\}', css)
    css = re.sub(r'(^|[}\s,])\[data-theme=', r'\1:root[data-theme=', css)
    if dark:
        css += '\n@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){%s}}' % dark.group(1)

    meta = {}
    meta_file = brand_dir / "brand.json"
    if meta_file.is_file():
        meta = json.loads(meta_file.read_text(encoding="utf-8"))

    font = meta.get("font") or {}
    if font.get("google"):
        css = "@import url('https://fonts.googleapis.com/css2?family=%s&display=swap');\n%s" % (font["google"], css)
    for weight, rel in (font.get("files") or {}).items():
        f = brand_dir / rel
        if not f.is_file():
            sys.exit("brand font file missing: %s" % f)
        css += (
            '\n@font-face{font-family:"%s";src:url("data:font/woff2;base64,%s") format("woff2");'
            "font-weight:%s;font-style:normal;font-display:swap}"
            % (font.get("family", "Brand"), base64.b64encode(f.read_bytes()).decode(), weight)
        )
    if font.get("family"):
        fallback = "Vazirmatn,Tahoma,sans-serif" if lang == "fa" else "Inter,system-ui,sans-serif"
        css += '\n.rc,.meta,.brand{font-family:"%s",%s}' % (font["family"], fallback)

    head = ""
    wordmark = meta.get("wordmark") or meta.get("name")
    logo_html = ""
    logo_file = brand_dir / str(meta.get("logo") or "logo.svg")
    if logo_file.is_file() and logo_file.suffix == ".svg" and logo_file.stat().st_size <= 8 * 1024:
        logo_html = re.sub(r"(?s)<\?xml.*?\?>|<!--.*?-->", "", logo_file.read_text(encoding="utf-8")).strip()
    if wordmark or logo_html:
        kind = ('<span>%s</span>' % meta["kind"]) if meta.get("kind") else ""
        head = '<div class="brand">%s%s%s</div>\n' % (logo_html, ("<b>%s</b>" % wordmark) if wordmark else "", kind)
        css += "\n" + BRAND_HEAD_CSS
    return css, head


def menu_js() -> str:
    """The shared card menu (assets/menu.js, same single source the chat card
    template inlines). Comment lines out per its style contract; newlines kept
    (a report has no size ceiling)."""
    lines = MENU.read_text(encoding="utf-8").split("\n")
    return "\n".join(l for l in lines if not l.startswith("/*"))

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
    ap.add_argument("--no-brand", action="store_true", help="ignore any project .readable brand layer")
    a = ap.parse_args()

    src = pathlib.Path(a.content).resolve()
    content = src.read_text(encoding="utf-8").strip()
    if "<style" in content.lower() or "<script" in content.lower():
        sys.exit("content must be building-block HTML only: no <style> or <script>")

    brand_css, brand_head = "", ""
    if not a.no_brand:
        brand_dir = find_brand(src.parent) or find_brand(pathlib.Path.cwd())
        if brand_dir:
            brand_css, brand_head = brand_blocks(brand_dir, a.lang)

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
        .replace("{{MENU}}", menu_js())
        .replace("{{EXTRA}}", EN_EXTRA if a.lang == "en" else "")
        .replace("{{BRAND}}", brand_css)
        .replace("{{BRANDHEAD}}", brand_head)
        .replace("{{DATE}}", datetime.date.today().isoformat())
        .replace("{{CONTENT}}", content)
    )

    out = pathlib.Path(a.out).resolve()
    out.write_text(html, encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
