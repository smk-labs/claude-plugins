# cursor-copy-writing-fa

Persian web copy written by Cursor workers, on Cursor's quota, with Claude
holding the brief and the acceptance gate.

Plain version: you ask for a Persian article or product description, Cursor
writes it, a linter checks the Persian, and Claude only ships what passes.

## Why the models are split

Model routing here is measured, not guessed. A live bake-off ran seven Cursor
models through the same two tasks: writing a copy pack (product description,
article section, SEO, microcopy) and copy-editing a deliberately broken Persian
draft.

| Stage | Model | Evidence |
|---|---|---|
| Write | `claude-opus-5-high` | Best prose. Varied rhythm, concrete images, correct coffee science. The only model that respected the word cap and the SEO character limits. |
| Audit | `gpt-5.6-sol-high` | Sharpest proofreader: found 50 errors in the broken draft, more than any other model. A weak writer though. |
| Bulk | `auto` | Free and quota-less on paid plans. Fine for volume drafts. |

The surprise: GPT is the best *proofreader*, not the best *writer*. In round one
`gpt-5.6-sol-high` wrote metronomic, repetitive Persian and overran the brief by
37%. In round two it was untouchable. Gemini 3.1 Pro was typographically clean
but had no editorial judgement: its rewrite kept the unverifiable "۲۴ ساعته"
claim and the ad-cliché rhetorical question the brief asked it to cut.

## fa-lint

A Persian web-copy linter with no third-party dependencies.

```bash
python3 scripts/fa-lint.py content/mag/article.mdx
```

It enforces ZWNJ (نیم‌فاصله), Persian punctuation and digits, Arabic-letter
slips, administrative words (جهت، می‌باشد، اقدام به...نمودن), ad clichés,
formal-you, and sentence length. Errors exit 1; warnings are judgement calls.
Code blocks, YAML frontmatter, JSX/MDX tags, links and URLs are masked out, so
it runs straight over `.mdx`.

Validated against the bake-off corpus: 27 errors on the planted-error draft,
clean on the site's published house-style article, and it independently caught
the exact two flaws a human review had flagged in the Gemini sample.

## Requires

The `cursor-delegate` plugin (Cursor CLI plus `~/.claude-deck/cursor/agent-keys.json`).
This plugin supplies the brief, the rulebook and the gate; cursor-delegate
supplies the workers.

## Layout

- `skills/cursor-copy-writing-fa/SKILL.md` — the five-stage workflow
- `skills/cursor-copy-writing-fa/rulebook.md` — the Persian writing contract
- `scripts/fa-lint.py` — the enforcement
