#!/usr/bin/env python3
"""Unit tests for the readable plugin PreToolUse hook. Run: python3 tests/test_rtl_card.py"""
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import unittest

HOOK = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "hooks", "rtl_card.py"))


def load_module():
    spec = importlib.util.spec_from_file_location("rtl_card", HOOK)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_hook(payload, raw=None):
    data = raw if raw is not None else json.dumps(payload)
    proc = subprocess.run(
        [sys.executable, HOOK], input=data, capture_output=True, text=True, timeout=15
    )
    return proc


def event(widget_code, tool="mcp__visualize__show_widget"):
    return {
        "hook_event_name": "PreToolUse",
        "tool_name": tool,
        "tool_input": {
            "widget_code": widget_code,
            "title": "sample_card",
            "loading_messages": ["one"],
        },
    }


MD = """<md>
# سلام دنیا

متن **مهم** با `git status` و لینک [مستندات](https://example.com/docs) و آدرس https://github.com/smk-labs

- مورد اول
- مورد دوم

1. قدم اول
2. قدم دوم

> نقل قول کوتاه

| ستون | مقدار |
| --- | --- |
| الف | 1 |

```bash
echo "hi" && ls -la
```

<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>

---
پایان متن.
</md>"""


class TestHook(unittest.TestCase):
    def test_sentinel_is_converted(self):
        proc = run_hook(event(MD))
        self.assertEqual(proc.returncode, 0)
        out = json.loads(proc.stdout)
        hso = out["hookSpecificOutput"]
        self.assertEqual(hso["hookEventName"], "PreToolUse")
        self.assertEqual(hso["permissionDecision"], "allow")
        code = hso["updatedInput"]["widget_code"]
        self.assertIn('dir="rtl"', code)
        self.assertIn("Vazirmatn", code)
        self.assertIn("<h1>سلام دنیا</h1>", code)
        self.assertIn("<strong>مهم</strong>", code)
        self.assertIn("<code>git status</code>", code)
        self.assertIn('<a href="https://example.com/docs">مستندات</a>', code)
        self.assertIn('<a class="u" href="https://github.com/smk-labs">', code)
        self.assertIn("<ul><li>مورد اول</li><li>مورد دوم</li></ul>", code)
        self.assertIn("<ol><li>قدم اول</li><li>قدم دوم</li></ol>", code)
        self.assertIn("<blockquote><p>نقل قول کوتاه</p></blockquote>", code)
        self.assertIn("<th>ستون</th>", code)
        self.assertIn("<td>الف</td>", code)
        self.assertIn("&quot;hi&quot; &amp;&amp; ls -la", code)
        self.assertIn('<svg viewBox="0 0 10 10">', code)
        self.assertIn("<hr>", code)
        self.assertIn("<p>پایان متن.</p>", code)
        self.assertNotIn("<md>", code)

    def test_other_fields_preserved(self):
        proc = run_hook(event(MD))
        upd = json.loads(proc.stdout)["hookSpecificOutput"]["updatedInput"]
        self.assertEqual(upd["title"], "sample_card")
        self.assertEqual(upd["loading_messages"], ["one"])

    def test_html_passthrough_is_silent(self):
        proc = run_hook(event("<div>a normal widget</div>"))
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(proc.stdout.strip(), "")

    def test_other_tool_is_silent(self):
        proc = run_hook(event(MD, tool="Bash"))
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(proc.stdout.strip(), "")

    def test_malformed_stdin_fails_open(self):
        proc = run_hook(None, raw="this is not json")
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(proc.stdout.strip(), "")

    def test_script_tag_in_text_is_escaped(self):
        proc = run_hook(event("<md>\nمتن با <script>alert(1)</script> داخلش\n</md>"))
        code = json.loads(proc.stdout)["hookSpecificOutput"]["updatedInput"]["widget_code"]
        self.assertNotIn("<script>", code)
        self.assertIn("&lt;script&gt;", code)

    def test_output_is_valid_json_single_line(self):
        proc = run_hook(event(MD))
        self.assertEqual(len(proc.stdout.strip().splitlines()), 1)
        json.loads(proc.stdout)

    def test_conversion_failure_denies_with_guidance(self):
        card = load_module()

        def boom(md):
            raise RuntimeError("boom")

        card.convert = boom
        saved_stdin = sys.stdin
        try:
            sys.stdin = io.StringIO(json.dumps(event("<md>\nx\n</md>")))
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                card.main()
        finally:
            sys.stdin = saved_stdin
        hso = json.loads(buf.getvalue())["hookSpecificOutput"]
        self.assertEqual(hso["permissionDecision"], "deny")
        self.assertIn("HTML card", hso["permissionDecisionReason"])
        self.assertIn('dir="rtl"', hso["permissionDecisionReason"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
