# Regression tests for a skill

> Source of truth for the whole testing framework: `.framework/framework-testing.md`.

The suite answers one question: *if someone edits this skill six months from now, what must still
be true?* Tests live in `evals/tests/*.json`, one object per file. Types and fields are specified
in `.framework/FRAMEWORK.md`.

## Choosing a test type

| You want to pin | Type | Example |
|---|---|---|
| A file the skill must ship | `files_exist` | the template it fills in |
| A rule/step that must stay in the procedure | `contains` | `"patterns": ["Run the validator before"]` |
| A behaviour that was removed, or a scope creep guard | `not_contains` | `"patterns": ["also deploys"]` |
| The shape of a config/data file the skill owns | `json_shape` | `"requiredKeys": ["seed", "rows"]` |
| A helper script actually working | `command` | `"cmd": "node scripts/gen.mjs --seed 1"` |
| The deterministic entry's real output on real input | `artifact` | `"entry": "scripts/margin.py:build_margin"`, `"input": [...]`, `"expected": {...}` |

## Anatomy

```json
{
  "id": "keeps-non-trigger-boundary",
  "description": "The skill still tells the agent not to fire on plain one-off prompts.",
  "type": "contains",
  "kind": "accuracy",
  "covers": ["margin-summary"],
  "file": "SKILL.md",
  "patterns": ["Do \\*\\*not\\*\\* use for"],
  "provenance": "author feedback 2026-08-20: fired on a throwaway prompt"
}
```

`id`, `description`, `type` are required (`requiredTestFields` in `framework.json`). `provenance`
is optional but strongly encouraged — a test whose reason nobody remembers gets deleted the first
time it goes red.

## Every test states its input and its expected output

A test that cannot say what passing looks like is a placeholder, not a test. Declare the
expectation as data wherever one can be stated:

- `artifact` — `input` (the rows the entry receives) and `expected` (the exact artifact it must
  produce). The runner reports the first precise difference on failure.
- `contains` / `not_contains` — `patterns`, the shortest distinctive phrases that must stay or go.
- `json_shape` — `requiredKeys`, the dot paths the file must carry.
- `command` — `expectExitCode` and `expectStdout`, the observable behaviour of the script.
- `files_exist` — `paths`, the files the skill must ship.

## The three kinds

Every test and every Python test declares its kind, and the rubric requires all three for every
artifact and every Python entrypoint:

| Kind | Question it answers | Usually written as |
|---|---|---|
| `accuracy` | Is the output right? | an `artifact` test with a hand-computed `expected`, or a `contains` test on a hard rule |
| `edge` | What happens on empty, null, wrong type, unicode, huge, boundary? | Python `assert_survives_edge_cases` and explicit `assertRaises` |
| `performance` | How do time and memory grow with input size? | Python `self.measure(...)` with `assert_scaling` / `assert_memory_scaling` |

A JSON test declares them like this:

```json
{ "kind": "accuracy", "covers": ["category-summary"] }
```

A Python test declares them at the top of the file:

```python
KIND = "performance"
COVERS = ["category-summary", "summarize.summarize_sales"]
```

`npm run test:new -- <skill>` reports every missing combination and writes the file that closes it.

## Trial evidence

`npm run regression` records evidence beside each test: `evals/tests/<test-id>/results/results.json`
(pass/fail plus the run timestamp) is committed; `evals/tests/<test-id>/results/actual.json` (the
produced value on failure) is gitignored. Both are excluded from the freshness hash — they are
evidence of the last run, not part of the skill's definition.

## The bar for a suite

1. One test per hard rule in `SKILL.md`.
2. One test per piece of author feedback — this is the ratchet.
3. One test pinning the trigger boundary.
4. One `command` test per script the skill owns.
5. An `artifact` test with a real input and a hand-checked expected output for the doer entry.
6. Accuracy, edge and performance coverage for every artifact and every Python entrypoint.

## Anti-patterns

- **Asserting prose that will legitimately be reworded.** Pin the *rule*, using the shortest
  distinctive phrase, or pin a structural anchor (a heading, a path).
- **Flaky `command` tests.** No network, no clock, no random seed-less generation. If a script needs
  randomness, it must take a `--seed`.
- **Whole-file snapshots.** They go red on every edit and get regenerated blind, which teaches the
  team the suite is noise.
- **Tests nobody can fail.** If you cannot describe the edit that breaks it, delete it.
- **Testing the tooling instead of the skill.** `scripts/` has its own tests under `tests/`.

## Running

```bash
npm run regression -- <skill-name>    # runs + records .framework/state/<skill-name>.json
npm run regression -- --no-record     # dry run, records nothing
npm run rubric -- <skill-name>        # proves it was run after the last edit
```
