---
name: workspace-rules
description: Give a repo its own rules and make the build enforce them, then keep the set small enough to hold in one head. Work out the rules from this repo's evidence (its defect log, its prose, its suppressions, its linter), encode each as a linter setting, an architecture test or a hook so breaking it turns the build red, and write the cap, the displacement clause and the dated judged-out list into the check file itself. Runs after a cleanup, spring-clean or otherwise. Use when the user asks to set house rules, lock in conventions, stop a bug class from coming back, make the linter enforce the style guide, turn a CLAUDE.md or README rule into a test, add architecture tests or guardrails, prune a rule set that has sprawled, wants a codebase standard that holds, or says "house rules", "workspace rules", "قانون بذار", "قوانین پروژه", "استاندارد کد", "این قانون رو تست کن", or complains that a rule everyone agreed on keeps getting broken.
---

A clean repo with rules in a document will be dirty again. This pass leaves rules the build enforces, and puts the governance that keeps the set small inside the check file, where a reader of the check hits it. A rule that cannot fail is a comment.

## One rule is one named detector

A check that can go red on its own and names itself when it does: one `describe` title, one linter key at `error`. Count the set by grepping your own check files. A count no machine can take cannot be asserted, and an unasserted cap is the prose this skill exists to replace. Every cap and every displacement below means this and nothing else.

Its failure message names the offender too, not just the rule. An assertion that prints `expected <= 16, received 17` has told you a rule broke and left you to find out where by hand.

## Derive from this repo, never from a list

- **The `fix:` and revert log, whole history.** A revert outranks a fix: it got past every gate already there. Cluster by defect class and date every cluster.
- **The shape of the repairing diff.** It names the mechanism. A one-line guard added in five files is a scan; a corrected config value is a contract test.
- **Prose already in the tree**, plus every comment carrying never, always, careful. Pre-agreed, so it needs a gate, not a debate.
- **Suppressions and waivers.** Each is a rule somebody started writing and abandoned.
- **The linter's off switches**, crossed against the log. Cheapest wins.
- **What already runs**, so you do not re-encode a live gate, and **what nothing sees**: a directory that is production for one rule and invisible to another is itself a finding.

Each rule carries its evidence in a comment on the check: the shas, the date of the last occurrence, what the miss cost. A defect class last seen in code since rewritten is history, not a rule. Only if the log runs dry, consult the classes that recur across repos as a lookup, never as a starting list: unread exports, calls with no deadline, a dangerous capability copied without its guard, a hand-maintained index that drifted, output bypassing the one sink that scrubs, an applied migration edited in place. A rule that would fit any repo in this language came from training, not from this tree.

## Four rules about the rule set

**1. Pin what exists, forbid the next one.** A rule the repo already breaks ships with every violator listed at its measured value, never a round number above it. Three assertions beside it: nothing over its ceiling, no entry that now measures under it, and the ledger's own length capped. Without the last one the ledger is a place to put new debt.

**2. Seen red by name, and green on an untouched tree.** No rule enters until it has been broken on purpose and watched to fail *by name* in the real gate, not in a harness. Then assert the other half: the gate exits 0 on unmodified HEAD. A check that can only fail spuriously is worse than no check, and it is the one failure nobody notices, because it looks like rigour.

**3. One gate, already running, and cheap.** Rules land in the command CI already runs. No new job, no step anyone must remember. Where the whole gate is slow, scope the per-commit run to the paths that changed and run the tree whole once; the guard on the rules themselves fires only when the rules change, which costs nothing on the commits that are not about rules and is impossible to forget on the ones that are.

**4. Every name resolves, and is written once.** A path in a comment, a doc or an error message must exist; a command a doc names must exist in the manifest. Scan for it. Then write each rule exactly once, in the check, and make every other mention a pointer, because the duplicate is what drifts: across four workspaces the file under test is the only one that stayed true.

## Calibrate the scope, before choosing a mechanism

Run each detector over the whole tree and read the count. A handful of hits is a ledger you can pin. Hundreds means you aimed at the wrong files, and the rule you actually meant is the narrow one underneath. The count is also where the blind spots show: a directory that returns nothing is either clean or unseen, and those look identical until you check.

## Encode with the cheapest thing that turns red

Before scanning for a misuse, try removing the capability: delete the export, narrow the visibility, drop the dependency, take the tool away. A thing that cannot be reached needs no rule. Otherwise take the first that fits: a linter setting, then a linter rule pinned to what exists, then an architecture test, then a hook that refuses the edit at the tool boundary, then a CI job for what the test runner cannot see.

Then tier it. Block only where the detector reaches near-zero false positives on this tree; otherwise warn, and name in its header which layer does block, so no class is gated twice. A check that fires on correct code trains everyone to ignore red, and that costs more than the defect it catches.

## The cap is a measurement, and the set must be able to shrink

Count the detectors today, assert that number, and add the displacement clause: a rule that wants in has to push one out. Retire a rule when the surface it guarded is gone, when a linter version or another rule now covers it, when its scope matches zero files, or when it has never caught anything and no new evidence has appeared. A retired rule is never quietly deleted: it goes to a dated judged-out list at the top of the check file it left, with the reason, so nobody re-derives it next quarter. Cap, clause and list all live in the check, not in a scheduled audit nobody will run.

## What stays prose

Only what no machine can judge: how a surface looks, what someone else's binary does with your flags, where a thing belongs. Each such rule ships a runnable tool, in the repo, inside the gate, named by a path the citation scan checks. "We agreed on it" is not a reason to leave it prose; it is the reason to encode it.

## Red flags

- A rule with no commit behind it, or one that would fit any repo in this language.
- A ledger of globs, a waiver with no reason, or a ledger nothing stops from growing.
- A check whose scope matches nothing, or whose exit code dies in a pipe.
- A rule written in three places, counted in a comment that nothing verifies.
- An escape hatch whose convention is "justify it in the commit message". Nothing reads commit messages.
