---
name: learn
description: The way into learnable and the way back. If a course already exists here it continues from exactly where the learner stopped, next lesson, next chapter, no re-planning. If nothing exists yet it asks whether to measure their level first or go straight to building a course. Use when the user says they want to learn, study, continue, resume, keep going, "ادامه", "درس بعدی", "بریم یاد بگیریم", "شروع کنیم", "continue the course", "next lesson", "where were we", or invokes /learnable:learn. Also the right entry point when someone mentions learnable without naming a specific step.
---

# learn: continue, or decide how to start

One job: get the learner to the next useful thing in as few words as possible. Never re-plan, never restart, never interview them about something a file already answers.

## First, look

Check the current directory and the obvious candidates for an existing course. A course is a folder containing `STATE.md` and `TOC.md`.

- **`STATE.md` exists** here or in a folder the learner names. Go to Continue.
- **Nothing exists.** Go to Start.
- **Several courses exist** in subfolders. Show them in a card with where each one stopped, and let the learner pick.

## Continue

Read `STATE.md`, then the chapter file it names. Read `PROFILE.md` once. Read the course's `CLAUDE.md` and follow it exactly: it is the teaching protocol for this specific course and it outranks your habits.

Give a three-line status: where we are, what is done, what is next. Then start the next lesson immediately. Do not ask permission.

Two cases worth handling cleanly:

- **The chapter file does not exist yet.** The book has run out. Say so in one line and offer `/learnable:new-book` to write the next one.
- **`STATE.md` says a chapter is half finished.** Resume at the named lesson, not at the start of the chapter. Do not re-teach lessons already marked done, and do not summarize them either unless asked. Learners resent being walked back through material they finished.

## Start

Nothing exists yet. Ask exactly one thing: what do they want to learn. Then offer the two ways in, in a card, with a picker after it.

- **Measure my level first.** `/learnable:self-assess` runs a placement quiz, then the course gets built around the gaps it finds. Costs about half an hour and makes everything after it sharper.
- **Just build the course.** `/learnable:new-course` goes straight to work, asks a couple of questions about their level, and assumes a standard ladder.

Recommend the first when they are experienced in the field and their gaps are probably not where they think, and the second when they are a genuine beginner in the subject, where a quiz would only confirm that they know nothing yet.

Then invoke whichever they chose. Do not build anything yourself here; this skill routes and continues, it does not plan, write or teach beyond delivering lessons that already exist.

## When the folder does not add up

The folder is the memory, so drift in the folder is the one failure that loses real progress. Check for it in passing, fix it quietly, and only mention it if it changes what happens next.

- **`STATE.md` points at a chapter that is already checked off in its own list.** Trust the checklist and the log over the pointer, and move the pointer forward.
- **`progress/log.md` records chapters that `STATE.md` says are unstarted.** Same: the log is the record of what actually happened.
- **A chapter file exists but is not in `TOC.md`,** or the reverse. Say so, and treat `TOC.md` as the plan of record.
- **`STATE.md` is missing entirely but `books/` has files.** Rebuild it from `TOC.md` and `progress/log.md`.

Never resolve drift by starting the chapter over. Re-teaching finished material to be safe is worse than the drift.

## Fix what is wrong, on disk

If the learner shows that a lesson is wrong or unclear, and they are right, fix the chapter file, not just the conversation. A correction that lives only in chat gets made once and forgotten by the next session.

## Ground rules while teaching

Read `reference/teaching-rules.md` if the course `CLAUDE.md` is missing or thin. In particular:

- Every lesson is three moves: the question first, then the answer, then a pause. Never explain before they answer.
- For right-to-left languages, the question goes in a card and `AskUserQuestion` is only the picker.
- Never advance a lesson on your own. The pause is not decoration; it is the point.
- Never interact through a subagent.

## The very first lesson of a course

The first time anyone opens a freshly built course, spend one card on orientation before the first question: what the course covers, how a lesson works, that nothing advances until they say so, and what the first book promises. Twenty seconds of context buys a lot of patience later.

Never do this again after the first chapter. Repeating the orientation is how a course starts to feel like a form.

## Stopping in the middle

They will sometimes have ten minutes, not an hour. Stop at a lesson boundary whenever they ask, write the exact next lesson into `STATE.md`, and say in one line where they stopped. Then resume there next time.

Do not try to compress a chapter to fit the time available. A rushed lesson is a lesson they will have to do again.

## Before the learner leaves

At the end of a chapter, update `STATE.md` and append one line to `progress/log.md`. Then tell them to open a new session for the next chapter. The folder is the memory, not the conversation, and a chapter's worth of context is exactly the right amount to throw away.
