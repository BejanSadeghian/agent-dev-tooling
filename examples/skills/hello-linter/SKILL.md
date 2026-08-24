---
name: hello-linter
description: >-
  Minimal reference skill showing the smallest thing that passes this repo's format spec and rubric:
  frontmatter, the two required headings, and one regression case. Use when you want a working
  example to copy before writing a real skill, or a fixture to test the tooling against.
---

# Hello linter

The smallest valid skill. Copy it, rename the directory and the `name`, then rewrite everything else.

## When to use

Use when you need a known-good example of the skill layout, or a fixture for exercising
`validate-skill.mjs`, `run-regression.mjs`, and `check-rubric.mjs`.

Do **not** use it as a real skill — it does no work. To build one, use `skill-builder`.

## Workflow

1. Copy this directory to `.claude/skills/<your-skill>/`.
2. Rename `name:` in the frontmatter to match the new directory, and rewrite the `description`
   so it says what the skill does and ends with an explicit "Use when ..." trigger clause.
3. Replace this section with the real procedure, one numbered step each.
4. Replace `evals/cases/` with cases that pin your skill's hard rules.
5. Run `npm run verify` and commit the refreshed `.skill-state/<your-skill>.json` with the change.
