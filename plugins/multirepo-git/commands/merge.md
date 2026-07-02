---
description: Merge branches into dev across all sub-repos
argument-hint: [branch-name]
---

Merge branches into `dev` across all sub-repos. If `$ARGUMENTS` names a specific branch, merge only that one; otherwise merge all branches ahead of `dev`. If `$ARGUMENTS` includes `to:<target>` (e.g. `feat/foo to:feat/baseline`), merge into `<target>` instead of `dev`. Default target: `dev`.

Resolve conflicts autonomously. Escalate only important product direction or system architecture decisions.
