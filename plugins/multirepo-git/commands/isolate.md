---
description: Create and switch to a new branch in the relevant sub-repo(s)
argument-hint: <branch-name>
---

Create and switch to a new branch in the relevant sub-repo(s). `$ARGUMENTS` is the new branch name. If it includes `from:<base>` (e.g. `feat/foo from:feat/baseline`), branch from `<base>` instead of the default. Default base: `dev`, fall back to `main` if `dev` doesn't exist. All commits go to the new branch only. Remember to commit once testing passes — don't leave verified work uncommitted.
