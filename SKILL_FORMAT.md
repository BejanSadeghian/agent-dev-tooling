# Skill format spec

The contract every skill in this repo must satisfy. `skill.config.json` is the machine-readable
mirror of this document — the pre-commit hook and CI both read that file, so **change the JSON in
the same commit you change this page**.

> This is the starting contract. Replace/extend the sections below with your own markdown spec when
> you have it; the only thing that must move with it is `skill.config.json`.

## 1. Location + directory layout

Skills live one directory deep under a configured skills root (`skillsDirs` in `skill.config.json`,
default `.claude/skills/` and `examples/skills/`). The directory name **is** the skill name.

```
<skills-root>/<skill-name>/
  SKILL.md            # required — the only file the agent always reads
  skill.json          # required — the manifest: kind, artifacts, Python entrypoints, sequence
  references/         # optional — deep-dive docs loaded on demand
  templates/          # optional — files the skill copies/fills in
  scripts/            # optional — executable helpers the skill shells out to
  python/             # optional — the deterministic code, and its tests
    <module>.py
    tests/test_{accuracy,edge,performance}_<module>.py
  artifacts/          # optional — committed sample outputs
  assets/             # optional — static fixtures, images, sample data
  evals/
    cases/*.json      # required (>= 1) — the JSON regression suite for this skill
```

No other top-level directories are allowed inside a skill (`allowUnknownDirs: false`). Anything
that does not fit a bucket goes in `references/`.

## 2. `SKILL.md`

### Frontmatter

YAML frontmatter, first line of the file, delimited by `---`:

```yaml
---
name: skill-builder                  # kebab-case, must equal the directory name, <= 64 chars
description: >-                      # 40-1024 chars, third person, says WHAT + WHEN.
  Builds a new agent skill from raw source material by interviewing the author...
  Use when someone wants to create, refine, or regression-test a skill.
---
```

| Key | Required | Rule |
|---|---|---|
| `name` | yes | `^[a-z0-9]+(-[a-z0-9]+)*$`, equals directory name |
| `description` | yes | 40–1024 chars, and must contain a trigger clause (`Use when` / `Use this` / `Use for` / `Use whenever`) |
| `license` | no | SPDX string |
| `allowed-tools` | no | list of tool names the skill is permitted to use |
| `metadata` | no | free-form map |

Unknown frontmatter keys are a hard error — they are silently ignored at runtime, which hides typos.

### Body

Markdown, `<= 5000` words. Required headings (exact text, any order):

- `## When to use` — the trigger conditions and the explicit non-triggers.
- `## Workflow` — the numbered steps the agent follows.

Recommended additional headings: `## Inputs`, `## Outputs`, `## Rubric`, `## References`.

Forbidden anywhere in the body: `TODO`, `FIXME`, `<placeholder>`, `Lorem ipsum`. Ship it finished or
do not ship it.

Style rules (advisory, not enforced):
- Second person, imperative. "Read X, then write Y" — not "the agent should consider".
- Put procedure in `SKILL.md`; put reference material in `references/` and link it.
- One skill = one job. If the `## Workflow` has two unrelated halves, it is two skills.

## 3. `skill.json` — the manifest

Declares what the skill produces and what code it owns, so the tooling can prove both are tested.

```json
{
  "name": "sales-summary",
  "kind": "analysis",
  "summary": "Aggregates transaction rows into a per-category summary and a short brief.",
  "artifacts": [
    {
      "id": "category-summary",
      "path": "outputs/category-summary.csv",
      "kind": "data",
      "description": "One row per category: units, revenue, share.",
      "producedBy": "summarize.write_artifacts",
      "testKinds": ["accuracy", "edge", "performance"]
    }
  ],
  "python": { "dir": "python", "entrypoints": ["summarize.summarize_sales"], "maxExponent": 1.35 },
  "sequence": { "id": "example-analysis", "position": 2, "consumes": ["clean-transactions"], "produces": ["category-summary"] },
  "generation": { "generatedBy": "skill-builder", "generatedAt": "2026-08-24", "skipped": [] }
}
```

