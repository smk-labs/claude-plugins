---
name: workspace-rules
description: Give a repo its own rules and make the build enforce them, then keep the set small enough to hold in one head. Work out the rules from this repo's evidence (the headers of the gates it already runs, its defect log, its prose, its suppressions, its linter), encode each as a linter setting, an architecture test or a hook so breaking it turns the build red, and write the cap, the displacement clause and the dated judged-out list into the check file itself. Runs after a cleanup, spring-clean or otherwise. Use when the user asks to set house rules, lock in conventions, stop a bug class from coming back, make the linter enforce the style guide, turn a CLAUDE.md or README rule into a test, add architecture tests or guardrails, prune a rule set that has sprawled, wants a codebase standard that holds, or says "house rules", "workspace rules", "قانون بذار", "قوانین پروژه", "استاندارد کد", "این قانون رو تست کن", or complains that a rule everyone agreed on keeps getting broken.
---

A clean repo with rules in a document will be dirty again. This pass leaves rules the build enforces, and puts the governance that keeps the set small inside the check file, where a reader of the check hits it. A rule that cannot fail is a comment, and a rule that admits it is at least an honest one.

## One rule is one named detector

A check that can go red on its own and names itself when it does. **The unit is the name printed when it fails**: one `describe` title rather than each assertion inside it, one named check in a gate script rather than the file it shares, one linter key at `error`. Anything else and the same set measures twice or eight times larger depending on how someone split their functions. Count standing rules only, the ones that scan the tree, and count what already exists before your own. The message itself is an instruction rather than a diagnosis: name the offender, then the command that fixes it, because the reader is someone about to finish a turn, and one failure names one cause rather than offering a reader two.

## Derive from this repo, never from a list

- **The headers of the gates that already run.** Where a repo has machinery, this is the richest source in it: the scripts carry the rule and their comments carry the why, including the scope somebody already deleted and the reason.
- **The `fix:` and revert log**, deduped, because a rebase leaves the same subject twice. Cluster by defect class and date every cluster.
- **The decision log.** A decision that changed a count becomes an equality assertion on that count.
- **Prose in the tree**, every comment carrying never or always, and the **suppressions**, each of which is a rule somebody started writing and abandoned.
- **Your own session transcripts.** A whole class of defect costs real time and never appears in a diff.
- **What already runs**, so you subtract rather than re-encode, and **what nothing sees**: a directory that is production for one rule and invisible to another is where the violations live.

Each rule carries the incident that bought it: what happened, the date, and what the miss cost in this repo's own units, plus the sha where the history is deep enough to resolve one. A sha alone is not the receipt, and on a shallow clone it is not even a pointer. **No incident, no slot**, and no mechanism, no slot either: the largest cluster in a log is often real, dated, expensive and has nothing a check could ever catch. Generic is not the disqualifier, unpaid is: run the generic sweep if you like, and let the tree win every tie.

## Calibrate the scope, before choosing a mechanism

Run each detector over the whole tree with the code you will ship, not a grep standing in for it, and read the count. A handful is a ledger. Hundreds means you aimed at the wrong files. **Prove the search path exists before you believe an empty result**: a scan of a directory that is not there exits clean and reads exactly like no hits, and a second reviewer inherits the same bad path and confirms it.

## Four rules about the rule set

**1. A rule the tree already satisfies just ships. One it breaks takes one of three shapes.** Pin every current violator at its measured value, with no unpinned violator, no pinned non-violator, and the ledger's own length capped. Or set the limit at the target and **warn** until the slack closes, which is how you install a limit you cannot meet yet without lying. Or scope the detector to added lines only, which needs no ledger at all. What it never does is ship as a block that has to be bypassed on day one. Pin only where the repair is a project; a pinned typo is a certified lie, and a pin that just records today's tree rubber-stamps the drift.

**2. Seen red by name, and green on an untouched tree.** Break it on purpose, watch it fail by name in the real gate, and prove it **once per file class it claims to cover**, meaning directory plus extension, **and once per trigger that runs it**: a gate that exits 0 while covering the wrong file set is the common failure, and one that passes in your shell can die in the build's own shell. Then assert the other half: the gate exits 0 on unmodified HEAD, measured where CI measures it. Keep the probe and date it. Every detector needs outcomes past pass and fail: could-not-run, and out-of-scope where the build context is narrower than the repo. Neither is green, and neither counts as a rule.

**3. One gate, already running, and reachable.** Rules land in the command that already runs. Before deciding there is none, look past the test suite: a container build, a packaging step or a release script is a gate, and is often the only one whose failure actually stops a deploy. Trigger on the edit rather than the commit where the harness allows it, since that is sooner and catches someone who never commits, and scope the trigger to the paths that changed, which is what lets a heavy guard exist at all. Then assert the reverse: **every executable gate is reachable from a trigger, and the trigger itself is committed.** A hook in an ignored settings file is a rule that exists on one machine. The dominant failure here is not a wrong check, it is a correct one nothing invokes. Deny the bypass at the layer above, or the flag that skips the gate is the gate.

**4. Every name resolves, in both directions, and is written once.** A path or a command in a doc, a comment or an error message must exist, commands checked against the target's manifest. Assert correspondence, not presence: a declared name must equal the thing it names, or a rename passes green. Scan prose cross-references too, which is how a corpus rots. Then write each rule once and make every other mention a pointer, because the duplicate is what drifts; where a copy is unavoidable, generate it and byte-compare it.

## Encode with the cheapest thing that turns red

Remove the capability before scanning for its misuse: delete the export, narrow the visibility, drop the dependency, take the tool away, cap the timeout. Then assert the inverse, that whoever needs the capability still has it. Check the default posture first, because omission from an allow list is not removal.

Otherwise: a linter setting, a linter rule pinned to what exists, an architecture test, a hook that refuses the edit, a CI job. A detector written into a document is not on this ladder at all; it is a comment until something runs it, and it looks exactly like enforcement. When a rule keeps getting broken, move it down a rung and record which rung it came from.

Block only where the detector reaches near-zero false positives on this tree; otherwise warn, and name in its header which layer does block. A check that fires on correct code trains everyone to ignore red, and the fix is to delete it and write the deleted scope and its reason into the gate's header, so nobody improves it back.

Where only a person can judge the violation, do not leave it prose: **make the declaration mandatory and grep for the declaration.** No declaration is the violation. What stays genuinely un-mechanised says so, states its adoption rate, and names the exact config key that would upgrade it, because a rule that knows whether it is checked is worth three that do not. And add the cheapest device in any rule set: **a list of what this repo does not have**, each entry a plausible thing somebody once confidently referenced. It stops the invention in one direction and the phantom violation in the other. Keep it out of prose by asserting that none of its entries has appeared, so the day one does, the list fails instead of going quietly stale.

## The cap is a measurement, and the set must shrink

Count the detectors today, assert that number, and add the displacement clause: a rule that wants in pushes one out. An unasserted cap is the wish this skill exists to replace. Retire a rule when its surface is gone, when another rule covers it, when its scope matches zero files, or when it never caught anything. Say which rules you deliberately do not check and why, beside the ones you do. A rule found wrong is retracted where it sits, with the date, and a rule naming a library is checked against the manifest.

## Red flags

- An exception whose receipt is a commit message. Make it a token on the line, in the file the check already scans.
- A detector whose coverage is set by an optional field, measuring its own opt-in rate and printing green.
- A gate whose exit code dies in a pipe, that reports pass when it could not run, or that read a stale tree.
- A rule with no stated boundary, or none saying whether it or the surrounding code wins. Both get resolved by every reader differently, and the ones who take a rule most seriously are the ones who over-apply it.
