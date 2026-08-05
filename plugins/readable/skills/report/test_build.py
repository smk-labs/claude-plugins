#!/usr/bin/env python3
"""Regression tests for /fig inlining in build.py.

    python3 test_build.py

Stdlib unittest: nothing to install, the same contract as the card server's own
`node server/test.js`. Every figure below is a few lines of inline html rather
than a real /fig file, because all four build defects come from ONE fact - an
inlined svg is its own strictly-parsed, script-free, direction-less document -
and reproducing that needs no real figure.
"""
import base64
import contextlib
import io
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from urllib.parse import quote

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build  # noqa: E402

FIG = pathlib.Path("fig.html")
ROOT = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"'
MOTION = ".p{animation:p 6s infinite}@keyframes p{50%{opacity:.2}}"


def svg(inner, attrs=""):
    return '<svg %s%s>%s</svg>' % (ROOT, attrs, inner)


def doc(body, head="", html_attrs=""):
    return ('<!DOCTYPE html>\n<html lang="en"%s>\n<head><meta charset="utf-8">%s</head>\n'
            '<body>\n%s\n</body>\n</html>' % (html_attrs, head, body))


def lift(text, lang="en", font=None, prefix=None):
    return build.svg_from_html(text, FIG, lang, font, 5.0, prefix)


def lift_err(case, text, lang="en"):
    with case.assertRaises(SystemExit) as caught:
        lift(text, lang)
    return str(caught.exception)


def lift_warn(text, lang="en"):
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        out = lift(text, lang)
    return out, err.getvalue()


# ---------------------------------------------------------------- defect 1
class WellFormed(unittest.TestCase):
    """A figure that cannot be parsed as xml must stop the build, not ship."""

    def test_bare_angle_bracket_in_css_comment_fails_with_position(self):
        # The exact repro from the field: a css comment that mentions <img>.
        # </style> on source line 6 closes an <img> expat opened on line 5.
        text = doc(svg('<style>/* embedded in <img> it is its own document */\n'
                       '%s</style><circle r="8"/>' % MOTION))
        msg = lift_err(self, text)
        self.assertIn("not well-formed XML", msg)
        # Named on the '<' that caused it, not on the </style> four lines later
        # where expat happened to notice.
        self.assertIn("a bare '<' inside <style>", msg)
        line, col = self.at(msg)
        self.assertEqual("<img>", text.split("\n")[line - 1][col - 1:col + 4])

    def test_the_column_is_offset_when_the_error_is_on_the_svgs_own_line(self):
        # The svg starts mid-line, so column 1 of the fragment is not column 1
        # of the file: only this branch can get that wrong.
        text = doc(svg('<style>a{content:"&"}</style><circle r="8"/>'))
        line, col = self.at(lift_err(self, text))
        self.assertEqual("&", text.split("\n")[line - 1][col - 1])

    @staticmethod
    def at(msg):
        """(line, column) back out of the message, read as an editor would."""
        return (int(msg.split("line ")[1].split(",")[0]),
                int(msg.split("column ")[1].split(":")[0]))

    def test_expat_never_reports_two_coordinate_systems_at_once(self):
        msg = lift_err(self, doc(svg('<style>a{content:"&"}</style>')))
        self.assertEqual(1, msg.count("line "))

    def test_bare_ampersand_in_folded_css_cannot_break_the_parse(self):
        # Same character class, but in the DOCUMENT style, where cdata catches it.
        text = doc(svg('<circle r="8"/>'), head="<style>.a{content:'a & b'}</style>")
        ET.fromstring(lift(text))

    def test_folded_css_is_wrapped_in_cdata(self):
        text = doc(svg('<circle r="8"/>'), head="<style>%s</style>" % MOTION)
        self.assertIn("<style><![CDATA[%s]]></style>" % MOTION, lift(text))

    def test_cdata_terminator_in_css_is_resplit_never_stripped(self):
        text = doc(svg('<circle r="8"/>'), head='<style>.a:after{content:"]]>"}</style>')
        out = lift(text)
        self.assertEqual("]]>", ET.fromstring(out)[0].text.split('content:"')[1].split('"')[0])

    def test_missing_xmlns_fails(self):
        text = doc('<svg viewBox="0 0 10 10"><circle r="8"/></svg>')
        self.assertIn("no xmlns", lift_err(self, text))

    def test_doctype_inside_the_lifted_svg_is_refused(self):
        text = doc('<svg %s><!DOCTYPE x [<!ENTITY a "b">]><circle r="8"/></svg>' % ROOT)
        self.assertIn("<!DOCTYPE>", lift_err(self, text))

    def test_a_valid_figure_still_parses_after_folding(self):
        text = doc(svg('<style>.q{fill:red}</style><circle class="q" r="8"/>'),
                   head="<style>%s</style>" % MOTION)
        self.assertEqual(build.SVG_NS, ET.fromstring(lift(text)).tag)


