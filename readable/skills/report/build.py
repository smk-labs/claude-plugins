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

Live previews are verified, not hoped for (5.6.0): a <div class="preview live">
holds an <iframe> of another page, and a target that refuses framing renders an
empty box. Runtime cannot tell - a blocked frame still fires load, its document
is cross-origin either way, and a file:// report cannot fetch the url to look -
so THIS script reads the headers at build time and drops the block when framing
is refused or the target cannot be reached. The plain card above it stays, which
is the whole point of the two being siblings. --no-preview-probe skips the
network entirely and keeps every frame.

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
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from urllib.parse import quote, unquote, urlparse
from urllib.request import url2pathname

HERE = pathlib.Path(__file__).resolve().parent
KIT = HERE.parents[1] / "assets" / "rc.css"
MENU = HERE.parents[1] / "assets" / "menu.js"
EMAIL = HERE.parents[1] / "assets" / "email.js"
SHELL = HERE / "assets" / "shell.html"

BRAND_HEAD_CSS = (
    ".brand{display:flex;align-items:center;gap:9px;margin:0 4px 12px;color:var(--text-primary)}\n"
    ".brand svg,.brand img{width:22px;height:22px;display:block;flex:none}\n"
    ".brand b{font-size:14.5px;font-weight:800}\n"
    ".brand span{font-size:11px;color:var(--text-secondary);border-inline-start:1px solid var(--border-strong);padding-inline-start:9px}\n"
)


# The css2 api serves woff2 only to a browser UA; anything else gets ttf, which
# is three times the bytes. Same UA and subset allowlist the card server uses.
FONT_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
FONT_SUBSETS = ("arabic", "latin", "latin-ext")
FACE_RE = re.compile(r"(?s)(?:/\*\s*([\w-]+)\s*\*/\s*)?@font-face\s*\{([^}]*)\}")
# The url is matched by its format() marker, not by a .woff2 suffix: the css2
# api's text= subsetting answers with /l/font?kit=... and no extension at all.
WOFF2_RE = re.compile(r"""(?i)url\((https://[^)\s]+)\)\s*format\(['"]?woff2""")
FIG_FONT_CAP = 256 * 1024


