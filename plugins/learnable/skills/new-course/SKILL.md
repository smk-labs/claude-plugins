---
name: new-course
description: Build a whole course on a subject, from scratch, on disk. A light survey of the domain, then the placement-quiz decision, then a deep multi-agent research pass that becomes an ordered taxonomy, a table of contents grouped into books and chapters, and a course folder that teaches itself. Use when the user asks for a course, curriculum, syllabus, study plan, roadmap or taxonomy on a topic, says "دوره بساز", "کورس جدید", "برنامه درسی", "نقشه یادگیری", "build me a course on X", "I want to learn X properly", or invokes /learnable:new-course. Run once per subject; use /learnable:new-book afterwards for each book of chapters.
---

# new-course: from "I want to learn X" to a course on disk

You are building a curriculum, not answering a question. The output is a folder the learner can walk into for months.

Read `reference/teaching-rules.md` and `reference/file-formats.md` before you start. They are the contract.

## Before anything

Check that the card tool from the **readable** plugin is available. Every lesson is delivered as a card, and right-to-left languages only render correctly inside one. If it is missing, tell the learner to install `readable` from the `smk` marketplace, and stop.

You will be talking to the learner throughout. **Never delegate an interaction to a subagent.** Subagents research and write files; they never ask the learner anything. Interaction stays in this session, which should be running the strongest available model, because reading a half-formed answer charitably and finding the misconception underneath it is the hardest judgment in this whole system. If the session is on a small model, say so and suggest switching before the placement quiz.

## Step 1: what do they want

You need four things: the subject, the language they learn in, what they want to be able to do at the end, and where the course folder goes. Ask for whatever is missing in ONE batched question. Do not interview them.

Default the folder to a new directory named after the subject, and confirm the path.

## Step 2: a light survey, not research yet

Run two to four web searches, breadth only. You are answering three questions for yourself:

- What are the main areas of this domain, in the words practitioners actually use?
- What does the ladder look like from beginner to expert?
- What parts are contested or move fast, and will need a fresh look later?

Do not go deep. Do not fetch pages. This step exists so the placement quiz asks about the right things and so you can show the learner the shape of the domain in a card: the areas you found, and roughly what a course would cover. This is also their chance to say "actually I only care about this half".

## Step 3: offer the placement quiz, and let them decline

Send a card explaining the choice plainly, then a picker.

- **With a placement quiz.** Twenty to thirty scenario questions in small batches. It finds what they already know so the course never wastes their time, and it finds the wrong models worth a whole chapter. Costs about half an hour.
- **Without one.** Faster. They tell you their level and where to start, and the course assumes a standard ladder.
- **From a specific topic.** They already know where they want to begin.

**If they accept:** invoke the `self-assess` skill now. It writes `PROFILE.md`. Come back here when it is done.

**If they decline:** ask, in one batched question, their current level in this domain, what they already know well enough to skip, whether they can read code, and anything they want left out. Write a short `PROFILE.md` from their answers and mark it as self-reported rather than measured, in the file itself.

Either way, `PROFILE.md` exists before you spend a single research agent. **The deep research happens after this decision, never before.** Research aimed at the wrong level is the most expensive mistake this skill can make, and it is unrecoverable without re-running the whole fleet.

## Step 4: design the track list

This is your judgment call, not an agent's. From the survey and `PROFILE.md`, name eight to fourteen tracks that cover the domain with as little overlap as you can manage. For each track write a one-line title and a dense scope sentence listing the concepts it owns.

Two rules that matter more than they look:

- Add a track for the foundations underneath the domain if the profile shows the learner is missing them. The most valuable track is often the one they did not ask for, because it is the reason nothing else ever stuck.
- Write down what each track does NOT cover, so two agents do not both produce the same chapter.

## Step 5: the deep research pass

Create `.course/tracks/`. Then run one `track-researcher` agent per track, in parallel. Give each one:

- the full learner profile, verbatim, including what must never be taught
- its track title and scope, and what it must leave to other tracks
- the exact output path, `.course/tracks/<TRACK_ID>.json`
- the chapter and lesson format from `reference/file-formats.md`

Run them as one orchestrated fan-out if a workflow tool is available, since one fleet of eight to fourteen agents with a synthesis pass afterwards is exactly the shape a workflow is for. Otherwise launch them as parallel background agents in a single message. Either way they must write to disk rather than returning content.

Three hard constraints in every research prompt, learned the hard way:

1. At most two or three web searches, then stop and rely on their own knowledge. An agent told to research thoroughly will loop on searches and hang.
2. No page fetching.
3. Write the JSON to disk and return only a one-line summary. Never return the content, or you will fill this session's context with material you are about to compress anyway.

If an agent stalls, stop it, keep everything already on disk, and re-run only the missing tracks with a tighter prompt. Never restart the fleet.

## Step 6: synthesis

Thirteen good drafts are not a course. They overlap, they disagree about ordering, and together they are far too long.

First compress: for each track file write a stripped copy to `.course/compact/<TRACK_ID>.json` keeping only chapter id, title, goal, prerequisites, and for each lesson its title, opening question and key terms. Drop teaching angles and sources. Keep the files separate and small so one agent can read them all without truncation.

Then run a single synthesis agent on the strongest model over the compact files. Its job:

- **Dedupe aggressively.** Every concept gets exactly one owner chapter. A surviving duplicate is a failure.
- **Cut and compress ruthlessly.** Anything redundant with what the learner already knows, or nice-to-have rather than gap-closing, gets cut or folded into one lesson elsewhere. Expect to lose a fifth to a third of the drafted chapters. Their time is the scarce resource.
- **Order by real prerequisite.** A prerequisite always beats a stated priority. Record every place that happened and why, because the learner will ask why their top priority is not first.
- **Group into books** of four to six chapters, each a finishable chunk with a plain-language name and a one-sentence promise.
- **Quality-check every opening question** and rewrite the ones that are definitions, too easy for the measured level, unanswerable without the lesson, or dependent on reading code.
- Name the ten highest-leverage lessons, and flag only the chapters that genuinely need a fresh research pass before authoring.

It writes `.course/synthesis.json` and returns a short summary. Have it verify before writing: every chapter appears in exactly one book, no cut chapter survives in the sequence, and every prerequisite resolves to something earlier.

## Step 7: write the course

Generate the files exactly as `reference/file-formats.md` describes: `TAXONOMY.md`, `TOC.md`, `STATE.md`, `NEXT.md`, `README.md`, `progress/log.md`, and the course's own `CLAUDE.md` from `reference/course-claude-md.md`.

Prefer a small script over hand-copying for the mechanical parts of `TOC.md` and `TAXONOMY.md`. There are dozens of chapters and hundreds of concepts, and transcribing them by hand invites silent omissions. The taxonomy's entire value is that nothing is silently missing.

Everything the learner reads goes in their language. Chapter titles may stay in English when they are strings of technical terms, but every sentence around them is translated. Check the finished files for em-dashes and en-dashes and remove them.

## Step 8: hand off

Report in one card: the book list with what each one delivers, the counts, where a prerequisite overrode their stated priority, and anything you cut that they explicitly asked for and why it survives elsewhere. That last one matters. If they asked for design patterns and the synthesis folded four of them into another chapter, tell them before they discover it.

Then point at `/learnable:new-book` to write the first book.