# ---------------------------------------------------------------- defect 2
class FoldEveryStyle(unittest.TestCase):
    """The document <style> is folded in even when the svg has one of its own."""

    def test_document_keyframes_survive_an_inner_style(self):
        text = doc(svg('<style>.q{fill:red}</style><circle class="p q" r="8"/>'),
                   head="<style>%s</style>" % MOTION)
        out = lift(text)
        self.assertIn("@keyframes p", out)      # 5.2.0 dropped this entirely
        self.assertIn(".q{fill:red}", out)

    def test_outer_rules_land_ahead_of_the_svgs_own(self):
        # Source order in the original document: <head> first, inner second, so
        # the inner block keeps winning ties exactly as it did standalone.
        out = lift(doc(svg('<style>.q{fill:blue}</style><circle r="8"/>'),
                       head="<style>.q{fill:red}</style>"))
        self.assertLess(out.index(".q{fill:red}"), out.index(".q{fill:blue}"))

    def test_the_inner_style_is_never_duplicated(self):
        out = lift(doc(svg('<style>.q{fill:red}</style><circle r="8"/>')))
        self.assertEqual(1, out.count(".q{fill:red}"))


# ---------------------------------------------------------------- defect 3
class Direction(unittest.TestCase):
    """An <img>-embedded svg inherits no direction, so it must carry its own."""

    LABEL = '<text x="60" y="30" text-anchor="start">سلام دنیا</text>'

    def test_rtl_html_attribute_reaches_the_svg_root(self):
        out = lift(doc(svg(self.LABEL), html_attrs=' dir="rtl"'))
        self.assertIn("direction:rtl", out.split(">", 1)[0])

    def test_rtl_css_rule_on_the_document_reaches_the_svg_root(self):
        out = lift(doc(svg(self.LABEL), head="<style>html{direction:rtl}</style>"))
        self.assertIn("direction:rtl", out.split(">", 1)[0])

    def test_dir_attribute_on_the_svg_becomes_a_style(self):
        # dir is html-only: it does nothing at all in the embedded document.
        out = lift(doc(svg(self.LABEL, attrs=' dir="rtl"')))
        self.assertIn("direction:rtl", out.split(">", 1)[0])

    def test_an_existing_style_attribute_is_extended_not_replaced(self):
        out = lift(doc(svg(self.LABEL, attrs=' style="background:#fff"'),
                       html_attrs=' dir="rtl"'))
        self.assertIn('style="direction:rtl;background:#fff"', out)

    def test_an_authors_own_direction_is_never_overwritten(self):
        out = lift(doc(svg(self.LABEL, attrs=' style="direction:ltr"'),
                       html_attrs=' dir="rtl"'))
        self.assertNotIn("direction:rtl", out)

    def test_an_explicit_ltr_document_is_left_alone(self):
        out = lift(doc(svg(self.LABEL), html_attrs=' dir="ltr"'), lang="fa")
        self.assertNotIn("direction", out)

    def test_a_persian_report_is_the_last_resort_for_an_undeclared_figure(self):
        self.assertIn("direction:rtl", lift(doc(svg(self.LABEL)), lang="fa"))

    def test_a_latin_figure_in_a_persian_report_stays_ltr(self):
        out = lift(doc(svg('<text text-anchor="start">hello</text>')), lang="fa")
        self.assertNotIn("direction", out)