def http_get(url: str, timeout: float):
    """One GET with a browser UA, or None. Never raises and never hangs.

    Every caller is doing something optional-but-better (embedding a face so the
    report survives offline), so a dead network has to degrade into a decision
    the caller can explain, not a traceback and not a stalled build."""
    req = urllib.request.Request(url, headers={"User-Agent": FONT_UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except (urllib.error.URLError, OSError, ValueError):
        return None


def google_faces(spec: str, timeout: float, text: str = None):
    """@font-face css for a Google Fonts family with the woff2 bytes inlined.

    A report is a standalone document that gets printed and emailed, so it must
    not depend on reaching a font host: a blocked cdn makes the browser hang
    before it will print, and every Persian glyph lands in Tahoma. Returns None
    when the network is unavailable, so the caller decides what to say about it.

    `text` uses the css2 api's own subsetting. Passing the exact characters a
    figure letters returns roughly 5KB instead of the ~400KB the whole family
    costs, which is what makes folding a face into a figure affordable at all."""
    url = "https://fonts.googleapis.com/css2?family=" + spec.replace(" ", "+")
    if text:
        # Whitespace only: the api rejects a text= carrying the newlines and
        # indentation that sit between a figure's <text> elements.
        glyphs = "".join(sorted({c for c in text if not c.isspace()}))
        if not glyphs:
            return None
        url += "&text=" + quote(glyphs)
    else:
        url += "&display=swap"
    sheet = http_get(url, timeout)
    if sheet is None:
        return None
    out = ""
    for subset, body in FACE_RE.findall(sheet.decode("utf-8", "replace")):
        if subset and subset not in FONT_SUBSETS:
            continue
        m = WOFF2_RE.search(body)
        if not m:
            continue
        raw = http_get(m.group(1), timeout)
        if raw is None:
            return None
        out += "@font-face{%s}" % body.strip().replace(
            m.group(1), "data:font/woff2;base64," + base64.b64encode(raw).decode())
    return out or None


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


def brand_blocks(brand_dir: pathlib.Path, lang: str, timeout: float = 12.0):
    """(style_css, header_html) for the shell's {{BRAND}}/{{BRANDHEAD}} slots.
    brand.css is authored card-first (:root + bare [data-theme="dark"]); the
    report shell adds system-preference dark, so the dark block is mirrored
    into a prefers-color-scheme media query for un-toggled viewers.

    A google-only brand font is fetched and inlined here (5.3.0). 5.2.0 carried
    the comment about being print-safe and then inlined nothing, because the
    loop reads font.files and a google-only brand has none: the family was
    declared, never loaded, and the page silently leaned on the kit's remote
    @import surviving kit_css. Offline, that is every Persian glyph in Tahoma."""
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
    faces = ""
    for weight, rel in (font.get("files") or {}).items():
        f = brand_dir / rel
        if not f.is_file():
            sys.exit("brand font file missing: %s" % f)
        faces += (
            '\n@font-face{font-family:"%s";src:url("data:font/woff2;base64,%s") format("woff2");'
            "font-weight:%s;font-style:normal;font-display:swap}"
            % (font.get("family", "Brand"), base64.b64encode(f.read_bytes()).decode(), weight)
        )
    if font.get("google") and not faces:
        # PRINT-SAFE: no remote @import. The faces really are inlined now.
        got = google_faces(font["google"], timeout)
        if got:
            faces += "\n" + got
        else:
            # The other half of the contract: say so. Silence here is what let a
            # report ship declaring a family it never loaded. Emitting no
            # @font-face also leaves the kit's @import in place (see kit_css), so
            # the page still renders online instead of not at all.
            print('warning: could not fetch the brand font "%s" from Google Fonts.\n'
                  "  The report keeps the remote @import, so it needs the network to render\n"
                  "  in that family and will not be print-safe. Add font.files to\n"
                  "  %s to inline it for good."
                  % (font["google"], brand_dir / "brand.json"), file=sys.stderr)
    css += faces
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


KIT_FONT = {"fa": "Vazirmatn", "en": "Inter"}


def report_font(brand_dir, no_brand: bool, lang: str):
    """(family, google spec, local files) for the face the report body renders in.

    A figure must letter in the same typeface as the paragraph beside it, and the
    figure is its own document, so it needs its own copy of that face rather than
    a reference to the page's."""
    if brand_dir and not no_brand:
        f = brand_dir / "brand.json"
        if f.is_file():
            try:
                meta = json.loads(f.read_text(encoding="utf-8")).get("font") or {}
            except (ValueError, OSError):
                meta = {}
            if meta.get("family"):
                files = {str(w): brand_dir / r for w, r in (meta.get("files") or {}).items()}
                return (meta["family"], meta.get("google"), files or None)
    fam = KIT_FONT[lang]
    return (fam, "%s:wght@400" % fam, None)


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


def inline_js(src: pathlib.Path) -> str:
    """A shared asset (assets/menu.js, assets/email.js) inlined into the report.
    Both files hold their block comments on whole lines of their own, which is
    the contract that makes this safe: drop those lines, keep the newlines
    (a report has no size ceiling, so nothing else needs squeezing)."""
    out = []
    for line in src.read_text(encoding="utf-8").split("\n"):
        s = line.strip()
        if s.startswith("/*") and s.endswith("*/"):
            continue
        out.append(line)
    return "\n".join(out)

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
FALLBACK = {"fa": "Tahoma,sans-serif", "en": "system-ui,sans-serif"}


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


def root_style(svg: str, decl: str) -> str:
    """One css declaration onto the <svg> element itself, where the embedded
    document will actually read it. Left alone if the author already set that
    property. Prepended, so an existing style attribute keeps winning."""
    prop = decl.split(":", 1)[0].strip()

    def add(m):
        tag = m.group(0)
        if re.search(r"(?i)\b%s\s*:" % re.escape(prop), tag):
            return tag
        style = re.search(r'(?is)\bstyle\s*=\s*(["\'])(.*?)\1', tag)
        if style:
            # A quoted font family inside a quoted attribute closes it early and
            # invalidates the whole document. Whichever quote delimits the
            # attribute becomes its entity; both parsers resolve it back.
            q = style.group(1)
            safe = decl.replace(q, "&quot;" if q == '"' else "&apos;")
            return tag[:style.start(2)] + safe + ";" + tag[style.start(2):]
        return tag[:-1].rstrip() + ' style="%s"' % decl.replace('"', "&quot;") + tag[-1]
    return re.sub(r"(?is)<svg\b[^>]*>", add, svg, count=1)


def rtl_root(svg: str) -> str:
    """direction:rtl on the lifted root: an <img>-embedded svg inherits none."""
    return root_style(svg, "direction:rtl")


def svg_text(svg: str) -> str:
    """Every character the figure actually letters, tags stripped."""
    return re.sub(r"(?s)<[^>]*>", "",
                  "".join(re.findall(r"(?is)<text[^>]*>(.*?)</text\s*>", svg)))


def figure_font(svg: str, font, timeout: float, src: pathlib.Path):
    """(css, needs_root_family) so the figure letters in the REPORT's font.

    shell.html already spells the mechanism out for the PNG export: an
    svg-as-image cannot load an external @import font, so it rasterizes in a
    system fallback. That is just as true of every inlined figure, and nothing
    handled it, so Persian figure text sat in a system serif beside a Vazirmatn
    paragraph. The face is subsetted to the characters this figure letters, so
    the cost is a few KB rather than the whole family.

    `needs_root_family` is False when the figure already names a font anywhere:
    a figure that chose its own typeface keeps it, and only the ones that named
    nothing (and were therefore rendering in the svg default) get the report's."""
    family, spec, files = font
    label = svg_text(svg)
    if not label.strip():
        return "", False
    css = ""
    if files:
        # A local brand file: fold ONE weight, not four. A figure letters a
        # handful of words and cannot justify 400KB of family.
        pick = files.get("400") or files.get(400) or list(files.values())[0]
        if pick.is_file() and pick.stat().st_size <= FIG_FONT_CAP:
            css = ('@font-face{font-family:"%s";src:url("data:font/woff2;base64,%s") '
                   'format("woff2");font-weight:400;font-style:normal}'
                   % (family, base64.b64encode(pick.read_bytes()).decode()))
    elif spec:
        css = google_faces(spec, timeout, text=label) or ""
        if not css:
            print("warning: %s could not embed the report font, so its text will render in a\n"
                  "  system fallback. Build online once, or pass --no-figure-font to silence\n"
                  "  this." % src, file=sys.stderr)
    if css and len(css) > FIG_FONT_CAP:
        print("warning: %s: the embedded font came back at %dKB, over the %dKB figure cap;\n"
              "  skipped." % (src, len(css) // 1024, FIG_FONT_CAP // 1024), file=sys.stderr)
        css = ""
    return css, not re.search(r"(?i)font-family", svg)


NS_SKIP = {"none", "inherit", "initial", "unset", "currentcolor"}


def namespace_svg(svg: str, prefix: str) -> str:
    """Prefix every class, id and @keyframes name the figure declares.

    Inline svg shares the page cascade, which is the one thing <img> was buying:
    a /fig class called .s or .l or .t would otherwise land straight on top of
    the kit's own. Renaming what the figure declares is cheaper than isolation
    and survives a host that blocks data: images or strips <style>."""
    names = set(re.findall(r'(?is)\bclass\s*=\s*["\']([^"\']+)["\']', svg))
    classes = {c for group in names for c in group.split() if c}
    frames = set(re.findall(r"(?i)@(?:-\w+-)?keyframes\s+([\w-]+)", svg))
    ids = set(re.findall(r'(?is)\bid\s*=\s*["\']([^"\']+)["\']', svg))

    def rename(m):
        return m.group(1) + prefix + m.group(2)

    for c in sorted(classes, key=len, reverse=True):
        svg = re.sub(r"(\.)(%s)(?![\w-])" % re.escape(c), rename, svg)
    svg = re.sub(r'(?is)(\bclass\s*=\s*["\'])([^"\']+)(["\'])',
                 lambda m: m.group(1) + " ".join(prefix + c for c in m.group(2).split()) + m.group(3),
                 svg)
    for i in sorted(ids, key=len, reverse=True):
        svg = re.sub(r"(#)(%s)(?![\w-])" % re.escape(i), rename, svg)
    svg = re.sub(r'(?is)(\bid\s*=\s*["\'])([^"\']+)(["\'])',
                 lambda m: m.group(1) + prefix + m.group(2) + m.group(3), svg)
    # Only names actually declared as keyframes get renamed, so an `animation`
    # shorthand keeps its timing function and its `infinite` untouched.
    for f in sorted(frames, key=len, reverse=True):
        if f.lower() in NS_SKIP:
            continue
        svg = re.sub(r"(?<![\w-])(%s)(?![\w-])" % re.escape(f), prefix + r"\1", svg)
    return svg


def uncdata(svg: str) -> str:
    """Drop the CDATA fences we added. Inline in an html document, <style> is
    already raw text, and the fence would be read as a css rule and eat the
    first one. The xml validation ran on the fenced copy either way."""
    return svg.replace("<![CDATA[", "").replace("]]>", "")


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


def svg_from_html(text: str, src: pathlib.Path, lang: str = "fa",
                  font=None, timeout: float = 12.0, prefix: str = None) -> str:
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
    they had in the source document - the inner block keeps winning ties.

    `font` folds the report's own face in so the figure letters in the same
    typeface as the paragraph beside it; `prefix` namespaces the figure for the
    inline path, where the isolation <img> used to provide is gone."""
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
    if prefix:
        svg = namespace_svg(svg, prefix)
    if font:
        face, needs_family = figure_font(svg, font, timeout, src)
        if face:
            svg = re.sub(r"(?is)(<svg\b[^>]*>)",
                         r"\1<style>%s</style>" % cdata(face).replace("\\", "\\\\"),
                         svg, count=1)
        if needs_family and face:
            # Only a figure that named no typeface at all. One that chose its own
            # keeps it; this is for the ones that were silently in the svg default.
            svg = root_style(svg, "font-family:'%s',%s" % (font[0], FALLBACK[lang]))
    # Validated fenced, always, so switching embed mode can never change whether
    # a figure builds. The fences come back off below for the inline path.
    check_xml(svg, src, None)
    warn_motionless(text, svg, src)
    return uncdata(svg) if prefix else svg


def data_uri(src: pathlib.Path, max_kb: int, lang: str = "fa", font=None,
             timeout: float = 12.0) -> str:
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
        svg = svg_from_html(src.read_text(encoding="utf-8"), src, lang, font, timeout)
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


SRC_RE = re.compile(r'(?is)(<img\b[^>]*?\bsrc\s*=\s*["\'])([^"\']+)(["\'])')


def root_attr(svg: str, name: str, value: str) -> str:
    """One attribute on the <svg> root, if it does not already carry it."""
    m = re.match(r"(?is)<svg\b[^>]*>", svg)
    if not m or re.search(r"(?i)\b%s\s*=" % re.escape(name), m.group(0)):
        return svg
    tag = m.group(0)
    return (tag[:-1].rstrip() + ' %s="%s"' % (name, value.replace('"', "&quot;"))
            + tag[-1] + svg[m.end():])


def inline_media(content: str, base: pathlib.Path, max_kb: int, lang: str,
                 font=None, timeout: float = 12.0, inline_svg: bool = False) -> str:
    """Every <img src> that points at a local file becomes a data: URI.

    data: and http(s): sources are left alone — the first is already inline, and
    the second is the author explicitly opting out of a self-contained file.
    lang travels this far because a lifted /fig svg inherits no direction from
    the page it is embedded in, and a Persian report is the last clue there is.

    --inline-figures writes the figure's markup straight into the document
    instead. A data: URI is one point of failure with two common hosts behind it:
    a CSP whose img-src omits data: blocks the image outright, and a sanitiser
    that strips <style> from an svg takes every fill and stroke with it. Inline
    markup survives both, which is why the observed portal showed an empty box.
    The kit already sizes `.rc figure svg` exactly like `.rc img`, so nothing in
    the stylesheet moves; what inline costs is the page cascade, and
    namespace_svg pays that by renaming what the figure declares."""
    done = []
    seen = [0]

    def one(m):
        tag = m.group(0)
        s = SRC_RE.match(tag)
        if not s:
            return tag
        raw = s.group(2).strip()
        if re.match(r"(?i)^(data:|https?:|//)", raw):
            return tag
        src = resolve_src(raw, base).resolve()
        if inline_svg and src.suffix.lower() in (".html", ".htm"):
            if not src.is_file():
                sys.exit("image not found: %s" % src)
            seen[0] += 1
            svg = svg_from_html(src.read_text(encoding="utf-8"), src, lang, font,
                                timeout, prefix="fig%d-" % seen[0])
            alt = re.search(r'(?is)\balt\s*=\s*["\']([^"\']*)["\']', tag)
            if alt and alt.group(1).strip():
                svg = root_attr(svg, "role", "img")
                svg = root_attr(svg, "aria-label", alt.group(1).strip())
            done.append((src.name, len(svg), "inline"))
            return svg
        uri = data_uri(src, max_kb, lang, font, timeout)
        done.append((src.name, len(uri), "data:"))
        return tag[:s.end(1)] + uri + tag[s.start(3):]

    out = re.sub(r"(?is)<img\b[^>]*>", one, content)
    for name, n, how in done:
        print("inlined %s (%dKB, %s)" % (name, n // 1024, how), file=sys.stderr)
    return out


# @PREVIEW (5.6.0). Previews never nest an anchor or a div, so a non-greedy
# element match is safe and no parser is needed.
PREVIEW_A_RE = re.compile(r"(?is)(<a\b[^>]*>)(.*?)(</a\s*>)")
# The live block is matched by its OWN class pair, in either order, and never by
# a generic <div>: re.sub consumes what it matches, so a generic div pattern
# would swallow a `cards` wrapper whole and never see a live block nested in it.
PREVIEW_LIVE_RE = re.compile(
    r"""(?is)<div\b[^>]*\bclass\s*=\s*["'][^"']*"""
    r"""\b(?:preview[^"']*\blive|live[^"']*\bpreview)\b[^"']*["'][^>]*>.*?</div\s*>""")
CLASS_RE = re.compile(r"""(?is)\bclass\s*=\s*["']([^"']*)["']""")
HREF_RE = re.compile(r"""(?is)\bhref\s*=\s*["']([^"']*)["']""")
IFRAME_SRC_RE = re.compile(r"""(?is)<iframe\b[^>]*\bsrc\s*=\s*["']([^"']*)["']""")
XFO_DENY = ("deny", "sameorigin", "allow-from")


def has_class(tag: str, want: str) -> bool:
    """True when the tag's class attribute carries `want` as a whole token."""
    m = CLASS_RE.search(tag)
    return bool(m) and want in m.group(1).split()


def frames_ok(url: str, timeout: float):
    """(True, note) when `url` can be framed by a standalone report, else (False, why).

    A report is opened from disk, so its origin is `null`: it can never satisfy a
    host allowlist, and only `frame-ancestors *` or no policy at all lets it
    through. Unreachable counts as refusing, because the failure it prevents (an
    empty box in a finished document) is worse than the one it causes (a card
    without its picture, which still reads)."""
    req = urllib.request.Request(url, headers={"User-Agent": FONT_UA})
    try:
        # Headers arrive before the body and the body is never read: the probe
        # costs one round trip, not the page. A 4xx/5xx still carries the
        # framing headers (the portal answers 405 to a HEAD and 200 to a GET),
        # so HTTPError is inspected rather than treated as a failure.
        with urllib.request.urlopen(req, timeout=timeout) as r:
            headers = r.headers
    except urllib.error.HTTPError as e:
        headers = e.headers
    except (urllib.error.URLError, OSError, ValueError) as e:
        return False, "unreachable (%s)" % (getattr(e, "reason", None) or e,)
    xfo = (headers.get("x-frame-options") or "").strip().lower()
    if xfo.split()[0:1] and xfo.split()[0] in XFO_DENY:
        return False, "x-frame-options: %s" % xfo
    for policy in headers.get_all("content-security-policy") or []:
        for directive in policy.split(";"):
            parts = directive.split()
            if parts[0:1] and parts[0].lower() == "frame-ancestors":
                if [p for p in parts[1:] if p != "*"]:
                    return False, "csp frame-ancestors: %s" % " ".join(parts[1:])
    return True, ""


def preview_pass(content: str, probe: bool, timeout: float) -> str:
    """Fill in each preview card's host, and drop live frames that cannot load.

    The host comes off the href for the same reason section numbers come off a
    counter: the document already holds the fact, so nobody has to type it and
    nobody can mistype it."""
    def card(m):
        open_tag, inner, close = m.groups()
        if not has_class(open_tag, "preview") or "<small" in inner.lower():
            return m.group(0)
        href = HREF_RE.search(open_tag)
        host = urlparse(href.group(1)).hostname if href else None
        if not host:
            return m.group(0)
        return open_tag + inner + "<small>" + host + "</small>" + close

    content = PREVIEW_A_RE.sub(card, content)

    def live(m):
        block = m.group(0)
        src = IFRAME_SRC_RE.search(block)
        if not src:
            print("preview: live block with no iframe src, dropped", file=sys.stderr)
            return ""
        url = src.group(1)
        if "title=" not in block.lower():
            print("preview: <iframe> without a title, %s" % url, file=sys.stderr)
        if not probe or not url.lower().startswith(("http://", "https://")):
            return block
        ok, why = frames_ok(url, timeout)
        if ok:
            return block
        print("preview: %s refuses framing (%s), kept the plain card"
              % (url, why), file=sys.stderr)
        return ""

    return PREVIEW_LIVE_RE.sub(live, content)


def kit_css(brand_css: str) -> str:
    """KIT_REMOTE_IMPORT: a report is a standalone document that gets printed and
    emailed, so it must not depend on a font host. When the brand layer inlines
    real @font-face rules the kit's remote @import is redundant, and a blocked
    font host makes the browser hang before it will print.

    The @font-face test IS the contract, not a coincidence: the import survives
    exactly when no face was embedded, which is the one case the page still needs
    it. brand_blocks leans on that when a google font cannot be fetched."""
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
    ap.add_argument("--inline-figures", action="store_true",
                    help="write /fig markup into the document instead of <img src=data:>; "
                         "survives a CSP without data: and a sanitiser that strips <style>")
    ap.add_argument("--no-figure-font", action="store_true",
                    help="do not embed the report font into figures")
    ap.add_argument("--no-preview-probe", action="store_true",
                    help="keep every live preview frame without checking whether "
                         "its target allows framing (skips the network)")
    ap.add_argument("--font-timeout", type=float, default=12.0,
                    help="seconds per font request before giving up (default 12)")
    a = ap.parse_args()

    src = pathlib.Path(a.content).resolve()
    content = src.read_text(encoding="utf-8").strip()
    if "<style" in content.lower() or "<script" in content.lower():
        sys.exit("content must be building-block HTML only: no <style> or <script>")
    # The brand resolves FIRST now: a figure is its own document and needs its own
    # copy of the report's face, so inline_media has to know what that face is.
    brand_dir = find_brand(src.parent) or find_brand(pathlib.Path.cwd())
    brand_css, brand_head = "", ""
    if brand_dir and not a.no_brand:
        brand_css, brand_head = brand_blocks(brand_dir, a.lang, a.font_timeout)

    # Images and /fig motion become data: URIs so the report stays one offline
    # file, the same reason the brand layer inlines its font bytes. Runs BEFORE
    # the title sniff so a src full of angle brackets cannot confuse it.
    font = None if a.no_figure_font else report_font(brand_dir, a.no_brand, a.lang)
    content = inline_media(content, src.parent, a.max_image_kb, a.lang,
                           font, a.font_timeout, a.inline_figures)

    # Previews: fill each card's host in from its own href, and drop any live
    # frame whose target refuses to be framed. Runs before the signature is
    # appended so a dropped frame cannot take it with it.
    content = preview_pass(content, not a.no_preview_probe, a.font_timeout)

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
        .replace("{{MENU}}", inline_js(MENU))
        .replace("{{EMAIL}}", inline_js(EMAIL))
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
