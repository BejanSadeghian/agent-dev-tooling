# Data generation framework

**This document is the source of truth for test and fixture data.** Other pages (README, skill
references) summarize it; where they disagree, this page wins.

## Principles

1. **No real data, ever, in anything committed.** No production rows, real names, emails, phone
   numbers, or ids — not even "just one row". Fixtures are synthetic by construction.
2. **Deterministic by construction.** All generated data comes from a seeded PRNG — same spec +
   same seed = identical bytes, forever. No clock, no network, no `Math.random`. Record the seed
   next to the fixture it produced.
3. **Edge data is its own corpus.** Boundary/adversarial rows live in a separate fixture from the
   bulk rows — mixed together, a boundary failure looks like a random-row failure.
4. **Real data may be *used*, never *kept*.** A one-off run against your real file is fine: put
   it in `outputs/` (or anywhere gitignored) — the framework never commits `outputs/` or
   `evals/runs/`, so nothing real can leak into the repo.

## Where data lives

| Data | Where | Committed? |
| --- | --- | --- |
| Fixtures a skill's tests rely on | the skill's `assets/` | yes — synthetic only, seed recorded |
| A scenario's starting workspace | `evals/scenarios/<name>/fixtures/` | yes — synthetic only |
| Performance-test input | nowhere — a `make_rows(n)` formula inside the test | (no files at all) |
| Your real data for a one-off run | `outputs/` or any gitignored path | never |
| Whatever a run produces | `outputs/` in the sandbox or repo | never |

## The generator

The seeded generator ships with the `test-generator` skill:
`.github/skills/test-generator/scripts/datagen.mjs` (mulberry32 PRNG, zero dependencies).

```text
node .github/skills/test-generator/scripts/datagen.mjs \
  --spec <file> [--seed n] [--rows n] [--edge-cases] \
  [--format json|ndjson|csv] [--ref name=<file>] [--out <file>]
```

A spec names the fields; supported types: `uuid`, `int`, `float`, `bool`, `enum`, `string`,
`text`, `name`, `email`, `date`, `pattern`, `ref` — any field may be `nullable` with a
`nullRate`. Full spec format, per-type options, and the CLI flags are documented in the
generator's own reference:
`.github/skills/test-generator/references/data-generation.md`.

**Edge corpus** (`--rows 0 --edge-cases`): one row per boundary value per field, other fields
normal, so a failing row names the boundary that broke it. Covered: min/max and just-outside for
numerics; empty, whitespace, oversized, quotes, `<script>`, unicode, embedded separators for
strings; malformed emails; epoch/2038/leap-day dates; explicit nulls.

**Referential integrity** (`ref` fields + `--ref` pools): generate the parent fixture first, then
sample child foreign keys only from ids that exist. Orphan rows are generated deliberately as a
separate small fixture when the skill must handle them — never by accident.

## For Python tests

Performance and property-style tests need no files: build input with a deterministic formula,
outside the timed region —

```python
def make_rows(n: int) -> list[dict]:
    return [{"id": i, "value": (i * 37 % 900) / 3.0} for i in range(n)]
```

The harness's edge catalogue (`skillharness.edge`) additionally throws generated nulls, missing
keys, wrong types, unicode, oversized strings, and numeric boundaries at any function under test.
