#!/usr/bin/env python3
"""Regression tests for /fig inlining in build.py.

    python3 test_build.py

Stdlib unittest: nothing to install, the same contract as the card server's own
`node server/test.js`. Every figure below is a few lines of inline html rather
than a real /fig file, because all four build defects come from ONE fact - an
inlined svg is its own strictly-parsed, script-free, direction-less document -
and reproducing that needs no real figure.
"""
import contextlib
import io
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

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


def lift(text, lang="en"):
    return build.svg_from_html(text, FIG, lang)


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


# ---------------------------------------------------------------- defect 5
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