# ---------------------------------------------------------------- defect 4
class JavaScriptMotion(unittest.TestCase):
    """No script runs inside <img>, so js-driven motion ships as a still frame."""

    SCRIPT = '<script>requestAnimationFrame(function f(){f()})</script>'

    def test_js_only_motion_warns_and_names_the_file(self):
        _, err = lift_warn(doc(svg('<circle r="8"/>') + self.SCRIPT))
        self.assertIn("fig.html", err)
        self.assertIn("never runs inside <img>", err)

    def test_a_warning_is_not_a_failure(self):
        out, _ = lift_warn(doc(svg('<circle r="8"/>') + self.SCRIPT))
        self.assertEqual(build.SVG_NS, ET.fromstring(out).tag)

    def test_css_keyframes_alongside_a_script_do_not_warn(self):
        _, err = lift_warn(doc(svg('<circle class="p" r="8"/>') + self.SCRIPT,
                               head="<style>%s</style>" % MOTION))
        self.assertEqual("", err)

    def test_smil_alongside_a_script_does_not_warn(self):
        _, err = lift_warn(doc(svg('<circle r="8"><animateTransform '
                                   'attributeName="transform" dur="6s"/></circle>') + self.SCRIPT))
        self.assertEqual("", err)

    def test_a_react_figure_is_named_for_what_it_is(self):
        # fig 1.0.0: the only <svg> is JSX inside <script>, so 5.2.0 base64'd
        # source code into the report. "escape your angle brackets" would be
        # useless advice here.
        text = doc('<div id="root"></div><script type="text/babel">\n'
                   'const S = () => <svg %s><circle cx={90 + t * 50}/></svg>;\n'
                   '</script>' % ROOT)
        msg = lift_err(self, text)
        self.assertIn("JSX inside a <script>", msg)
        self.assertIn("fig 1.1.0", msg)

    def test_a_deliberately_static_figure_is_silent(self):
        _, err = lift_warn(doc(svg('<circle r="8"/>')))
        self.assertEqual("", err)


# ------------------------------------------------------------ no regression
class Unchanged(unittest.TestCase):
    """5.2.0's bytes, pinned. A correct figure must inline exactly as it did."""

    SELF_CONTAINED = doc('<svg %s>\n  <style>%s</style>\n'
                         '  <circle class="p" cx="30" cy="30" r="8" fill="#4f46e5"/>\n'
                         '</svg>' % (ROOT, MOTION))
    FOLDED = doc('<svg %s>\n  <circle class="p" cx="30" cy="30" r="8" fill="#4f46e5"/>\n'
                 '</svg>' % ROOT, head="<style>%s</style>" % MOTION)

    GOLD_SELF = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">\n'
                 '  <style>.p{animation:p 6s infinite}@keyframes p{50%{opacity:.2}}</style>\n'
                 '  <circle class="p" cx="30" cy="30" r="8" fill="#4f46e5"/>\n</svg>')
    GOLD_FOLDED = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">'
                   '<style>.p{animation:p 6s infinite}@keyframes p{50%{opacity:.2}}</style>\n'
                   '  <circle class="p" cx="30" cy="30" r="8" fill="#4f46e5"/>\n</svg>')

    def test_a_self_contained_figure_is_byte_identical_to_5_2_0(self):
        self.assertEqual(self.GOLD_SELF, lift(self.SELF_CONTAINED))

    def test_a_folded_figure_differs_from_5_2_0_only_by_the_cdata_wrapper(self):
        undone = lift(self.FOLDED).replace("<![CDATA[", "", 1).replace("]]>", "", 1)
        self.assertEqual(self.GOLD_FOLDED, undone)


class EndToEnd(unittest.TestCase):
    """The whole script, once, so the lang thread and the <img> rewrite are real."""

    def test_a_report_carries_the_figure_as_a_parsable_data_uri(self):
        import base64
        with tempfile.TemporaryDirectory() as d:
            d = pathlib.Path(d)
            (d / "fig.html").write_text(
                doc(svg('<text text-anchor="start">سلام</text>'), html_attrs=' dir="rtl"'),
                encoding="utf-8")
            (d / "c.html").write_text(
                '<h2>گزارش</h2>\n<figure><img src="fig.html" alt="f"></figure>', encoding="utf-8")
            out = d / "r.html"
            run = subprocess.run(
                [sys.executable, str(HERE / "build.py"), str(d / "c.html"),
                 "-o", str(out), "--no-brand"],
                capture_output=True, text=True)
            self.assertEqual(0, run.returncode, run.stderr)
            uri = out.read_text(encoding="utf-8").split("data:image/svg+xml;base64,")[1].split('"')[0]
            lifted = base64.b64decode(uri).decode("utf-8")
            self.assertEqual(build.SVG_NS, ET.fromstring(lifted).tag)
            self.assertIn("direction:rtl", lifted)


# ------------------------------------------------------- defects 4 and 5
FAKE_SHEET = (
    "/* arabic */\n@font-face {font-family: 'Test';font-style: normal;font-weight: 400;"
    "src: url(https://fonts.gstatic.com/l/font?kit=AAA&skey=1) format('woff2');"
    "unicode-range: U+0600-06FF;}\n"
    "/* cyrillic */\n@font-face {font-family: 'Test';"
    "src: url(https://fonts.gstatic.com/s/x/c.woff2) format('woff2');}\n")


