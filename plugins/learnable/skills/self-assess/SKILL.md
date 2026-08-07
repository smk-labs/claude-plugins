---
name: self-assess
description: Placement quiz that finds someone's real level in a subject and writes it to PROFILE.md. Scenario questions in small batches, never definitions, with neutral options that cannot be eliminated by tone, plus self-report checks that separate knowing a word from being able to act on it. Use when the user asks to measure their level, wants a placement, diagnostic or self assessment, says "تعیین سطح", "آزمون بگیر", "سطحم رو بسنج", "خودارزیابی", "test my level", "where am I in X", "assess me on X", or invokes /learnable:self-assess. Also invoked by /learnable:new-course before it designs a curriculum, and re-run later to measure progress against the earlier profile.
---

# self-assess: find the real level, not the claimed one

The output is one file, `PROFILE.md`, and it aims everything that comes after it. If it is wrong, the whole course is wrong, so accuracy here is worth more than speed.

Read `reference/quiz-craft.md` before writing a single question. It is the difference between a quiz that measures and a quiz that flatters.

## Ground rules

**You never teach during a quiz.** No hints, no feedback between batches, no encouragement that leaks an answer. All explanation waits until the end.

**You never delegate the interaction.** Every question is asked from this session. Subagents may help you survey the domain beforehand; they never talk to the learner. Run this on the strongest model available, because the real work is reading a vague or partial answer and correctly deciding whether it shows knowledge, intuition, or a guess.

**"I do not know" is a good answer.** It is the cleanest signal in the whole exercise. Never discourage it, and always leave the free-text option open.

## Step 0: which kind of assessment is this

Three situations, and they need different questions.

- **New subject, no course yet.** The default. Cover the whole domain and write a fresh `PROFILE.md`.
- **An existing course, before or between books.** Read `PROFILE.md`, `TOC.md` and `progress/log.md` first. Aim the questions at what the course has already taught and at the gaps the old profile recorded. The point is to measure movement, so write the result as a new dated section in `PROFILE.md` next to the original, never over it. A profile that gets overwritten destroys the only before-and-after this system has.
- **One specific book or chapter that was already taught.** Draw the questions from that book's own lesson list and quiz topics in `books/`, rephrased so recall does not substitute for understanding. Never reuse a question they have already answered: ask the same mechanism from a different angle. Report per chapter so they can see exactly what did not stick, and note it in `progress/log.md`.

If a course exists in the folder, ask which of these they want before writing any questions.

## Step 1: scope it

You need the subject, the language, and roughly what level they are aiming at. Ask in one batched question if it is not already clear. If `new-course` invoked you, it has already gathered this and surveyed the domain, so use that and do not re-ask.

Running standalone in an unfamiliar or fast-moving domain, run two or three quick searches to learn what practitioners actually argue about. Skip it for well-trodden subjects. You are looking for the real dividing lines in the field, because those make the best questions.

## Step 2: build the blueprint

Before writing questions, write down the areas you will cover and how many questions each gets. Six to eight areas, twenty to thirty questions, four per batch. Weight toward what the learner says they care about, but cover the whole domain: the most useful finding is often in an area they never mentioned.

For every question, decide in advance what a wrong answer would prove. A question whose wrong answers all mean the same thing is a wasted question.

## Step 3: run the first pass

For each batch of four, two tool calls in the same turn:

1. A card with all the questions and every option written out in full.
2. `AskUserQuestion` with short labels as the picker.

The card is what they read. For right-to-left languages the dialog scrambles text, so the labels exist only to be clicked. Say nothing between batches.

Make one question in every second batch a self-report: four groups of terms, and which groups they could explain to another person. State plainly that recognizing a name does not count.

## Step 4: run the second pass

Now calibrate. Go harder in the areas where they scored well and easier where they struggled. This is where the real answer comes from. A single-difficulty quiz finds neither the ceiling nor the floor.

Watch for a correct answer that came from domain intuition rather than knowledge. Someone who reasons well about products can get an access control question right while knowing no security at all. Probe those again from a different angle before crediting them. This is the most common way a placement quiz overstates somebody.

If they tell you mid-quiz that the options have a pattern, that a question is unclear, or that they are guessing, take it seriously and fix it immediately. That feedback is worth more than the answer they were about to give.

## Step 5: interpret

Score it, then set the score aside. The score is almost meaningless when the distribution is uneven, which it always is. Write down the shape instead:

- Where recognition runs ahead of application, and how far.
- Any wrong answer they gave twice in different clothes. That is a stable wrong model and it deserves a whole chapter later.
- Which correct answers came from intuition rather than knowledge.
- Anything they volunteered about how they work, what they believe, or what they suspect they are faking. Quote it. A sentence like "honestly I think this is just an excuse people make" is more actionable than twenty scored answers, because it tells you how the material must be taught, not only what.

## Step 6: write PROFILE.md

Follow the shape in `reference/file-formats.md`. The two lists that matter most:

- **Already knows.** Binding. Nothing on this list gets taught again.
- **Does not know.** Concrete, with the actual wrong answers they gave.

Include a level map table with separate columns for recognition and application, their stated priorities in their own order, beliefs that need unlearning, and how they want to be worked with.

If a durable fact about this person would be useful in future unrelated sessions, and a memory system is available, save it there too. Keep course-specific detail in `PROFILE.md`.

## Step 7: report

One card, and it has to carry two things at once: the numbers they earned and the meaning behind them.

Include all of this:

- **The score**, as a real number: how many right out of how many, and the same split by area so the shape is visible at a glance.
- **The answer key.** Every question, what they answered, what was correct, and one line on why. They sat through twenty-five questions; they are owed the answers to all of them. Group it by area so it reads as a map rather than a list of verdicts.
- **The most useful finding**, first and in plain words. Lead with this, not with the score, because the score is nearly meaningless when the distribution is uneven, which it always is.
- **The level map**, recognition against application.
- **What they know and what they do not**, concretely.
- **The pattern** that explains both.

Say plainly where the quiz surprised you and where it overturned an earlier assumption, including one you made yourself. When you are re-assessing an existing course, show the before and after side by side and name what moved and what did not.

Be honest and specific. A learner who reads "you are junior in security, and here are the four answers that show it" trusts the course that follows. A learner who reads a flattering summary does not, and neither should they.

Then hand back to `/learnable:new-course`, or offer it if you were run standalone.
