# learnable

A course you actually finish, on any subject.

Self-study fails the same three ways every time. You learn what you already knew. You learn it in the order a book chose, not the order your gaps need. And when the session ends, the thread is gone. learnable fixes all three: it measures what you really know, plans around the gaps it finds, and keeps the whole course on disk so nothing depends on a conversation staying alive.

## Install

```
/plugin marketplace add smk-labs/claude-plugins
/plugin install learnable@smk
```

Requires **readable** from the same marketplace. Every lesson is delivered as a card, and right-to-left languages render correctly only inside one. Web search is used for the research passes; without it a course still builds, but only from what the model already knows.

## Four commands

| command | how often | what it does |
| --- | --- | --- |
| `/learnable:learn` | every time | The way in and the way back. Continues from exactly where you stopped. With no course yet, it asks whether to measure your level first or go straight to building one. |
| `/learnable:new-course` | once per subject | A light survey of the domain, then the placement decision, then a fleet of research agents maps every track and a synthesis pass removes every duplicate and orders everything by real prerequisite. |
| `/learnable:self-assess` | optional | Placement quiz. Scenario questions in small batches, never definitions, with options you cannot eliminate by tone. Writes `PROFILE.md`. |
| `/learnable:new-book` | once per book | Writes the next book: its chapters and every lesson inside them, ready to teach. |

Start with `/learnable:learn` and answer one question. It routes you from there.

## The shape

```
course      the whole subject, one folder
  book      a finishable chunk, 4 to 6 chapters, with a promise at the end
    chapter one session, 3 to 6 lessons, ends with a four-question quiz
      lesson one hard question, one plain answer, then a pause
```

One chapter per session, deliberately. Context stays light, and the folder rather than the chat is the memory.

## How a lesson runs

Every card says where you are: lesson three of five, book one, chapter id. Then three moves.

1. **A hard question**, before any explanation. Not a definition. Something you will probably get wrong, so the need is real before the answer arrives.
2. **The answer.** What you got right, what you missed, then the mechanism, in plain language. Terms stay in their original English, and each arrives with where the word came from and why somebody chose it. `TTL` is Time To Live, borrowed from network packets that had to be allowed to die so they would not circle forever. A term you can trace is a term you keep.
3. **A pause.** The lesson ends by inviting your questions and waiting. Nothing advances until you say so.

Chapters after the first open with one recall question about older material. No score. It exists because a course of two hundred lessons is worthless if book one has evaporated by book five.

Show that a lesson is wrong and the lesson file itself gets fixed, not just the conversation. Answer an opening question so well that the lesson has nothing left to add, and it is skipped and recorded, so nothing teaches it to you twice.

## Finishing a book

The only real milestone, so it is marked. A closing card with what you can now do, your score across the book, and every quiz question with its answer in one place. Weak chapters are named, not hidden. Then a cheat sheet: one page carrying every term with its origin, the one sentence to remember from each lesson, and the mistakes you personally made, exported with `/readable:report` and offered as a PDF. That page outlives the conversation.

## On disk

```
my-course/
  CLAUDE.md       the teaching protocol, so any session knows what to do
  PROFILE.md      who you are and your measured level
  TAXONOMY.md     every concept in the domain and where it is taught
  TOC.md          books, chapters, lesson counts, prerequisites
  STATE.md        the only source of truth for where you are
  NEXT.md         the prompt for growing the course further
  books/          one file per chapter, ready to teach
  cheatsheets/    one page per finished book
  progress/log.md what was covered, how it went, what is still shaky
  .course/        the research and the plan, kept so new-book works months later
```

## Design notes

**Personalization lives in the course, not the plugin.** `PROFILE.md` carries who you are, what must never be taught to you again, and anything you believe that needs unlearning. The plugin stays generic, so the same four commands work for a product manager learning distributed systems and for a lawyer learning statistics.

**Deep research happens after the placement decision, never before.** Research aimed at the wrong level is the most expensive mistake this tool can make, and it cannot be salvaged without re-running the whole fleet.

**Interaction never happens in a subagent.** Agents research and write files; they never ask you anything. Reading a half-formed answer charitably and finding the misconception underneath it is the hardest judgment in the system, so it stays in the main session on the strongest model.

**The quiz cannot be gamed.** Every option is something a competent practitioner might actually say, correct answers move around, and the number of correct options varies. Distractors written in a naive voice let a test-wise learner score well while knowing nothing, which then aims the whole course at the wrong gaps.

**Cost before principle.** Quality and design ideas lead with a cost you can feel, and the principle is named afterwards. Leading with the name is how principles come to sound like bureaucracy.

**No code in lessons**, unless the profile says you read code. Describing what the machine does is usually more precise than a snippet, because the snippet hides the part that matters.

Language neutral throughout: your language is recorded in the profile and every file is written in it, while technical terms are never translated. Illustrated lessons are available per book through `/getpix:getpix`, off by default.

## What is inside

`skills/` the four commands. `agents/` a track researcher on a fast model and a chapter author on a strong one. `reference/` the teaching rules, how to write a question that cannot be gamed, the file formats, and the template for a course's own `CLAUDE.md`. `brand/` the mark and palette.

The mark is a closed book with the bookmark still in it. The interesting thing about learnable is not that it teaches, it is that it waits, and a bookmark is a promise that the page you stopped on is still yours.