| Field | Required | Rule |
|---|---|---|
| `name` | yes | Equals the directory name and the frontmatter `name`. |
| `kind` | yes | `analysis`, `artifact`, `orchestration`, or `utility`. |
| `artifacts` | yes | Array; `[]` when the skill produces no files. |
| `artifacts[].id` | yes | kebab-case, unique across the whole repo. |
| `artifacts[].path` | yes | Where the skill writes it. |
| `artifacts[].kind` | yes | `data`, `document`, `report`, `chart`, `code`, `config`. |
| `artifacts[].generate` | no | `false` switches the part off; then `skipReason` is required. |
| `python.entrypoints` | no | `"module.function"`; the module must exist under `python/`. |
| `python.maxExponent` | no | Scaling budget for this skill's measured targets (default `1.35`). |
| `sequence` | no | This skill's place in a chain in `sequences/`. |

## 4. Deterministic Python (`python/`)

Anything that must be exact — arithmetic, parsing, thresholds, ranking, reconciliation — is code,
not prose. The module must be deterministic (no clock, no unseeded randomness, no network, total
ordering on every output), must raise `ValueError` for bad values and `TypeError` for wrong types
with the row named in the message, and should stream rather than materialise where the input can be
large.

Its tests live in `python/tests/`, one file per kind, and are `unittest.TestCase` subclasses built
on `skillharness` — so they run under plain `python3 -m unittest` with nothing installed, and under
pytest when it is available.

## 5. Test kinds and coverage

Every test declares which kind it is and what it covers. **Every artifact and every Python
entrypoint needs all three kinds.**

| Kind | Question it answers |
|---|---|
| `accuracy` | Is the output right, and does it reconcile? |
| `edge` | Empty, single, null, missing, wrong type, unicode, oversized, boundary values. |
| `performance` | How do compute time and peak memory grow with input size? |

A JSON case declares it inline:

```json
{ "kind": "accuracy", "covers": ["category-summary"] }
```

A Python test declares it at the top of the file:

```python
KIND = "performance"
COVERS = ["category-summary", "summarize.summarize_sales"]
```

`npm run test:new -- <skill>` reports every missing combination and writes the file that closes it.

## 6. Sequences (`sequences/*.json`)

A chain of skills where each step consumes what an earlier step produced. Artifact generation is
split across skills precisely so each step is testable on its own.

```json
{
  "id": "example-analysis",
  "inputs": ["raw-transactions"],
  "steps": [
    { "skill": "clean-transactions", "consumes": ["raw-transactions"], "produces": ["clean-transactions"] },
    { "skill": "sales-summary", "consumes": ["clean-transactions"], "produces": ["category-summary"] }
  ]
}
```

`npm run health` checks that every named skill exists, that everything consumed is produced upstream
or listed in `inputs`, and that no two skills claim the same artifact id.

## 7. Regression suite (`evals/cases/*.json`)

Every skill carries its own regression cases. One JSON object per file:

```json
{
  "id": "frontmatter-has-trigger",
  "description": "The skill description states an explicit trigger condition.",
  "type": "contains",
  "file": "SKILL.md",
  "patterns": ["Use when"]
}
```

Supported `type` values — see `scripts/run-regression.mjs`:

| type | fields | passes when |
|---|---|---|
| `files_exist` | `paths[]` | every path exists inside the skill dir |
| `contains` | `file`, `patterns[]` | every regex matches the file |
| `not_contains` | `file`, `patterns[]` | no regex matches the file |
| `json_shape` | `file`, `requiredKeys[]` | file parses as JSON and has the keys (dot paths) |
| `command` | `cmd`, optional `expectExitCode` (default 0), `expectStdout[]` | the command behaves as declared |

`command` cases run from the skill directory. They must be deterministic and offline — no network,
no model calls, no wall-clock dependence. A case that can flake is not a regression test.

## 8. Freshness rule

`scripts/run-regression.mjs` runs the JSON cases **and** the Python tests, hashes every file in the
skill directory, and records the result in `.skill-state/<skill-name>.json`, with the performance
measurements in `.skill-state/perf/<skill-name>.json`. The rubric gate fails if the current hash differs from the
recorded one — i.e. **you edited the skill and did not re-run its regression suite**. That is the
"rubric has been met" check the hook and CI enforce. See `RUBRIC.md`.