@contextlib.contextmanager
def fake_net(sheet=FAKE_SHEET, blob=b"wOF2 pretend", dead=False):
    """Google Fonts, without the network. Yields the urls that were asked for."""
    asked = []
    real = build.http_get

    def stub(url, timeout):
        asked.append(url)
        if dead:
            return None
        return sheet.encode("utf-8") if "googleapis" in url else blob
    build.http_get = stub
    try:
        yield asked
    finally:
        build.http_get = real


class BrandFont(unittest.TestCase):
    """A declared family that was never loaded is the defect, not a detail."""

    def brand(self, d, meta):
        (d / "brand.css").write_text(":root{--text-accent:#09f}", encoding="utf-8")
        (d / "brand.json").write_text(json.dumps(meta), encoding="utf-8")
        return d

    def test_a_google_only_brand_font_is_actually_inlined(self):
        with tempfile.TemporaryDirectory() as t:
            d = self.brand(pathlib.Path(t), {"font": {"family": "Test", "google": "Test:wght@400"}})
            with fake_net():
                css, _ = build.brand_blocks(d, "fa")
        self.assertIn("@font-face", css)                       # 5.2.0 inlined nothing
        self.assertIn("data:font/woff2;base64,", css)
        self.assertNotIn("https://fonts.gstatic.com", css)

    def test_a_subset_outside_the_allowlist_is_dropped(self):
        with tempfile.TemporaryDirectory() as t:
            d = self.brand(pathlib.Path(t), {"font": {"family": "Test", "google": "Test:wght@400"}})
            with fake_net():
                css, _ = build.brand_blocks(d, "fa")
        self.assertEqual(1, css.count("@font-face"))           # cyrillic is not kept

    def test_an_unreachable_font_warns_and_keeps_the_remote_import(self):
        err = io.StringIO()
        with tempfile.TemporaryDirectory() as t:
            d = self.brand(pathlib.Path(t), {"font": {"family": "Test", "google": "Test:wght@400"}})
            with fake_net(dead=True), contextlib.redirect_stderr(err):
                css, _ = build.brand_blocks(d, "fa")
        self.assertIn("could not fetch the brand font", err.getvalue())
        self.assertIn("font.files", err.getvalue())
        self.assertNotIn("@font-face", css)
        # No face embedded means kit_css leaves the import, which is the only
        # thing that still makes the page render at all.
        self.assertIn("fonts.googleapis.com", build.kit_css(css))

    def test_embedding_a_face_drops_the_kits_remote_import(self):
        with tempfile.TemporaryDirectory() as t:
            d = self.brand(pathlib.Path(t), {"font": {"family": "Test", "google": "Test:wght@400"}})
            with fake_net():
                css, _ = build.brand_blocks(d, "fa")
        self.assertNotIn("fonts.googleapis.com", build.kit_css(css))

    def test_a_files_brand_never_reaches_the_network(self):
        with tempfile.TemporaryDirectory() as t:
            d = pathlib.Path(t)
            (d / "v.woff2").write_bytes(b"wOF2 local")
            self.brand(d, {"font": {"family": "Test", "google": "Test:wght@400",
                                    "files": {"400": "v.woff2"}}})
            with fake_net() as asked:
                css, _ = build.brand_blocks(d, "fa")
        self.assertEqual([], asked)
        self.assertIn(base64.b64encode(b"wOF2 local").decode(), css)


