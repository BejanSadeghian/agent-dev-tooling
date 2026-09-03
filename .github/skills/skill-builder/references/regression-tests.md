# Regression tests for a skill

> Source of truth for the whole testing framework: `.framework/framework-testing.md`.

The suite answers one question: *if someone edits this skill six months from now, what must still
be true?* Cases live in `evals/cases/*.json`, one object per file. Types and fields are specified
in `.framework/FRAMEWORK.md`.

## Choosing a case type

| You want to pin | Type | Example |
|---|---|---|
| A file the skill must ship | `files_exist` | the template it fills in |
| A rule/step that must stay in the procedure | `contains` | `"patterns": ["Run the validator before"]` |
| A behaviour that was removed, or a scope creep guard | `not_contains` | `"patterns": ["also deploys"]` |
| The shape of a config/data file the skill owns | `json_shape` | `"requiredKeys": ["seed", "rows"]` |
| A helper script actually working | `command` | `"cmd": "node scripts/gen.mjs --seed 1"` |

## Anatomy

```json
{
  "id": "keeps-non-trigger-boundary",
  "description": "The skill still tells the agent not to fire on plain one-off prompts.",
  "type": "contains",
  "file": "SKILL.md",
  "patterns": ["Do \\*\\*not\\*\\* use for"],
  "provenance": "author feedback 2026-08-20: fired on a throwaway prompt"
}
```

`id`, `description`, `type` are required (`requiredCaseFields` in `skill.config.json`). `provenance`
is optional but strongly encouraged — a case whose reason nobody remembers gets deleted the first
time it goes red.

## The three kinds

Every case and every Python test declares its kind, and the rubric requires all three for every
artifact and every Python entrypoint:

| Kind | Question it answers | Usually written as |
|---|---|---|
| `accuracy` | Is the output right? | Python `assert_rows_equal` / `assert_sums_to`, or a `contains` case on a hard rule |
| `edge` | What happens on empty, null, wrong type, unicode, huge, boundary? | Python `assert_survives_edge_cases` and explicit `assertRaises` |
| `performance` | How do time and memory grow with input size? | Python `self.measure(...)` with `assert_scaling` / `assert_memory_scaling` |

A JSON case declares them like this:

```json
{ "kind": "accuracy", "covers": ["category-summary"] }
```

A Python test declares them at the top of the file:

```python
KIND = "performance"
COVERS = ["category-summary", "summarize.summarize_sales"]
```

`npm run test:new -- <skill>` reports every missing combination and writes the file that closes it.

## The bar for a suite

1. One case per hard rule in `SKILL.md`.
2. One case per piece of author feedback — this is the ratchet.
3. One case pinning the trigger boundary.
4. One `command` case per script the skill owns.
5. Accuracy, edge and performance coverage for every artifact and every Python entrypoint.

## Anti-patterns

- **Asserting prose that will legitimately be reworded.** Pin the *rule*, using the shortest
  distinctive phrase, or pin a structural anchor (a heading, a path).
- **Flaky `command` cases.** No network, no clock, no random seed-less generation. If a script needs
  randomness, it must take a `--seed`.
- **Whole-file snapshots.** They go red on every edit and get regenerated blind, which teaches the
  team the suite is noise.
- **Cases nobody can fail.** If you cannot describe the edit that breaks it, delete it.
- **Testing the tooling instead of the skill.** `scripts/` has its own tests under `tests/`.

## Running

```bash
node scripts/run-regression.mjs <skill-name>    # runs + records .framework/state/<skill-name>.json
node scripts/run-regression.mjs --no-record     # dry run, records nothing
node scripts/check-rubric.mjs <skill-name>      # proves it was run after the last edit
```
