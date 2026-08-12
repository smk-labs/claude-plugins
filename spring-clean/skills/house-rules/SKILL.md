---
name: house-rules
description: Give a repo its own clean-code rules and make the build enforce them. Work out the rules from this repo's evidence (its language, its layout, its linter, and the defects its own git history keeps repeating), then encode each one as a linter setting, an architecture test or a CI check, so breaking it turns the build red. Runs after a cleanup, spring-clean or otherwise. Use when the user asks to set house rules, lock in conventions, stop a bug class from coming back, make the linter enforce the style guide, turn a CLAUDE.md or README rule into a test, add architecture tests or guardrails, wants a codebase standard that holds, or says "house rules", "قانون بذار", "قوانین پروژه", "استاندارد کد", "این قانون رو تست کن", or complains that a rule everyone agreed on keeps getting broken.
---

A clean repo with rules in a document is a repo that will be dirty again. This pass leaves rules the build enforces: each one fails a command someone already runs. A rule that cannot fail is a comment.

Follow spring-clean, do not repeat it. It cleans and leaves size and boundary tests; this derives the rest of the rule set and encodes it.

## Derive the rules from this repo

A list any repo could have been handed is the failure mode. Read, in this order, and stop at six to ten rules this repo has actually broken:

- **The `fix:` log**, whole history. Every fix names a defect that shipped. A class that shows up three times is a rule, and it is the source that makes the set unmistakably this repo's.
- **The prose already in the tree.** `CLAUDE.md`, README, CONTRIBUTING, the "things to watch out for" list. Rules the team already agreed on with nothing behind them. Pre-approved; they need a gate, not a debate.
- **The linter's off switches.** Most repos run `recommended` and stop. Cross the off rules against the defect log: those are the cheapest wins on the list.
- **What is already enforced.** Read the tests and CI first. Re-encoding a live gate is noise.

Every rule carries the commit that earned it, in a comment on the check. A rule with no evidence behind it is a checklist item. Drop it.

Before fixing a rule's scope, run it over the whole repo and read the count. The first scope is always too wide. A handful of hits is a ledger; hundreds means you aimed at the wrong files, and the rule you actually meant is the narrow one underneath.

## Encode with the cheapest thing that turns red

Take the first mechanism that fits:

1. **A linter rule you switch on.** One config line, no new code, runs where lint already runs.
2. **A linter rule pinned to what exists** (below). For rules the repo breaks today.
3. **An architecture test**: a source scan, an import boundary, a frozen-file checksum, a ledger. For anything the linter has no rule for.
4. **A CI job.** Only for what the test runner cannot see: an image that builds, a migration applied twice, a chart that renders.

## Pin what exists, forbid the next one

A rule the repo already breaks forty times is not a reason to write prose. Ship it with the forty pinned:

- Per-file ceilings set to each file's **current** measurement, never a round number above it. The gate is green today and every ceiling can only come down.
- Where a linter takes per-path options, the ledger is tiers of the linter's own threshold, not the rule switched off. Off means a file can get worse; a ceiling means it cannot.
- Waivers are named entries with a reason each, never a pattern. A glob is not a ledger.
- One assertion that the ledger itself cannot grow. Without it the ledger is a place to put new debt.

## One gate, already running

Rules go in a command the repo runs today, at the same effort it runs now. A rule needing a new tool, a new job, or a step someone must remember is prose with a filename. If it does not run on every push, it does not exist.

## Prove every rule

Per rule, not once for the set: break it in the working tree, run the gate, watch that rule fail by name, revert. A rule that stays green is prose wearing a rule's clothes, so go back and encode it properly. Do this before writing a word about the rule anywhere.

## What stays prose

Only what no machine can see: a judgment about what belongs where, a claim that has to be checked against a rendered surface or a binary you do not own, a re-measurement on someone else's release. That list is short, lives with the repo's other instructions, and every line says why it is not a test. "We agreed on it" is not a reason; it is the reason to encode it.

## Red flags

- A rule that would fit any repo in this language. It came from your training, not from the repo.
- A rule with no commit behind it.
- A cap in a comment next to code that does not read it.
- A ledger of globs, a waiver with no reason, or a ledger with nothing stopping it from growing.
- A new CI job nobody wired into the pipeline that runs.
- Thirty rules. That is a checklist. Six to ten defects this repo repeats is a standard.