class FigureFont(unittest.TestCase):
    """The figure is its own document, so it needs its own copy of the face."""

    LABEL = '<text x="10" y="20">سلام</text>'

    def test_the_report_font_is_embedded_in_the_figure(self):
        with fake_net():
            out = lift(doc(svg(self.LABEL)), font=("Test", "Test:wght@400", None))
        self.assertIn("@font-face", out)
        self.assertIn("data:font/woff2;base64,", out)

    def test_the_face_is_subset_to_what_the_figure_letters(self):
        with fake_net() as asked:
            lift(doc(svg(self.LABEL)), font=("Test", "Test:wght@400", None))
        sheet = [u for u in asked if "googleapis" in u][0]
        self.assertIn("&text=", sheet)
        for ch in "سلام":
            self.assertIn(quote(ch), sheet)
        self.assertNotIn("%20", sheet)          # whitespace between tags is not a glyph

    def test_a_figure_that_names_its_own_typeface_keeps_it(self):
        fig = svg('<text font-family="Courier">سلام</text>')
        with fake_net():
            out = lift(doc(fig), font=("Test", "Test:wght@400", None))
        self.assertNotIn("font-family:'Test'", out)

    def test_a_figure_that_names_none_gets_the_reports(self):
        with fake_net():
            fa = lift(doc(svg(self.LABEL)), lang="fa", font=("Test", "Test:wght@400", None))
            en = lift(doc(svg(self.LABEL)), lang="en", font=("Test", "Test:wght@400", None))
        # Single-quoted, so it cannot close the style attribute it sits in, and
        # with the language's own fallback behind it.
        self.assertIn("font-family:'Test',Tahoma,sans-serif", fa.split(">", 1)[0])
        self.assertIn("font-family:'Test',system-ui,sans-serif", en.split(">", 1)[0])

    def test_the_root_style_stays_valid_xml(self):
        # A double-quoted family inside style="..." closes the attribute early
        # and invalidates the whole document.
        with fake_net():
            out = lift(doc(svg(self.LABEL), html_attrs=' dir="rtl"'),
                       font=("Test", "Test:wght@400", None))
        self.assertEqual(build.SVG_NS, ET.fromstring(out).tag)
        self.assertIn("direction:rtl", out.split(">", 1)[0])

    def test_a_figure_with_no_text_asks_for_nothing(self):
        with fake_net() as asked:
            out = lift(doc(svg('<circle r="8"/>')), font=("Test", "Test:wght@400", None))
        self.assertEqual([], asked)
        self.assertNotIn("@font-face", out)

    def test_an_unreachable_face_warns_and_still_builds(self):
        err = io.StringIO()
        with fake_net(dead=True), contextlib.redirect_stderr(err):
            out = lift(doc(svg(self.LABEL)), font=("Test", "Test:wght@400", None))
        self.assertIn("system fallback", err.getvalue())
        self.assertEqual(build.SVG_NS, ET.fromstring(out).tag)


# ---------------------------------------------------------------- defect 6
class InlineFigures(unittest.TestCase):
    """A data: URI is one point of failure; a CSP or a sanitiser is the other."""

    FIG = doc(svg('<style>.d{fill:red}.d.b{animation:spin 2s}'
                  '@keyframes spin{to{opacity:0}}</style>'
                  '<circle id="dot" class="d b" r="8"/>'
                  '<use href="#dot" x="20"/>'))

    def build(self, extra=(), fig=None):
        with tempfile.TemporaryDirectory() as t:
            d = pathlib.Path(t)
            (d / "fig.html").write_text(fig or self.FIG, encoding="utf-8")
            (d / "c.html").write_text(
                '<h2>T</h2>\n<figure><img src="fig.html" alt="a ring"></figure>',
                encoding="utf-8")
            out = d / "r.html"
            run = subprocess.run(
                [sys.executable, str(HERE / "build.py"), str(d / "c.html"), "-o", str(out),
                 "--lang", "en", "--no-brand", "--no-figure-font"] + list(extra),
                capture_output=True, text=True)
            self.assertEqual(0, run.returncode, run.stderr)
            return out.read_text(encoding="utf-8")

    def figure(self, html):
        return re.search(r"(?s)<figure>(.*?)</figure>", html).group(1)

    def test_default_mode_is_still_a_data_uri(self):
        self.assertIn("data:image/svg+xml;base64,", self.figure(self.build()))

    def test_inline_mode_emits_markup_instead(self):
        fig = self.figure(self.build(["--inline-figures"]))
        self.assertNotIn("data:image/svg+xml", fig)
        self.assertTrue(fig.lstrip().startswith("<svg"))

    def test_inline_mode_namespaces_classes(self):
        fig = self.figure(self.build(["--inline-figures"]))
        self.assertIn('class="fig1-d fig1-b"', fig)
        self.assertIn(".fig1-d{fill:red}", fig.replace(" ", ""))
        self.assertNotIn('class="d b"', fig)

    def test_inline_mode_namespaces_ids_and_their_references(self):
        fig = self.figure(self.build(["--inline-figures"]))
        self.assertIn('id="fig1-dot"', fig)
        self.assertIn('href="#fig1-dot"', fig)

    def test_inline_mode_renames_keyframes_and_the_animation_that_uses_them(self):
        fig = self.figure(self.build(["--inline-figures"]))
        self.assertIn("@keyframes fig1-spin", fig)
        self.assertIn("animation:fig1-spin 2s", fig.replace("  ", " "))

    def test_inline_mode_drops_the_cdata_fences(self):
        # <style> is raw text in html; a fence would be read as a css rule and
        # eat the first one.
        self.assertNotIn("CDATA", self.figure(self.build(["--inline-figures"])))

    def test_inline_mode_carries_alt_over_as_an_aria_label(self):
        fig = self.figure(self.build(["--inline-figures"]))
        self.assertIn('aria-label="a ring"', fig)
        self.assertIn('role="img"', fig)

    def test_two_figures_get_two_namespaces(self):
        with tempfile.TemporaryDirectory() as t:
            d = pathlib.Path(t)
            (d / "a.html").write_text(self.FIG, encoding="utf-8")
            (d / "b.html").write_text(self.FIG, encoding="utf-8")
            (d / "c.html").write_text(
                '<h2>T</h2><figure><img src="a.html" alt="a"></figure>'
                '<figure><img src="b.html" alt="b"></figure>', encoding="utf-8")
            out = d / "r.html"
            run = subprocess.run(
                [sys.executable, str(HERE / "build.py"), str(d / "c.html"), "-o", str(out),
                 "--lang", "en", "--no-brand", "--no-figure-font", "--inline-figures"],
                capture_output=True, text=True)
            self.assertEqual(0, run.returncode, run.stderr)
            html = out.read_text(encoding="utf-8")
        self.assertIn("fig1-d", html)
        self.assertIn("fig2-d", html)


