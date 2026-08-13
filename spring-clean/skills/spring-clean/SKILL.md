---
name: spring-clean
description: Deep-clean and simplify a whole repo or codebase, then leave guardrails so it stays clean. Delete dead surfaces, gitignore build artifacts, relocate dev docs, notes, clones and dumps to the project's workspace repo (the assistant-dev home base), split oversized files and functions, unify duplicated logic, draw package boundaries, run a clean-code pass (naming, function size, DRY, KISS, magic numbers, linter-warning burn-down), and encode the rules as architecture tests. Use when the user asks to clean up, declutter, tidy, simplify, restructure, or modularize a repo, asks for clean code or SOLID, wants dev docs moved out of the code tree, says "spring clean", "housekeeping", "خونه تکونی", "تمیزکاری", "کلین کد", "ساده‌سازی کدبیس", "ریپو رو مرتب کن", complains that the repo is a mess or a file is huge, or wants dead code removed and LoC reduced. Repo-scale work on the whole tree or a subtree, not a single diff.
---

Spring-clean a repository the way خونه تکونی cleans a house before the new year: everything comes out, only what belongs goes back, and the house gets rules that keep it clean. The pass is behaviour-preserving, and it is not a deletion contest. The one real pass on record was net **+5,185 lines**, and its single most valuable outcome was writing the first tests a security file ever had.

## Phase 0: frame it, before any edit

**Declare the scoreboard.** Pick the numbers this pass will be judged on, measure them now, re-measure at the end. A worked set: files over the cap, worst complexity ceiling, linter warnings, test count, architecture test files, root non-code files. **Each metric ships the command that produces it**, or it is not re-measurable: scope and off-by-one will differ, and the second measurement quietly answers a different question. **Two scoreboards, not one.** What got cleaner in the code repo is the score. What got relocated (workspace file counts, disk freed) is reported separately and is not cleaning, because a score that rewards moving files is gameable by shuffling.

**Write the red lines**, now, not when you hit them. What must not change, each with its reason: vendored slices that stay diffable against upstream, guards whose branches only run under attack, a public surface that is a contract, byte budgets you must measure rather than quote, anything the repo declares law. Also: behaviour does not change, so a change that reddens an existing test is wrong and the test is right.

**Name the gate and the other writers.** Write the exact command, and read **each exit code separately, never through a pipe**: a pipe throws the code away and `&&` hides every failure but the last. Assume a second writer in the tree: scope every commit to its own paths, stage and commit in one step, take a second reading before believing work is lost, and commit a green change immediately.

## Phase 1: survey once, then write the plan down

Read-only, wide, one agent per slice, and **never repeated**. Look for: top files by line count and functions past ~40 lines; checked-in build artifacts (if a pipeline builds it, git must not hold it); dead surfaces including CI jobs whose only trigger was removed; companion material in the code tree; the **untracked** tree, because gitignored is not clean (reference clones, data dumps, scratch folders); duplicated tables; import-graph smells; clean-code offenders in the worst files.

**The output is a file, not an inventory in context.** Sixty-two commits do not fit a context window. Write a numbered unit list to the workspace repo, one line per unit with a `state` column, and put the resume contract at the top: *read this file and `git log` at the start of every session, take the next `todo`, verify it, commit it, tick it. Never re-plan from scratch, never ask what is next.* Every finding becomes a numbered unit with one verdict. This file is what survives a dead context, and without it the survey gets paid for twice.

Record the **negative inventory** in the same file: what was checked and found clean, and every dead-code candidate rejected because a test, the manifest or a written decision reaches it. Without it the next pass re-derives all of it.

## Verdicts, one per unit

