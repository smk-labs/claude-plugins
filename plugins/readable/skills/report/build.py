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
reskinned with it automatically - palette overrides, an optional logo/wordmark
header, and font files inlined as data URIs so the output stays one offline
file. --no-brand keeps the stock look.

Signature (5.2.0): one muted line, appended as the last child of .rc from the
kit's own @sig marker (assets/rc.css). A project opts out with
"signature": false in .readable/brand.json.

Inlined figures are their own document (5.2.1): once base64'd into an
<img src="data:image/svg+xml">, the lifted svg is parsed as strict XML, runs no
script, and inherits nothing from the report page. So the build validates the
XML and refuses on a parse error, wraps folded css in CDATA, carries the fig's
text direction onto the svg root, and warns when a figure's only motion is
JavaScript.
"""
import argparse
import base64
import datetime
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
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


def signature() -> str:
    """The readable signature line, read from the kit's @sig marker.

    THE single source (assets/rc.css); nothing here is hand-written, so the report
    and the chat card can never drift apart. Anchored on the '<' because the
    comment surrounding the marker talks about @sig too."""
    m = re.search(r"@sig[ \t]+(<[^\n\r]+)", KIT.read_text(encoding="utf-8"))
    if not m:
        sys.exit("assets/rc.css is missing its @sig signature line")
    return m.group(1).strip()


def sig_off(brand_dir) -> bool:
    """A project opts out with "signature": false in .readable/brand.json.

    One committable flag, the same key the card server reads, so a client-facing
    project turns the toolmaker's mark off once for cards AND reports. Deliberately
    independent of --no-brand: attribution is a project policy, not a look."""
    if not brand_dir:
        return False
    f = brand_dir / "brand.json"
    if not f.is_file():
        return False
    try:
        return json.loads(f.read_text(encoding="utf-8")).get("signature") is False
    except (ValueError, OSError):
        return False


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


SVG_NS = "{http://www.w3.org/2000/svg}svg"
STYLE_RE = re.compile(r"(?is)<style[^>]*>(.*?)</style\s*>")
# Hebrew, Arabic (+ supplement/extended), Syriac, Thaana, and the presentation forms.
RTL_SCRIPT = re.compile(r"[֐-׿؀-޿ࡠ-ࣿיִ-﷿ﹰ-ﻼ]")
DIR_ATTR = re.compile(r'(?is)<(?:html|body|svg)\b[^>]*\bdir\s*=\s*["\']?(rtl|ltr)')
# direction:rtl, but only in a rule that sets it on the whole document.
DIR_RULE = re.compile(r"(?is)(?:^|[}\s,])(?::root|html|body|svg|\*)[^{}]*\{[^{}]*\bdirection\s*:\s*rtl")
KEYFRAMES = re.compile(r"(?i)@(?:-\w+-)?keyframes\b")
SMIL = re.compile(r"(?i)<(?:animate[a-z]*|set)\b")


BAD_AMP = re.compile(r"&(?![A-Za-z#]\w{0,31};)")


def culprit(svg: str):
    """Index of the first character inside a <style> that xml cannot hold.

    expat reports where it NOTICED the damage, the </style> that closed the
    wrong element, which can be several lines past the '<' that caused it. For
    the one mistake authors actually make, a bare '<' or '&' in css, the
    character itself is findable, so that is the position worth printing."""
    for m in STYLE_RE.finditer(svg):
        body, at = m.group(1), m.start(1)
        if body.lstrip().startswith("<![CDATA["):
            continue                       # already folded by us; '<' is legal in there
        amp = BAD_AMP.search(body)
        hits = [i for i in (body.find("<"), amp.start() if amp else -1) if i >= 0]
        if hits:
            return at + min(hits)
    return None


def check_xml(svg: str, src: pathlib.Path, prefix: str):
    """The lifted svg, parsed as the browser will parse it, or the build stops.

    Base64'd into an <img>, the svg is no longer a fragment of a lenient html
    parse: it is its own document, and expat is strict. One bare '<' or '&'
    anywhere - a CSS comment mentioning <img> counts - closes <style> early and
    the whole figure renders as alt text behind a broken-image glyph. Silently.
    Failing loudly here is the whole point of this module's fail-fast contract;
    `prefix` is the source text before the svg, so the reported line and column
    land on the offending character in the fig file itself, not in a lifted
    fragment the author never wrote.

    No DTD, ever. xml.etree already refuses to fetch external entities, and a
    lifted <svg> has no business carrying a doctype; refusing one keeps entity
    expansion out of the parser entirely, which is the whole reason a defusedxml
    dependency would otherwise be argued for."""
    if re.search(r"(?i)<!DOCTYPE\b", svg):
        sys.exit("%s: the lifted <svg> carries a <!DOCTYPE>. Remove it: a figure needs no\n"
                 "  DTD, and the build will not hand one to the xml parser." % src)
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as e:
        # expat's own numbers otherwise, only re-based onto the file. They land
        # on the bad character read as an editor's 1-based column and agree with
        # what xmllint prints. expat also repeats its position inside the
        # message, relative to the lifted fragment: that copy goes, because two
        # coordinate systems in one error help nobody.
        at = culprit(svg)
        if at is None:
            line, col, why = e.position[0], e.position[1], e.msg.split(": line ")[0]
        else:
            line, col = svg.count("\n", 0, at) + 1, at - svg.rfind("\n", 0, at)
            why = "a bare '%s' inside <style>" % svg[at]
        if prefix is not None:
            if line == 1:
                col += len(prefix) - prefix.rfind("\n") - 1
            line += prefix.count("\n")
        sys.exit("%s: line %d, column %d: %s\n"
                 "  the <svg> is not well-formed XML. Inlined into <img> it becomes its own\n"
                 "  document and is parsed strictly, so a bare '<' or '&' (yes, inside a css\n"
                 "  comment too) breaks it. Write &lt; and &amp;."
                 % (src, line, col, why))
    return root


def cdata(css: str) -> str:
    """Folded css as a CDATA section, so ordinary css cannot break the parse.

    Escaping every '<' and '&' would edit the author's stylesheet; CDATA takes it
    verbatim. The one sequence CDATA cannot hold is ']]>', which is re-split
    across two sections rather than stripped: nothing is ever removed."""
    return "<![CDATA[" + css.replace("]]>", "]]]]><![CDATA[>") + "]]>"


def fig_rtl(text: str, svg: str, lang: str) -> bool:
    """Does this figure read right-to-left?

    `dir` is an html attribute and the report page's own direction stops at the
    <img> boundary, so an RTL fig loses its direction the moment it is inlined.
    text-anchor:start then means "left" instead of "right" and every label lands
    on the wrong side of its anchor, overlapping its neighbours - by eye only,
    with nothing in the build to say so. The fix is to carry what the SOURCE
    document declared, which is the only rule under which the embedded figure
    renders like the standalone one. An explicit ltr wins, because it is a
    deliberate choice. A Persian report is the last resort, for a fig that
    declares nothing and letters RTL text."""
    dirs = [d.lower() for d in DIR_ATTR.findall(text)]
    if "rtl" in dirs or DIR_RULE.search(text):
        return True
    if "ltr" in dirs:
        return False
    return lang == "fa" and bool(RTL_SCRIPT.search(svg))


def rtl_root(svg: str) -> str:
    """direction:rtl on the <svg> element itself, where the embedded document
    will actually read it. Left alone if the author already set one."""
    def add(m):
        tag = m.group(0)
        if re.search(r"(?i)\bdirection\s*:", tag):
            return tag
        style = re.search(r'(?is)\bstyle\s*=\s*(["\'])(.*?)\1', tag)
        if style:
            return tag[:style.start(2)] + "direction:rtl;" + tag[style.start(2):]
        return tag[:-1].rstrip() + ' style="direction:rtl"' + tag[-1]
    return re.sub(r"(?is)<svg\b[^>]*>", add, svg, count=1)


def in_script(text: str, at: int) -> bool:
    """Does this offset sit inside a <script> block?"""
    return any(m.start() < at < m.end()
               for m in re.finditer(r"(?is)<script\b.*?</script\s*>", text))


def warn_motionless(text: str, svg: str, src: pathlib.Path):
    """A figure whose only motion is JavaScript ships as a still frame.

    No script runs inside <img>, so React, rAF and every timer are dead there.
    A warning and not an exit: a deliberately static figure is legitimate, and a
    /fig file that also happens to carry an unrelated <script> is not a defect."""
    if not re.search(r"(?i)<script\b", text):
        return
    if KEYFRAMES.search(svg) or SMIL.search(svg):
        return
    print("warning: %s drives its motion from JavaScript, which never runs inside <img>.\n"
          "  It will be inlined as a single still frame. Animate it with css @keyframes\n"
          "  or SMIL <animate> INSIDE the <svg> instead." % src, file=sys.stderr)


def svg_from_html(text: str, src: pathlib.Path, lang: str = "fa") -> str:
    """The <svg> out of a /fig file, made self-contained.

    /fig writes ONE html file whose animation css usually lives in the document
    <style>, not inside the svg. Lifting the svg out on its own would therefore
    drop the motion, so every <style> in the document is folded into the svg as a
    child. That also isolates it: the svg becomes its own document inside <img>,
    so a /fig class name can never land in the report's cascade next to the kit's
    own .s/.l/.t.

    Folded ALWAYS, including when the svg carries a <style> of its own: skipping
    the fold there (the old guard) silently dropped whatever the document block
    held, and @keyframes living outside the svg is exactly how /fig writes them,
    so the figure shipped motionless and looked like a design choice. The outer
    rules go in as the FIRST child, ahead of the svg's own, which is the order
    they had in the source document - the inner block keeps winning ties."""
    m = re.search(r"(?is)<svg\b.*?</svg\s*>", text)
    if not m:
        sys.exit("no <svg> found in %s: /fig output is expected to contain one" % src)
    svg = m.group(0)
    # A fig 1.0.0 figure: the only <svg> in the file is JSX inside a <script>,
    # so what gets lifted is source code (cx={90 + t * 50}), not markup. 5.2.0
    # base64'd that straight into the report. Named for what it is, because
    # "escape your angle brackets" is useless advice for a React figure.
    if in_script(text, m.start()):
        sys.exit("%s: the only <svg> here is JSX inside a <script>, not markup.\n"
                 "  An <img> gets no React, no Babel and no CDN, so there is nothing to\n"
                 "  lift. Rebuild it as a plain <svg> animated with css @keyframes (the\n"
                 "  /fig stack since fig 1.1.0)." % src)
    root = check_xml(svg, src, text[:m.start()])
    if root.tag != SVG_NS:
        sys.exit('%s: the <svg> has no xmlns="http://www.w3.org/2000/svg".\n'
                 "  An html parser forgives that; an <img> pointing at an svg document does\n"
                 "  not render at all without it." % src)
    outside = text[:m.start()] + text[m.end():]
    styles = "".join(s for s in STYLE_RE.findall(outside) if "<svg" not in s)
    if styles:
        folded = cdata(styles).replace("\\", "\\\\")
        svg = re.sub(r"(?is)(<svg\b[^>]*>)", r"\1<style>%s</style>" % folded, svg, count=1)
    if fig_rtl(text, svg, lang):
        svg = rtl_root(svg)
    check_xml(svg, src, None)
    warn_motionless(text, svg, src)
    return svg


def data_uri(src: pathlib.Path, max_kb: int, lang: str = "fa") -> str:
    """One local file as a data: URI, so the report stays a single offline file.

    Fails loudly rather than leaving the reference: a report that silently ships a
    broken <img> is worse than one that refuses to build. --max-image-kb raises
    the cap when a big screenshot is genuinely wanted. For a /fig .html that
    contract runs all the way to the xml (see check_xml): existence and size were
    never the only ways a figure arrives dead."""
    if not src.is_file():
        sys.exit("image not found: %s" % src)
    size = src.stat().st_size
    if size > max_kb * 1024:
        sys.exit("image too large: %s is %dKB, cap is %dKB (raise it with --max-image-kb)"
                 % (src, size // 1024, max_kb))
    ext = src.suffix.lower()
    if ext in (".html", ".htm"):
        svg = svg_from_html(src.read_text(encoding="utf-8"), src, lang)
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


def inline_media(content: str, base: pathlib.Path, max_kb: int, lang: str) -> str:
    """Every <img src> that points at a local file becomes a data: URI.

    data: and http(s): sources are left alone — the first is already inline, and
    the second is the author explicitly opting out of a self-contained file.
    lang travels this far because a lifted /fig svg inherits no direction from
    the page it is embedded in, and a Persian report is the last clue there is."""
    done = []

    def sub(m):
        raw = m.group(2).strip()
        if re.match(r"(?i)^(data:|https?:|//)", raw):
            return m.group(0)
        src = resolve_src(raw, base)
        uri = data_uri(src.resolve(), max_kb, lang)
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
    content = inline_media(content, src.parent, a.max_image_kb, a.lang)

    brand_dir = find_brand(src.parent) or find_brand(pathlib.Path.cwd())
    brand_css, brand_head = "", ""
    if brand_dir and not a.no_brand:
        brand_css, brand_head = brand_blocks(brand_dir, a.lang)

    # SIGNATURE: the last child of .rc, exactly where the card template mounts it,
    # so the report's own menu exports (html / png / markdown / text / email all
    # serialize #card) carry it too. The .meta footer below sits OUTSIDE #card and
    # would have left every one of those exports unsigned.
    if not sig_off(brand_dir) and 'class="sig"' not in content:
        content = content + "\n" + signature()

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
