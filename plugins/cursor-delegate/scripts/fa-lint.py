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
    # Address form is a per-project decision, never a universal rule: a shop may
    # be right to say «تو» and a B2B product right to say «شما». So this is a
    # warning, and --voice formal switches it off entirely. What is wrong in
    # every voice is mixing the two, and that is checked separately.
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

# Rules that count or straddle whitespace MUST read the source. mask() blanks
# JSX, inline code and links to spaces so byte offsets stay valid, which invents
# space runs that are not in the file: `tasks.json`. becomes "…      ." and a
# space-before-punctuation rule reading the mask fires on every one.
SOURCE_ONLY_RULES = {"double-space", "space-before-punct"}

# Regions we must not lint: fenced code, inline code, YAML frontmatter,
# JSX/MDX tags and expression containers, URLs, and markdown links.
MASK_PATTERNS = [
    re.compile(r"^---\n.*?\n---\n", re.S),          # frontmatter
    re.compile(r"```.*?```", re.S),                  # fenced code
    re.compile(r"`[^`\n]*`"),                        # inline code
    re.compile(r"https?://\S+"),                     # urls
    re.compile(r"!?\[[^\]\n]*\]\([^)\n]*\)"),        # md links
]


def _blank(out: list[str], start: int, end: int) -> None:
    for i in range(start, end):
        if out[i] != "\n":
            out[i] = " "


def _mask_balanced(out: list[str], text: str, open_ch: str, close_ch: str,
                   limit: int) -> None:
    """Blank balanced open/close spans, nesting- and newline-aware.

    JSX expression containers like `items={[{question: "..."}]}` span many lines
    and nest, so a flat regex cannot reach their closing brace. Latin quotes
    inside them are JavaScript syntax, not Persian typography, and linting them
    produces nothing but false alarms.
    """
    i, n = 0, len(text)
    while i < n:
        if text[i] != open_ch or out[i] == " ":
            i += 1
            continue
        depth, j = 0, i
        while j < n and j - i <= limit:
            if text[j] == open_ch:
                depth += 1
            elif text[j] == close_ch:
                depth -= 1
                if depth == 0:
                    _blank(out, i, j + 1)
                    break
            j += 1
        i = (j + 1) if depth == 0 and j < n else (i + 1)


def mask(text: str) -> str:
    """Blank out non-prose regions, preserving offsets and newlines."""
    out = list(text)
    for pat in MASK_PATTERNS:
        for m in pat.finditer(text):
            _blank(out, m.start(), m.end())
    # Braces first: once expression containers are blank, the surrounding
    # JSX tag is short enough to match cleanly.
    _mask_balanced(out, text, "{", "}", 20000)
    _mask_balanced(out, "".join(out), "<", ">", 2000)
    return "".join(out)


def has_persian(s: str) -> bool:
    return bool(re.search(P, s))


# ---------------------------------------------------------------------------
# Texture: does this read like a person wrote it, or like a machine filled a
# word count? Thresholds below are calibrated against a real corpus, not
# invented: a published human-written article from the target site scored
# CV 0.61, openers 0.12, phrases 0.04, while seven frontier models scored
# CV 0.17-0.44, openers 0.31-0.43, phrases 0.04-0.26. The worst offender was
# the model a human reviewer independently described as "metronomic".
# ---------------------------------------------------------------------------

# Closing sentences that say nothing. Machines end every section with one.
EMPTY_CLOSERS = [
    "بستگی دارد", "به سلیقه تو", "همه چیز به", "در نهایت انتخاب",
    "انتخاب با توست", "تصمیم با خودت", "امیدواریم این مطلب",
]


def prose_sentences(masked: str) -> list[str]:
    """Body sentences only: no headings, list items, or table rows."""
    t = re.sub(r"^#.*$", "", masked, flags=re.M)
    t = re.sub(r"^\s*[-*|>].*$", "", t, flags=re.M)
    out = []
    for s in re.split(r"[.؟!\n]+", t):
        s = s.strip()
        if len(re.findall(r"[" + PERSIAN + r"]+", s)) >= 4:
            out.append(s)
    return out


# Rhythm needs a real sample. Measured on the target site: articles run 19-40
# body sentences and spread CV 0.33-0.59, while product pages run 12-14 and
# cluster at 0.30 — not because they are robotic but because short product copy
# is genuinely more uniform, and CV is noisy at n=12. Judging them by the
# article yardstick flagged 29 of 79 good pages. Repetition counts survive at
# lower n, so they keep the smaller gate.
RHYTHM_MIN_SENTENCES = 18
REPETITION_MIN_SENTENCES = 12