- **Delete.** Dead surface: remove the whole thing, then cascade. Its auth gates, verify scripts and CI jobs died with it.
- **Ignore.** Built elsewhere: delete from git, gitignore it, with a why comment naming who builds it now.
- **Replace.** The surface is expensive but the capability matters. Rebuild it in the cheapest form.
- **Relocate.** Companion material: move it to the workspace repo.
- **Split.** Cut along capability seams, never at line numbers. Each piece gets a name that says what it owns.
- **Unify.** One source-of-truth module, both callers import it.
- **Keep.** Generated code and true vendor snapshots, exempt from caps but marked as such.
- **Decided no, with the reason.** Leaving it alone was correct and the reason is on the record: the churn buys no failure mode, the rewrite ends byte-diffability, a test already fails on drift. An unsupervised cleaner does all of these; a recorded no is what stops it.

## The workspace repo

Every project gets one sibling repo named `<project>-workspace`, one per project rather than per code repo. It is the home base for assistant-driven development, not an archive. Engineering docs, plan archives, audit reports, notes, research, prompts, QA evidence and generated reports move there; reference clones and raw data dumps live there gitignored, never in the code tree.

**The residency test is not who reads the file.** It is whether the file imports the code and runs from a fresh checkout. Prose about the code moves. Programs that touch the code stay, and get tracked: a tool that lives gitignored on one workstation makes the rule that orders its use unrunnable, and a rule you cannot run is not a rule. A document the repo declares law stays with the code for the same reason.

## Phase 2: ledgers first, so a split has a finish line

Land the size and complexity ledgers **before** the splits, pinned at today's numbers, each with the meta-check that the ledger cannot grow. Then a split is not done until its name has left the ledger. Without that, "shuffling, not cleaning" has no detector.

## Phase 3: execute in slices

Safest first: git hygiene, artifact ignores, workspace relocations, non-code out of the code tree, dead code, defects each in its own named commit, unifications, splits and boundaries, the clean-code pass, then tests for the untested surfaces that carry the most risk. That last one is a stage, not an afterthought: it is where the real defects are found.

**After every move or delete, grep the whole tree for the old path in the same commit** — comments, markdown, CI, Dockerfile, charts, `.gitignore` — then land that scan as a standing gate. A move is the one operation whose damage is invisible to every check that already exists, because no gate reads a path out of a comment.

Two shape targets are worth aiming at because they each produced real units: the entrypoint is boot only, with routing and handlers in their own package; and imports flow through package indexes with no `../` across package lines, which becomes a boundary test encoding a direction derived from what actually co-changes. Everything else about layout is a default for a repo with no shape yet, and against a repo whose layout is already load-bearing it argues for churn.

**When a unit fails twice, change the approach, not the effort.** Revert, write the mechanism of the failure into the unit itself, then attack it differently. Two attempts at scripting a split that has no clean line boundaries is one attempt too many.

Every commit names the defect in plain words and carries the measurement, its date and the rejected alternative. That is what makes sixty commits auditable.

## The clean-code pass

Structure alone is not clean. Behaviour-preserving, on what the pass touched and the worst offenders repo-wide: names reveal intent, for everything with a name; functions do one thing, and splitting one means naming its stages; one source of truth per fact; the simplest thing that works, with speculative code a Delete rather than a Keep; every measured number named with its date and source; linter warnings burned down like the ledger. The rest is what the linter already does.

## Phase 4: prove it

Scoreboard re-measured, both halves reported separately. Ledgers shrunk. Every gate green **by exit code**. Negative inventory and decided-nos recorded in the plan file. Docs rewritten in the same branch.

**Ask about two things only**: a push to a shared remote or a history rewrite, and another person's credentials or environment. Decide everything else and do the work. On the one run this is drawn from, twenty-six of twenty-eight escalations were cold feet, and the owner said so. Anything genuinely not done says what stopped it, rather than pretending.

Hand the derived rule set to `workspace-rules`.

## Red flags

- A "split" that moves lines without drawing an import boundary. Shuffling, not cleaning.
- Gating or guarding a dead surface instead of deleting it, or deleting a surface and keeping its guards.
- Behaviour changes hiding inside refactor commits.
- Calling the repo clean while gitignored clones, dumps and scratch still sit in its working tree.