class TableDirection(unittest.TestCase):
    """A column reads down one edge, whatever a cell happens to start with."""

    KIT = build.KIT.read_text(encoding="utf-8")

    def test_cells_isolate_instead_of_plaintext(self):
        # plaintext re-reads direction per element, so a cell opening on a Latin
        # token went LTR and left-aligned under a right-aligned Persian one.
        self.assertIn(".rc td,.rc th{unicode-bidi:isolate}", self.KIT)

    def test_paragraphs_still_plaintext(self):
        # Still correct THERE: an all-English paragraph in a Persian card should
        # set itself LTR. Only cells belong to a column.
        rule = re.search(r"^\.rc p,[^\n]*\{unicode-bidi:plaintext\}", self.KIT, re.M).group(0)
        self.assertNotIn("td", rule)
        self.assertNotIn("th", rule)

    def test_a_report_carries_the_isolate_rule(self):
        with tempfile.TemporaryDirectory() as t:
            d = pathlib.Path(t)
            (d / "c.html").write_text(
                "<h2>ت</h2><table><tbody><tr><td>NO_VERDICT، «الف»</td></tr></tbody></table>",
                encoding="utf-8")
            out = d / "r.html"
            run = subprocess.run(
                [sys.executable, str(HERE / "build.py"), str(d / "c.html"), "-o", str(out),
                 "--no-brand", "--no-figure-font"], capture_output=True, text=True)
            self.assertEqual(0, run.returncode, run.stderr)
            self.assertIn("unicode-bidi:isolate", out.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- defect 8
class ReapLocks(unittest.TestCase):
    """Dead .in_use locks go; live ones, above all our own, stay."""

    REAP = HERE.parents[1] / "hooks" / "reap.sh"

    def reap(self, d):
        return subprocess.run(["sh", str(self.REAP), str(d)], capture_output=True, text=True)

    @unittest.skipUnless(shutil.which("sh"), "no POSIX sh on PATH")
    def test_dead_pids_are_reaped_and_live_ones_survive(self):
        with tempfile.TemporaryDirectory() as d:
            d = pathlib.Path(d)
            mine = str(subprocess.os.getpid())
            for name in (mine, "999991", "999992.tmp.deadbeef", "notapid"):
                (d / name).write_text("x", encoding="utf-8")
            run = self.reap(d)
            self.assertEqual(0, run.returncode, run.stderr)
            self.assertEqual({mine, "notapid"}, {p.name for p in d.iterdir()})

    @unittest.skipUnless(shutil.which("sh"), "no POSIX sh on PATH")
    def test_it_says_nothing_so_a_session_pays_no_context_for_it(self):
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / "999993").write_text("x", encoding="utf-8")
            self.assertEqual("", self.reap(pathlib.Path(d)).stdout)

    @unittest.skipUnless(shutil.which("sh"), "no POSIX sh on PATH")
    def test_a_missing_directory_is_not_an_error(self):
        self.assertEqual(0, self.reap(HERE / "no-such-dir").returncode)


if __name__ == "__main__":
    unittest.main(verbosity=2)
