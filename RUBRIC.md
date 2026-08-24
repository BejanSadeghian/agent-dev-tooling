# Skill rubric

Format validity (`SKILL_FORMAT.md`) says the skill is *shaped* right. The rubric says it is *ready*.
`scripts/check-rubric.mjs` enforces the machine-checkable rows; the rest is for the author and
reviewer. Toggles live under `rubric` in `skill.config.json`.

## Enforced (blocking — pre-commit + CI)

| # | Rubric item | How it is checked | Failure message |
|---|---|---|---|
| R1 | The skill matches the format spec | `scripts/validate-skill.mjs` | `format:` findings |
| R2 | A regression suite exists (>= `minCases`) | count of `evals/cases/*.json` | `no regression cases` |
| R3 | The suite has been **run** | `.skill-state/<skill>.json` exists | `never run` |
| R4 | The last run was **green** | `state.passed === true` | `last regression run failed` |
| R5 | The suite was run **after the latest edit** | content hash of skill dir === `state.contentHash` | `stale: skill edited after last regression run` |
| R6 | Every case declares an `id`, `description`, and `type` | case parse | `case missing field` |
| R7 | Case ids are unique within a skill | case parse | `duplicate case id` |
| R8 | Every artifact has an accuracy, edge and performance test | manifest × declared coverage | `artifact "x" has no accuracy test` |
| R9 | Every Python entrypoint has all three kinds too | manifest × declared coverage | `python "m.f" has no edge test` |
| R10 | Every entrypoint is measured, and stays inside its scaling budget | `.skill-state/perf/<skill>.json` | `never measured` / `scales as n^2.1` |

R8–R10 are the "every artifact is part of the test" gate: declaring an output or a function without
covering it for accuracy, edge cases, and performance fails the commit. `npm run test:new -- <skill>`
writes the missing files.

R5 is the "regression test was run after changes" gate. To satisfy it: `npm run regression -- <skill>`
(or `npm run regression` for all), then commit — the refreshed `.skill-state/<skill>.json` is part of
the change.

## Reviewed (advisory — not blocking)

| # | Item | Ask |
|---|---|---|
| A1 | Trigger precision | Does the description say when **not** to fire? Would a near-miss prompt wrongly trigger it? |
| A2 | Applied at least once | Has the skill been run end-to-end on a real task since its last substantive edit? |
| A3 | Feedback captured | Did the author's feedback from that run land as either a `SKILL.md` edit or a new regression case? |
| A4 | Case provenance | Does each case trace to a real failure or a real requirement, not a hypothetical? |
| A5 | Progressive disclosure | Is `SKILL.md` procedure-only, with depth pushed into `references/`? |
| A6 | Determinism | Do all `command` cases and Python tests run offline and produce identical output on a second run? |
| A7 | Real sizes | Does the largest performance size match the biggest input the author actually has? |
| A8 | Exactness | Is everything that must be reproducible in `python/` rather than in the prose? |
| A9 | One job per skill | If it produces several artifacts, would anyone want one without the others? Then split it. |

## Adding a rubric row

1. Add the row here.
2. Implement it in `scripts/check-rubric.mjs` (or add a config toggle).
3. Add a unit test in `tests/` proving it fails when it should.
4. Re-run the regression suites, commit hook state and all.