def texture(masked: str, path: str) -> list[dict]:
    """Flag machine-shaped prose. Silent on text too short to judge."""
    ss = prose_sentences(masked)
    if len(ss) < REPETITION_MIN_SENTENCES:
        return []

    import collections
    import statistics

    def f(rule, level, message, fix):
        return {"rule": rule, "level": level, "line": 1, "col": 1, "file": path,
                "text": "کل متن", "message": message, "fix": fix}

    out: list[dict] = []

    if len(ss) >= RHYTHM_MIN_SENTENCES:
        lengths = [len(re.findall(r"[" + PERSIAN + r"]+", s)) for s in ss]
        mean = statistics.mean(lengths)
        cv = statistics.pstdev(lengths) / mean if mean else 0
        if cv < 0.30:
            out.append(f("rhythm-robotic", "error",
                         f"ریتم جمله‌ها یکنواخت است (CV={cv:.2f}؛ انسان حدود ۰٫۶)",
                         "جمله کوتاه و بلند را قاطی کن. یک جمله سه کلمه‌ای بگذار."))
        elif cv < 0.40:
            out.append(f("rhythm-flat", "warn",
                         f"تنوع طول جمله کم است (CV={cv:.2f})",
                         "چند جمله را کوتاه‌تر و چند تا را بلندتر کن."))

    first = collections.Counter(s.split()[0] for s in ss if s.split())
    dup = sum(v - 1 for v in first.values() if v > 1)
    rate = dup / len(ss)
    if rate > 0.25:
        top = ", ".join(f"«{w}» {c} بار" for w, c in first.most_common(2) if c > 1)
        lvl = "error" if rate > 0.40 else "warn"
        out.append(f("repeated-openers", lvl,
                     f"جمله‌ها با واژه‌های تکراری شروع می‌شوند ({top})",
                     "شروع جمله‌ها را عوض کن."))

    grams: collections.Counter = collections.Counter()
    for s in ss:
        w = re.findall(r"[" + PERSIAN + r"]+", s)
        for i in range(len(w) - 3):
            grams[" ".join(w[i:i + 4])] += 1
    rep = {k: v for k, v in grams.items() if v > 1}
    extra = sum(rep.values()) - len(rep)
    if rep and extra / len(ss) > 0.08:
        worst = max(rep.items(), key=lambda kv: kv[1])
        lvl = "error" if extra / len(ss) > 0.15 else "warn"
        out.append(f("repeated-phrases", lvl,
                     f"عبارت تکراری: «{worst[0]}» {worst[1]} بار",
                     "یک بار بگو. تکرار، متن را ماشینی می‌کند."))

    for closer in EMPTY_CLOSERS:
        if closer in masked:
            out.append(f("empty-closer", "warn",
                         f"جمله پایانی توخالی: «{closer}»",
                         "یا حرف تازه‌ای بزن یا حذفش کن."))
            break
    return out


def long_sentences(text: str, limit: int = 26):
    """Yield (offset, word_count) for sentences longer than `limit` words."""
    for m in re.finditer(r"[^.؟!\n]+", text):
        s = m.group()
        if not has_persian(s):
            continue
        words = [w for w in re.split(r"\s+", s.strip()) if w]
        if len(words) > limit:
            yield m.start(), len(words)


# Unambiguous second-person-singular verb endings. Used only to detect a file
# that addresses the reader both ways; that is a defect in any house voice.
INFORMAL_MARKERS = re.compile(
    r"(?<![" + PERSIAN + r"])(?:می‌(?:توانی|کنی|شوی|دانی|خواهی|بینی|گیری|دهی)"
    r"|نمی‌(?:توانی|کنی|دانی)|بخری|بزنی|داری|هستی)(?![" + PERSIAN + r"])")
FORMAL_MARKER = re.compile(r"(?<![" + PERSIAN + r"])شما(?![" + PERSIAN + r"])")


def mixed_address(masked: str, path: str) -> list[dict]:
    formal = len(FORMAL_MARKER.findall(masked))
    informal = len(INFORMAL_MARKERS.findall(masked))
    if formal and informal:
        return [{"rule": "mixed-address", "level": "warn", "line": 1, "col": 1,
                 "file": path, "text": f"شما×{formal} / تو×{informal}",
                 "message": "مخاطب در یک متن قاطی شده (هم «شما» هم «تو»)",
                 "fix": "یکی را انتخاب کن و در کل صفحه نگه دار"}]
    return []


def lint(text: str, path: str, voice: str = "informal") -> list[dict]:
    masked = mask(text)
    starts = [m.start() for m in re.finditer(r"^", masked, re.M)]

    def pos(off: int) -> tuple[int, int]:
        import bisect
        line = bisect.bisect_right(starts, off)
        return line, off - starts[line - 1] + 1

    def is_masked(a: int, b: int) -> bool:
        """True if the span was blanked out by mask() rather than being source."""
        return any(masked[i] == " " != text[i] for i in range(a, b))

    found: list[dict] = []
    for rid, level, pat, msg, fix in RULES:
        if rid == "formal-you" and voice != "informal":
            continue
        # Whitespace rules must read the source: mask() blanks JSX and code to
        # spaces, which manufactures space runs that never existed in the file.
        subject = text if rid in SOURCE_ONLY_RULES else masked
        for m in pat.finditer(subject):
            if subject is text and is_masked(m.start(), m.end()):
                continue
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
    found += texture(masked, path)
    found += mixed_address(masked, path)
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
    ap.add_argument("--voice", choices=["informal", "formal"], default="informal",
                    help="house address form. 'informal' (default) warns on «شما»; "
                         "'formal' allows it, for B2B products whose own voice doc "
                         "says so. Mixing the two is flagged either way.")
    args = ap.parse_args()

    all_findings: list[dict] = []
    if args.stdin:
        all_findings += lint(sys.stdin.read(), "<stdin>", args.voice)
    for path in args.files:
        try:
            with open(path, encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as exc:
            print(f"cannot read {path}: {exc}", file=sys.stderr)
            return 2
        all_findings += lint(unicodedata.normalize("NFC", raw), path, args.voice)

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
