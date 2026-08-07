# What every file in a course looks like

A learnable course is a folder, not a conversation. These files are the contract between sessions, so their shape matters. Everything the learner reads is written in their language; the machine-readable parts under `.course/` stay in English.

## The hierarchy

```
course      the whole subject, one folder
  book      a finishable chunk, four to six chapters, with a promise at the end
    chapter one session, three to six lessons, ends with a four-question quiz
      lesson one hard question, one plain answer, then a pause
```

Chapter ids carry their track, for example `SEC-02` or `DATA-04`, and stay stable for the life of the course. Books are numbered in teaching order.

## The folder

```
<course>/
  CLAUDE.md          teaching protocol, auto-loaded by every session
  README.md          the learner's guide to their own course
  PROFILE.md         who they are and their measured level
  TAXONOMY.md        every concept in the domain and where it is taught
  TOC.md             books, chapters, lesson counts, prerequisites
  STATE.md           the only source of truth for where we are
  NEXT.md            the prompt for growing the course further
  books/<NN>-<slug>/<CHAPTER-ID>.md
  cheatsheets/<NN>-<slug>.md   one page per finished book, exported via /readable:report
  progress/log.md
  .course/
    config.json              course settings, see below
    tracks/<TRACK>.json      raw research, one file per track
    compact/<TRACK>.json     the same, stripped for the synthesis pass
    synthesis.json           the final plan: order, books, cuts, dedupe
    briefs/<CHAPTER-ID>.json per-chapter authoring brief
```

`.course/` is not scratch. It is what makes `new-book` still work in a fresh session six months later. Never put it in a temporary directory.

## .course/config.json

Course settings that must survive every session. Keep it small and readable.

```json
{
  "language": "fa",
  "reads_code": false,
  "illustrations": "off",
  "created": "2026-08-01"
}
```

`illustrations` is `"off"`, `"all"`, or a list of book numbers. When it is on, each lesson gets one image chosen to carry the mechanism, fetched with `/getpix:getpix`. It is off by default: a decorative picture in a lesson about a mechanism costs attention and teaches nothing. Turn it on for visual subjects, anatomy, design, geography, anything where the thing itself must be seen.

Displaying an image inside a card requires a readable version that supports images. Check before promising it.

## cheatsheets/

One file per finished book, written at the end of the book: every term with its meaning and origin, the one sentence to remember from each lesson, and the mistakes the learner personally made. Exported to a standalone HTML file with `/readable:report`, and offered as a PDF.

This is the artifact that outlives the conversation, so write it to be read cold, months later, by someone who has forgotten the lessons.

## PROFILE.md

The most important file in the course. Everything else is aimed by it.

- Who the learner is, in their own words: background, how they work, what they build.
- Language, and whether they can read code.
- Their stated priorities, in their order.
- A level map table with two columns, recognition and application, per area. The gap between those columns is the whole point.
- What they already know, as a concrete list. Binding: nothing on it gets taught again.
- What they do not know, with the specific wrong answers they gave. "Weak on caching" is useless. "Believes a short TTL fixes inconsistency" is a lesson.
- Repeated errors: any wrong model produced twice. These earn their own chapters.
- Beliefs to break, quoted where possible.
- Notes on working with them: quiz style, term handling, anything they asked for.

## TOC.md

Books in order. For each book: a name, a one-sentence promise of what they can do at the end, and a table of its chapters with id, title, lesson count and prerequisites. Mark chapters needing a research pass. Under the table, one line per chapter stating its goal.

Four to six chapters per book. A book is a chunk that can be finished, not a category.

## TAXONOMY.md

The coverage audit. For every track, a table of every drafted chapter and its fate: in the plan with its order number, merged into another chapter, or cut with a reason. Then the terms that track delivers, and what it deliberately skips because the learner already owns it.

Then three tables: where a prerequisite overrode the learner's stated priority and why, the highest-leverage lessons in the course, and every concept that appeared in more than one track with its single owner.

If a concept is not in this file, it is not in the course. That is the point of the file.

## STATE.md

Short, scannable, and the first thing any session reads. Current book, next chapter, its file path, next lesson, status. Then the standing instruction for the session, a checklist of the chapters already written and what is done, and a short history table.

One rule: `STATE.md` is updated at the end of every chapter, before telling the learner to open a new session. A stale `STATE.md` is the only way this system loses the thread.

## A chapter file

```
# <CHAPTER-ID>: <chapter title>

> **Goal:** one plain sentence about what they can do after this
> **Prerequisites:** ids, or none
> **Lessons:** N

---

## Lesson 1: <title>

### Opening question
The scenario with concrete numbers, then the question itself.

**Options** (for AskUserQuestion)
- **<label, five words at most>** : <one plausible sentence>
- (four in total)

**Correct:** which ones
**Multi-select:** yes or no

### Correction
Why the right answer is right, and why each attractive wrong option is attractive and wrong.

### Explanation
Two hundred to three hundred and fifty words. Open with the mechanism, not the name. A physical analogy and real numbers. End with the one sentence to remember.

### Terms
`term` : what it is, where the word came from, why that word
```

Repeat per lesson, then:

```
## End-of-chapter quiz
```

Four questions, each with four plausible options, which are correct, and a one-line explanation. Randomize where correct answers sit and vary how many are correct.

## progress/log.md

One row per chapter: date, chapter, lessons covered, quiz result, and one line on what actually landed or did not.

Then a second table for recall: which chapter's material was asked at the start of which later chapter, and whether it held. This is what stops the recall question repeating itself and what marks a concept as still shaky.

Mark anything shaky explicitly. That word is what the next chapter's opening question looks for, and it is also what a later `self-assess` run reaches for first. This file is the only long-term record of what actually stuck, so a chapter that is not logged may as well not have happened.

## NEXT.md

A ready-to-paste prompt for growing the course: which book is next, where the raw data lives, which chapters need research first, the authoring rules, and what to do once the taxonomy is exhausted.
