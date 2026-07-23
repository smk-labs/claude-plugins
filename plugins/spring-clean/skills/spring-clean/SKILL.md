---
name: spring-clean
description: Deep-clean and simplify a whole repo or codebase, then leave guardrails so it stays clean. Delete dead surfaces, gitignore build artifacts, relocate dev docs and notes to the project's workspace repo, split oversized files and functions, unify duplicated logic, draw package boundaries, and encode the rules as architecture tests. Use when the user asks to clean up, declutter, tidy, simplify, restructure, or modularize a repo, wants dev docs moved out of the code tree, says "spring clean", "housekeeping", "خونه تکونی", "تمیزکاری", "ساده‌سازی کدبیس", "ریپو رو مرتب کن", complains that the repo is a mess or a file is huge, or wants dead code removed and LoC reduced. Repo-scale work on the whole tree or a subtree, not a single diff.
---

Spring-clean a repository the way خونه تکونی cleans a house before the new year: everything comes out, only what belongs goes back, and the house gets rules that keep it clean. The pass is net-negative and behavior-preserving. Success is fewer lines, fewer surfaces, identical behavior, and tests that stop the mess from regrowing. Calibration from one real three-day pass on a production TypeScript service: 409 files touched, 9,272 lines added, 70,666 deleted, entrypoint from 723 lines to 44.

## Phase 0: measure, don't guess

Read-only inventory before any edit. On big repos, fan out explorer subagents for the scan; keep verdicts in the main context.

- Top 20 files by line count, plus any function past ~40 lines.
- Checked-in build artifacts: anything CI or Docker also produces. The checkout test: nothing should deploy or run from a git checkout. If a pipeline builds it, git must not hold it.
- Dead surfaces: routes, panels, feature gates, scripts, CI jobs with no live caller. Check triggers too: a job whose only trigger was removed is dead even though its YAML looks alive.
- Vendored code that has an upstream home, and eval/test plumbing riding inside production code paths.
- Companion material living in the code tree: engineering docs, plan archives, audit reports, notes, research, prompts, QA evidence, assistant config (`.claude/`, `CLAUDE.md`). It helps development but is not shipped code.
- Duplicated tables: the same retry policy, URL map, or constant list maintained in two places.
- Import-graph smells: cycles, `../` imports crossing package lines, deep imports bypassing entry points, god files everyone imports.

Output: an inventory where every item carries one verdict.

## Verdicts, one per item

- **Delete.** Dead surface: remove the whole thing, then cascade. Its auth gates, verify scripts, and CI jobs became dead the moment it went. A guard for a surface that cannot exist is pure tax.
- **Ignore.** Built-elsewhere artifact: delete from git, add to `.gitignore` with a why comment stating who builds it now.
- **Replace.** The surface is expensive but the capability matters: rebuild it in the cheapest form. A dev HTTP panel with thousands of lines can become a 90-line CLI over the same runners.
- **Relocate.** Companion material: move it to the project's workspace repo (next section). It stays in git, versioned and synced, and leaves the code tree.
- **Split.** File over the cap: cut along capability seams (what changes together), never at line numbers. Each piece gets a name that says what it owns.
- **Unify.** Duplicated logic: one source-of-truth module, both callers import it.
- **Keep.** Generated code and true vendor snapshots stay, exempt from size caps but marked as such.

## The workspace repo

Every project gets one sibling repo named `<project>-workspace`. One per project, not one per code repo: a multi-repo product (backend, frontend, agent service) shares a single workspace.

- Moves there: engineering docs and handoffs, plan archives, audit reports, notes, research, references, prompts, QA evidence, and assistant config (`.claude/`, `CLAUDE.md`) that the build does not read.
- Stays in the code repo: whatever the build, CI, or the next code commit needs. README, ARCHITECTURE.md, KNOWN-ISSUES, LICENSE, CI and deploy configs. The boundary test: if the code changes, must this file change in the same branch? Then it stays. If only humans read it across time, it moves.
- Leave a one-line pointer in the main README so newcomers find the workspace. If assistant sessions run inside the code repo, a thin `CLAUDE.md` pointing at the workspace is fine.
- Real pass: one commit removed the whole `docs/` tree (engineering handoffs, plan archives, done-plans) from a service repo; the markdown that stayed was exactly the code-locked set above.

## Phase 1: execute in slices

Safest first: (1) dead deletions, (2) artifact ignores, (3) workspace relocations, (4) unifications, (5) splits and boundaries. One branch per concern, one commit per slice, full gate (typecheck, tests, lint) between slices, merge fast. A long-lived refactor branch is a merge-conflict farm.

Defects found along the way get fixed in the same branch and named in the commit ("... and fix three defects"), never smuggled inside a refactor diff.

## The target shape

- Entrypoint is boot only. Routing and handlers live in their own package; the real pass took `server.ts` from 723 lines to 44.
- Capability packages: `modules/<name>/` with `index.ts` as the sole public entry. Big peers stay flat next to `modules/`, not nested inside.
- Functions 20 to 40 lines. Files around 300 lines in the core, 500 in the periphery. Generated code exempt.
- Imports flow through package indexes. No `../` across package lines. Pure layers (contracts, generated types, guard logic) never touch env, network, or storage.

## Phase 2: guardrails, the part most cleanups skip

Architecture lives in failing tests, not in docs or conventions that drift:

- A size test with a debt ledger: hard cap for new files, every existing violator listed by path with its current line count as its personal ceiling, and a meta-check that the ledger itself cannot grow. Debt only burns down.
- A boundary test: package-index-only imports, `../` ban, a deep-import allowlist holding only reviewed entries, cycle detection, purity scan for pure layers, and reachability analysis that prunes dev and script folders so eval-only code cannot fake liveness.
- Waivers end at zero or inside the ledger. "Waivers cleared" is part of the definition of done.
- Mirror the discipline per sub-project. A frontend gets its own structure test ("components render, adapters talk": components never fetch or touch storage directly).

## Phase 3: prove it

- Before/after table: file count, lines added and deleted, top five files then and now.
- `ARCHITECTURE.md` (or the repo's equivalent) rewritten in the same branch. Docs that don't move with the refactor are the first new mess.
- All gates green. Net line count down. Behavior identical: the pre-existing test suite passes unchanged, and any intended behavior change shipped as its own named commit.

## Red flags

- A "split" that moves lines without drawing an import boundary. That is shuffling, not cleaning.
- Gating a dead surface instead of deleting it. The maintenance tax stays.
- Deleting a surface but keeping its guards, verify scripts, or CI jobs.
- A `.gitignore` line without a rationale comment.
- Deleting knowledge that belongs in the workspace repo. If it would help the next developer, relocate it, don't trash it.
- Behavior changes hiding inside refactor commits.
- Caps enforced by review or convention instead of a failing test.
