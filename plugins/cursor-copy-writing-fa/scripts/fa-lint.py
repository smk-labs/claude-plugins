#!/usr/bin/env python3
"""fa-lint — a Persian web-copy linter.

Checks one or more files (or stdin) against the rulebook that ships with this
plugin: ZWNJ, Persian punctuation, Persian digits, administrative words,
ad clichés, unverifiable claims, and voice.

Usage:
    fa-lint.py FILE [FILE ...]        lint files
    fa-lint.py --stdin                lint stdin
    fa-lint.py --json FILE            machine-readable output
    fa-lint.py --quiet FILE           only the summary line

Exit code 0 when no ERROR-level finding remains, 1 otherwise. Warnings never
fail the run on their own; they are judgement calls for a human.

No third-party dependencies on purpose: this runs anywhere python3 does.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata

ZWNJ = "‌"
PERSIAN = r"؀-ۿ"
P = f"[{PERSIAN}]"

# ---------------------------------------------------------------------------
# Rules. Each rule: (id, level, compiled pattern, message, fix hint)
# level: "error" fails the run; "warn" is a judgement call.
# ---------------------------------------------------------------------------

# Verb stems that must carry a ZWNJ after می/نمی. Listed explicitly because
# plenty of ordinary nouns legitimately start with "می" (میوه، میز، میدان،
# میزان، میلیون، میهن، میگو)، so a generic "می + letter" rule cries wolf.
VERB_STEMS = (
    "شود شوند شد شدند کند کنند کنی کنم کنید دهد دهند دهی گیرد گیرند گیری "
    "باشد باشند باشی گردد گردند نماید نمایند تواند توانی توانید توانند "
    "رود روند آید آیند خواهد خواهی خواهند کشد گوید گویند بیند خورد خورند "
    "ماند سازد سازند زند زنند رسد رسند یابد یابند داند دانند بخشد نویسد "
    "خواند خوانند پزد برد برند آورد آورند"
).split()
GLUED_VERBS = re.compile(r"(?<![" + PERSIAN + r"])(?:ن?می)(?:" + "|".join(VERB_STEMS) + r")(?![" + PERSIAN + r"])")

ADMIN = {
    "جهت": "برای",
    "می‌باشد": "است",
    "می‌باشند": "هستند",
    "می‌گردد": "می‌شود",
    "می‌نماید": "می‌کند",
    "می‌نمایند": "می‌کنند",
    "نموده": "کرده",
    "گشته": "شده",
    "گردیده": "شده",
    "مبادرت": "«مبادرت به» را با فعل ساده عوض کن",
    "فی‌الواقع": "در واقع",
    "علی‌رغم": "با اینکه",
    "بدین‌وسیله": "(حذف)",
    "لذا": "پس",
    "حائز اهمیت": "مهم",
}

CLICHE = {
    "در دنیای امروز": "(حذف)",
    "در عصر حاضر": "(حذف)",
    "در دنیای پرشتاب": "(حذف)",
    "لازم به ذکر است": "(حذف)",
    "شایان ذکر است": "(حذف)",
    "بی‌شک": "(حذف)",
    "بدون شک": "(حذف)",
    "همان‌طور که می‌دانید": "(حذف)",
    "به جرات می‌توان": "(حذف)",
    "نقش بسزایی": "(حذف یا با اثر مشخص عوض کن)",
    "شما عزیزان": "تو",
    "کاربران گرامی": "تو",
    "بهترین انتخاب": "بگو چرا، نه اینکه ادعا کن",
    "بی‌نظیر": "یک ویژگی مشخص بگو",
    "بی‌همتا": "یک ویژگی مشخص بگو",
    "فوق‌العاده": "یک ویژگی مشخص بگو",
    "صد در صد": "(حذف)",
    "۱۰۰٪ تضمینی": "(حذف)",
}

# Wordy constructions that a plain-language pass should flatten.
WORDY = {
    "مورد استفاده قرار": "به کار می‌رود",
    "مورد بررسی قرار": "بررسی می‌شود",
    "مورد توجه قرار": "توجه می‌شود",
    "اقدام به": "فعل ساده بگذار: «سفارش بده»",
    "از اهمیت بالایی برخوردار": "مهم است",
    "برخوردار است": "دارد",
    "از خود نشان می‌دهد": "فعل ساده بگذار",
    "حاصل از": "(حذف)",
    "در سطح کشور": "در ایران",
    "به مراتب": "(حذف)",
    "دارای": "«... دارد» بنویس",
    "می‌گردد که": "می‌شود",
}


def build_rules() -> list[tuple[str, str, re.Pattern, str, str]]:
    R: list[tuple[str, str, re.Pattern, str, str]] = []

    R.append(("zwnj-verb-space", "error",
              re.compile(r"(?<![" + PERSIAN + r"])(ن?می) (?=" + P + r")"),
              "پیشوند فعل با فاصله کامل جدا شده", "نیم‌فاصله بگذار: می‌شود"))
    R.append(("zwnj-verb-glued", "error", GLUED_VERBS,
              "پیشوند فعل کاملا چسبیده نوشته شده", "نیم‌فاصله بگذار: می‌شود"))
    R.append(("zwnj-plural", "error",
              re.compile(P + r" (ها|های|هایی)(?![" + PERSIAN + r"])"),
              "نشانه جمع با فاصله کامل آمده", "نیم‌فاصله بگذار: قهوه‌ها"))
    R.append(("zwnj-comparative", "warn",
              re.compile(P + r" (تر|تری|ترین)(?![" + PERSIAN + r"])"),
              "پسوند برتر با فاصله کامل آمده", "نیم‌فاصله بگذار: تلخ‌تر"))
    R.append(("zwnj-ye", "warn",
              re.compile(r"(?<=ه) (ای|ات|اش)(?![" + PERSIAN + r"])"),
              "پسوند با فاصله کامل آمده", "نیم‌فاصله بگذار: حرفه‌ای"))

    R.append(("latin-comma", "error", re.compile(P + r"\s*,"),
              "ویرگول لاتین در متن فارسی", "ویرگول فارسی «،» بگذار"))
    R.append(("latin-semicolon", "error", re.compile(P + r"\s*;"),
              "نقطه‌ویرگول لاتین", "«؛» بگذار"))
    R.append(("latin-question", "error", re.compile(P + r"\s*\?"),
              "علامت سؤال لاتین", "«؟» بگذار"))
    R.append(("space-before-punct", "error", re.compile(P + r" +[،؛؟!.]"),
              "فاصله پیش از نشانه پایانی", "نشانه را به واژه بچسبان"))
    R.append(("em-dash", "error", re.compile(r"[—–]"),
              "خط تیره بلند", "نقطه، ویرگول یا «؛» بگذار"))
    R.append(("latin-quotes", "warn", re.compile(r'"' + f"[^\"]*{P}[^\"]*" + r'"'),
              "گیومه لاتین دور متن فارسی", "گیومه فارسی «» بگذار"))
    # NOTE: \d matches Persian digits too, so the class must be spelled out.
    R.append(("latin-digit", "error",
              re.compile(r"(?<![0-9A-Za-z/#.\-])[0-9]+(?![0-9A-Za-z/#.\-])"),
              "عدد لاتین در متن فارسی", "عدد فارسی بنویس: ۱۲۳"))

    R.append(("arabic-letter", "error", re.compile(r"[يكة]"),
              "حرف عربی به جای فارسی", "ی و ک و ه فارسی بگذار"))
    R.append(("tatweel", "error", re.compile(r"ـ{2,}"),
              "کشیدگی حروف", "حذف کن"))
    R.append(("soal-hamze", "warn", re.compile(r"(?<![" + PERSIAN + r"])سوال"),
              "«سوال» بدون همزه", "«سؤال» یا بهتر: «پرسش»"))
    R.append(("emoji", "error",
              re.compile("[\U0001F000-\U0001FAFF☀-➿]"),
              "ایموجی در متن", "آیکون SVG بگذار، نه ایموجی"))
    R.append(("formal-you", "warn",
              re.compile(r"(?<![" + PERSIAN + r"])شما(?![" + PERSIAN + r"])"),
              "مخاطب جمع و رسمی", "مفرد و صمیمی بنویس: «تو»"))
    R.append(("double-space", "warn", re.compile(r"[^\s\n]  +[^\s]"),
              "فاصله دوتایی", "یک فاصله بگذار"))

    for bad, good in ADMIN.items():
        R.append((f"admin:{bad}", "error",
                  re.compile(r"(?<![" + PERSIAN + r"])" + re.escape(bad)),
                  f"واژه اداری: «{bad}»", good))
    for bad, good in CLICHE.items():
        R.append((f"cliche:{bad}", "error", re.compile(re.escape(bad)),
                  f"کلیشه تبلیغاتی: «{bad}»", good))
    for bad, good in WORDY.items():
        R.append((f"wordy:{bad}", "warn", re.compile(re.escape(bad)),
                  f"ساخت طولانی: «{bad}»", good))
    return R


RULES = build_rules()

# Regions we must not lint: fenced code, inline code, YAML frontmatter,
# JSX/MDX tags and attributes, URLs, and pure-Latin runs.
MASK_PATTERNS = [
    re.compile(r"^---\n.*?\n---\n", re.S),          # frontmatter
    re.compile(r"```.*?```", re.S),                  # fenced code
    re.compile(r"`[^`\n]*`"),                        # inline code
    re.compile(r"<[^>]{1,400}>", re.S),              # html/jsx tags
    re.compile(r"\{[^{}\n]{0,200}\}"),               # jsx expressions
    re.compile(r"https?://\S+"),                     # urls
    re.compile(r"!?\[[^\]\n]*\]\([^)\n]*\)"),        # md links
]


def mask(text: str) -> str:
    """Blank out non-prose regions, preserving offsets and newlines."""
    out = list(text)
    for pat in MASK_PATTERNS:
        for m in pat.finditer(text):
            for i in range(m.start(), m.end()):
                if out[i] != "\n":
                    out[i] = " "
    return "".join(out)


def has_persian(s: str) -> bool:
    return bool(re.search(P, s))


def long_sentences(text: str, limit: int = 26):
    """Yield (offset, word_count) for sentences longer than `limit` words."""
    for m in re.finditer(r"[^.؟!\n]+", text):
        s = m.group()
        if not has_persian(s):
            continue
        words = [w for w in re.split(r"\s+", s.strip()) if w]
        if len(words) > limit:
            yield m.start(), len(words)


def lint(text: str, path: str) -> list[dict]:
    masked = mask(text)
    starts = [m.start() for m in re.finditer(r"^", masked, re.M)]

    def pos(off: int) -> tuple[int, int]:
        import bisect
        line = bisect.bisect_right(starts, off)
        return line, off - starts[line - 1] + 1

    found: list[dict] = []
    for rid, level, pat, msg, fix in RULES:
        for m in pat.finditer(masked):
            frag = m.group().strip()
            # digit rule: only complain when the line is actually Persian prose
            if rid == "latin-digit":
                ln, _ = pos(m.start())
                if not has_persian(masked.splitlines()[ln - 1]):
                    continue
            line, col = pos(m.start())
            found.append({"rule": rid, "level": level, "line": line, "col": col,
                          "text": frag[:40], "message": msg, "fix": fix,
                          "file": path})
    for off, n in long_sentences(masked):
        line, col = pos(off)
        found.append({"rule": "long-sentence", "level": "warn", "line": line,
                      "col": col, "text": f"{n} کلمه", "file": path,
                      "message": f"جمله {n} کلمه‌ای", "fix": "به دو جمله بشکن"})

    found.sort(key=lambda f: (f["line"], f["col"]))
    return found


def report(findings: list[dict], quiet: bool) -> None:
    errors = [f for f in findings if f["level"] == "error"]
    warns = [f for f in findings if f["level"] == "warn"]
    if not quiet:
        for f in findings:
            tag = "ERROR" if f["level"] == "error" else "warn "
            print(f'{f["file"]}:{f["line"]}:{f["col"]}: {tag} [{f["rule"]}] '
                  f'{f["message"]} → {f["fix"]}   «{f["text"]}»')
        if findings:
            print()
    verdict = "PASS" if not errors else "FAIL"
    print(f"{verdict}  errors={len(errors)}  warnings={len(warns)}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Persian web-copy linter")
    ap.add_argument("files", nargs="*")
    ap.add_argument("--stdin", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    all_findings: list[dict] = []
    if args.stdin:
        all_findings += lint(sys.stdin.read(), "<stdin>")
    for path in args.files:
        try:
            with open(path, encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as exc:
            print(f"cannot read {path}: {exc}", file=sys.stderr)
            return 2
        all_findings += lint(unicodedata.normalize("NFC", raw), path)

    if not args.files and not args.stdin:
        ap.print_help()
        return 2

    if args.json:
        print(json.dumps(all_findings, ensure_ascii=False, indent=2))
    else:
        report(all_findings, args.quiet)
    return 1 if any(f["level"] == "error" for f in all_findings) else 0


if __name__ == "__main__":
    sys.exit(main())
