#!/usr/bin/env python3
"""Assemble a standalone readable-styled HTML report from a content fragment.

The kit CSS (assets/rc.css, the same single source the chat cards use) is
injected by THIS script, so the model never retypes or reads any styling.

Usage:
  python3 build.py CONTENT.html -o report.html [--lang fa|en] [--title "..."] [--no-brand]

fa (default): RTL, Vazirmatn (already imported by the kit).
en: LTR, Inter, text-align and the CTA arrow flipped.

Images and motion (5.1.0): every <img src="..."> pointing at a local file is
inlined as a data: URI, so the report stays one offline file that survives being
emailed or printed. Works for png/jpg/gif/webp/avif/svg, and for a /fig .html
file, whose <svg> is lifted out with the document's <style> folded into it.
Per-image cap is 2MB (--max-image-kb); over it the build refuses rather than
shipping a broken image. data: and http(s): sources are left untouched.

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
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname

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
        # PRINT-SAFE: no remote @import. The faces are inlined below, and a blocked
        # font host makes the browser hang before it will print.
        pass
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


MEDIA_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
}


def svg_from_html(text: str, src: pathlib.Path) -> str:
    """The <svg> out of a /fig file, made self-contained.

    /fig writes ONE html file whose animation css usually lives in the document
    <style>, not inside the svg. Lifting the svg out on its own would therefore
    drop the motion, so every <style> in the document is folded into the svg as a
    child. That also isolates it: the svg becomes its own document inside <img>,
    so a /fig class name can never land in the report's cascade next to the kit's
    own .s/.l/.t."""
    m = re.search(r"(?is)<svg\b.*?</svg\s*>", text)
    if not m:
        sys.exit("no <svg> found in %s: /fig output is expected to contain one" % src)
    svg = m.group(0)
    styles = "".join(
        s for s in re.findall(r"(?is)<style[^>]*>(.*?)</style\s*>", text)
        if "<svg" not in s
    )
    if styles and "<style" not in svg.lower():
        svg = re.sub(r"(?is)(<svg\b[^>]*>)", r"\1<style>%s</style>" % styles.replace("\\", "\\\\"), svg, count=1)
    return svg


def data_uri(src: pathlib.Path, max_kb: int) -> str:
    """One local file as a data: URI, so the report stays a single offline file.

    Fails loudly rather than leaving the reference: a report that silently ships a
    broken <img> is worse than one that refuses to build. --max-image-kb raises
    the cap when a big screenshot is genuinely wanted."""
    if not src.is_file():
        sys.exit("image not found: %s" % src)
    size = src.stat().st_size
    if size > max_kb * 1024:
        sys.exit("image too large: %s is %dKB, cap is %dKB (raise it with --max-image-kb)"
                 % (src, size // 1024, max_kb))
    ext = src.suffix.lower()
    if ext in (".html", ".htm"):
        svg = svg_from_html(src.read_text(encoding="utf-8"), src)
        return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode()
    if ext not in MEDIA_TYPES:
        sys.exit("unsupported image type %s (%s); use %s, or a /fig .html"
                 % (ext, src, " ".join(sorted(MEDIA_TYPES))))
    if ext == ".svg":
        raw = re.sub(r"(?is)<\?xml.*?\?>", "", src.read_text(encoding="utf-8")).strip()
        return "data:image/svg+xml;base64," + base64.b64encode(raw.encode("utf-8")).decode()
    return "data:%s;base64,%s" % (MEDIA_TYPES[ext], base64.b64encode(src.read_bytes()).decode())


def resolve_src(raw: str, base: pathlib.Path) -> pathlib.Path:
    """An <img src> value as a local path.

    src is a URL, not a path, so three forms turn up in practice: a plain
    relative path, a real absolute path, and a file:// url — which is exactly what
    this skill hands the user as a clickable link, so a model will copy one back.
    url2pathname is the stdlib's answer to the last one: it turns /C:/a%20b into a
    real Windows path, drive letter and percent-escapes included. Plain paths are
    tried verbatim first, so a filename with a literal % still resolves."""
    if raw.lower().startswith("file:"):
        return pathlib.Path(url2pathname(urlparse(raw).path))
    path = pathlib.Path(raw)
    src = path if path.is_absolute() else (base / path)
    if not src.is_file() and "%" in raw:
        alt = pathlib.Path(unquote(raw))
        src = alt if alt.is_absolute() else (base / alt)
    return src


def inline_media(content: str, base: pathlib.Path, max_kb: int) -> str:
    """Every <img src> that points at a local file becomes a data: URI.

    data: and http(s): sources are left alone — the first is already inline, and
    the second is the author explicitly opting out of a self-contained file."""
    done = []

    def sub(m):
        raw = m.group(2).strip()
        if re.match(r"(?i)^(data:|https?:|//)", raw):
            return m.group(0)
        src = resolve_src(raw, base)
        uri = data_uri(src.resolve(), max_kb)
        done.append((src.name, len(uri)))
        return "%s%s%s" % (m.group(1), uri, m.group(3))

    out = re.sub(r'(?is)(<img\b[^>]*?\bsrc\s*=\s*["\'])([^"\']+)(["\'])', sub, content)
    for name, n in done:
        print("inlined %s (%dKB)" % (name, n // 1024), file=sys.stderr)
    return out


def kit_css(brand_css: str) -> str:
    """KIT_REMOTE_IMPORT: a report is a standalone document that gets printed and
    emailed, so it must not depend on a font host. When the brand layer inlines
    real @font-face rules the kit's remote @import is redundant, and a blocked
    font host makes the browser hang before it will print."""
    css = KIT.read_text(encoding="utf-8")
    if brand_css and "@font-face" in brand_css:
        css = re.sub(r"@import\s+url\(['\"]?https://fonts\.googleapis\.com[^)]*\);?", "", css)
    return css

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("content", help="path to the content HTML fragment (building blocks only, no <style>)")
    ap.add_argument("-o", "--out", default="report.html", help="output file (default: ./report.html)")
    ap.add_argument("--lang", choices=["fa", "en"], default="fa")
    ap.add_argument("--title", default=None, help="page <title> (defaults to first <h2> text or a generic title)")
    ap.add_argument("--no-brand", action="store_true", help="ignore any project .readable brand layer")
    ap.add_argument("--max-image-kb", type=int, default=2048,
                    help="per-image cap before the build refuses (default 2048)")
    a = ap.parse_args()

    src = pathlib.Path(a.content).resolve()
    content = src.read_text(encoding="utf-8").strip()
    if "<style" in content.lower() or "<script" in content.lower():
        sys.exit("content must be building-block HTML only: no <style> or <script>")
    # Images and /fig motion become data: URIs so the report stays one offline
    # file, the same reason the brand layer inlines its font bytes. Runs BEFORE
    # the title sniff so a src full of angle brackets cannot confuse it.
    content = inline_media(content, src.parent, a.max_image_kb)

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
        .replace("{{KIT}}", kit_css(brand_css))
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
