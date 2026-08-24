---
description: Interview me and build a new skill — instructions, exact code, artifacts, and all three kinds of test.
---

Use the `skill-builder` skill.

Interview me first — one question at a time, following its `references/interview.md`. Do not skip
the questions about which parts must be exact and what files the skill should produce; those decide
how much becomes Python and what has to be tested.

When you have enough, run `npm run skill:new` (or write the files directly in the same shape) and
generate **every** part. Do not ask me up front which parts I want; once it exists, tell me any part
can be dropped with `--skip <artifact-id>`.

Then make the scaffold real: the actual procedure in `SKILL.md`, the actual logic in `python/`, and
real expectations in the three test files. Finish with `npm run check` and show me the result,
including the performance table.
