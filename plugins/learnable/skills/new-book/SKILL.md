---
name: new-book
description: Write the next book of the course: its chapters and every lesson inside them, ready to teach. Reads the plan, runs a short research pass only for chapters that need one, then writes one file per chapter with the opening question, the correction, the explanation, the terms with their origins, and the end-of-chapter quiz. Use when the learner has finished a book, when a chapter file is missing, or when the user says "کتاب بعدی", "درس‌های بعدی رو بنویس", "فاز بعد", "write the next book", "author the next chapters", "the lessons ran out", or invokes /learnable:new-book. Requires a course already built by /learnable:new-course.
---

# new-book: turn the plan into lessons

The plan says what to teach. This skill writes it, in the exact shape a future session can pick up and deliver without thinking.

Read `reference/teaching-rules.md` and `reference/file-formats.md` first. Every authoring agent gets the rules verbatim, because a lesson that breaks them is worse than no lesson.

## Step 1: find the next book

Read `STATE.md`, `TOC.md`, `PROFILE.md`, and `.course/synthesis.json`. The next book is the first one in `TOC.md` whose chapter files do not exist under `books/`.

If `.course/` is missing, say so plainly and offer to rebuild the plan from `TOC.md` and `TAXONOMY.md`. Those two files carry enough to reconstruct briefs, though the teaching angles from the original research will be lost.

If the learner asked for a specific book out of order, check its prerequisites in `TOC.md` first and tell them what they will be missing. Then do what they asked.

## Step 1b: illustrated or not

Read `.course/config.json`. If `illustrations` is on for this book or for the whole course, every lesson gets one image that carries the mechanism: a diagram, a photograph of the real thing, a chart. Never a decoration. Fetch them with `/getpix:getpix` after the chapters are written, and reference the saved file from the lesson.

If the setting is missing and the subject is visual, anatomy, design, geography, hardware, anything where the thing itself must be seen, offer it once in a single question and record the answer in the config. Otherwise leave it off and do not ask again.

Check that the installed readable version can display an image inside a card before you promise illustrated lessons. If it cannot, say so plainly and write the book without images rather than producing lessons that reference files nothing will render.

## Step 2: research only where it is needed

`TOC.md` marks the chapters that need a fresh look, usually because the material moves fast or is tooling-specific. For only those, run one short research agent each: two or three searches, no page fetching, output a brief list of what changed and what current guidance says, written to `.course/briefs/<CHAPTER-ID>-research.md`.

Every other chapter needs no research. The domain research already happened in `new-course`. Resist the urge to refresh everything: it is slow, it produces drift between chapters written at different times, and it rarely changes a lesson about a mechanism.

## Step 3: build the briefs

For each chapter in the book, write `.course/briefs/<CHAPTER-ID>.json` containing:

- the final plan entry from `synthesis.json`: lesson count, and the note saying exactly which lessons were kept, merged in, or cut
- the original draft chapter from its track file: lesson titles, opening questions, misconceptions, key terms, teaching angles
- any opening questions the synthesis rewrote, so the agent uses the new version
- the drafts of any chapters that were cut and whose surviving lessons were folded into this one
- the research brief, if there is one

The plan note is authoritative over the draft. That is the whole reason briefs exist rather than handing agents the raw research.

## Step 4: write the chapters

Create `books/<NN>-<slug>/`. Run one `chapter-author` agent per chapter, in parallel, on the strongest model. Writing a lesson is judgment work: a weaker model produces something that looks like a lesson and teaches nothing.

Each agent gets its brief path, the output path, the teaching rules verbatim, and the chapter file format. It reads its brief, obeys the lesson count exactly, and writes one file.

The constraints that matter most, and that agents break most often:

- **No code blocks.** Not one, unless `PROFILE.md` says the learner reads code. Mechanisms are explained in prose, with physical analogies and real numbers.
- **The opening question comes first and is genuinely hard.** If the learner would get it right without the lesson, the lesson has no reason to exist.
- **Options are all plausible**, the correct one moves around, and the number of correct ones varies.
- **Terms carry their origins.** Every abbreviation expanded letter by letter, then why that word.
- **Cost before principle.** Never open with the name of a principle.
- **No em-dashes, no en-dashes, no emojis.**

## Step 5: check the output

Do not trust the agents' own reports. Verify mechanically:

- lesson count per chapter matches the plan
- no code fences anywhere
- no em-dashes or en-dashes (strip them if present, most models emit them despite instructions)
- every lesson has an opening question, four options, a correction, an explanation, and terms
- every chapter ends with a four-question quiz
- correct answers are not all sitting in the same position across a chapter

Then read one lesson yourself, end to end, as the learner would. Counts and greps cannot tell you whether a question is actually hard or an explanation actually explains. If a lesson is flat, re-run that one agent with a sharper brief rather than accepting it.

## Step 6: update the state

Update `STATE.md`: the new book, its chapters as an unchecked list, the next chapter and its file path, and a history line. Append one line to `progress/log.md` recording that this book was written.

Then report in one card: the book name, its promise, the chapter list with lesson counts, and anything you noticed while checking that the learner should know. Tell them to open a new session and say `/learnable:learn` to start the first chapter, so the authoring context is not carried into the teaching.
