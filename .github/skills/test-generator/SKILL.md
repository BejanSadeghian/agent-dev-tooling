---
name: test-generator
description: >-
  Generates the tests and the test data for a skill or a change: accuracy, edge-case and
  performance tests for every artifact and every deterministic Python entrypoint, deterministic
  fixtures from a seeded generator, and a report of compute time and memory against input size.
  Use when someone needs tests for new or untested code or skills, needs synthetic or edge-case
  test data or fixtures, wants performance measured, or wants a bug locked down so it cannot return.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
---

# Test generator

Three jobs, one discipline: decide what is worth asserting, make the inputs reproducible, and
measure what the code costs. A test whose data changes between runs is not a test — it is a rumour.

Every artifact and every Python entrypoint gets **all three kinds**:

| Kind | Question | Fails when |
|---|---|---|
| `accuracy` | Is the answer right, and does it reconcile? | a number drifts, an order changes, a total stops adding up |
| `edge` | What happens on empty, null, wrong type, unicode, huge, boundary? | it crashes with an undeclared error, or silently returns nonsense |
| `performance` | How do time and memory grow with input size? | scaling gets worse than the declared budget |

## When to use

Use when:

- a skill's artifacts or Python entrypoints are missing any of the three kinds of test;
- new or changed code needs tests (unit, API, E2E, or a skill regression case);
- a fixture, seed dataset, or edge-case corpus is needed — any size, any format;
- a bug was reported and must be locked down as a permanent regression test;
- an existing suite is flaky, and the fix is deterministic data.

Do **not** use for: authoring or refining the skill document itself (that is `skill-builder`),
running an existing suite unchanged (just run `npm run check`), or load/soak testing.

## Inputs

| Input | Required | Notes |
|---|---|---|
| The skill's role and layout | yes | A doer's artifact and every module in its `scripts/` must be covered; an interpreter owes structural evals. |
| The code under test | yes | Read the doer's `scripts/` before deciding what to assert. |
| The bug report or requirement | when applicable | The failing behaviour is the first assertion. |
| Real input sizes | for performance | The largest test size should be the biggest input the author actually has. |

## Workflow

### 1. Find the gaps

```bash
npm run test:new                 # every skill: what is missing
npm run test:new -- <skill>      # write the missing test files for one skill
```

It detects each skill's role from its name, maps the doer's artifact and every `scripts/` module
against the tests that declare they cover it, and writes the file that closes each gap. What it writes are working scaffolds with real
assertions — you replace the placeholder expectations, which is the part only a human can supply.

### 2. Pick the layer for anything outside Python

Choose the cheapest layer that can catch the failure (`references/test-strategies.md`): pure logic
to unit tests, contract and status codes to API tests, a user-visible flow to E2E, a rule inside a
skill document to a JSON regression case.

### 3. Write the accuracy tests

Use the smallest input whose correct answer the author can state **without running the code** — that
is the only kind of expectation worth committing. Then:

- assert the reconciliation, not just the rows: shares sum to 1, revenue matches the input total;
- assert order explicitly, including the tiebreak;
- assert that reversing the input order changes nothing;
- compare floats with `assert_close`, never `==`;
- for artifacts, assert the file's shape (`assert_csv_columns`, `assert_json_keys`,
  `assert_markdown_sections`) and that two runs produce identical bytes (`assert_deterministic`).

### 4. Write the edge-case tests

Start from the catalogue — `skillharness.edge` throws empty, single, duplicate, null, missing key,
wrong type, unicode, emoji, 1KB strings, injection strings and numeric boundaries at the function:

```python
self.assert_survives_edge_cases(summarize_sales, ROWS, ["units", "revenue"])
```

Every input must either return a value or raise a **declared** error (`ValueError` for bad values,
`TypeError` for wrong types). An undeclared `AttributeError` or `IndexError` is the bug this finds.
Then add the author's own "must never happen" cases by hand.

### 5. Write the performance tests, and report the numbers

```python
result = self.measure(summarize_sales, make_rows, target="summarize_sales")
result.assert_scaling(1.35)           # time must stay ~linear
result.assert_memory_scaling(0.6)     # memory must not grow with row count
result.assert_time(32_000, 0.5)       # under half a second at the real size
print("\n" + result.summary() + "\n" + result.table())
```

Rules:

- **Sizes come from reality.** At least three, spanning at least one order of magnitude, ending at
  the biggest input the author actually has. Fewer than three sizes cannot show scaling.
- **Build the input outside the timed region.** `make_input(n)` is called before the clock starts.
- **Measure time and memory together.** `tracemalloc` peak is what catches "it materialises the
  whole file"; wall-clock alone does not.
- **Budget the exponent, not the seconds.** Seconds vary by machine; `n^1.0 → n^2.0` is a real
  regression anywhere. `npm run regression` records both and fails the suite when scaling worsens.

The recorded report is `.skill-state/perf/<skill>.json`, and `npm run python -- <skill>` prints it:
compute time, throughput and peak memory at each input size, plus the fitted growth rate.

### 6. Generate the data deterministically

Never hand-roll fixture data and never call a random source without a seed.

```bash
node .github/skills/test-generator/scripts/datagen.mjs --spec spec.json --seed 42 --rows 200 --format ndjson --out fixtures/users.ndjson
node .github/skills/test-generator/scripts/datagen.mjs --spec spec.json --seed 42 --rows 0 --edge-cases --format csv
```

For Python, a `make_rows(n)` helper built from a formula is enough and needs no files. Either way:
record the seed next to the fixture path, keep the edge corpus separate from the bulk rows, and
never copy real data — see `references/data-generation.md`.

### 7. Prove it fails for the right reason

For every regression test and every bug fix: **run it against the unfixed code first and watch it
fail with the expected message.** A test that has never failed proves nothing. If you cannot
reproduce the failure, say so and stop — the test you were about to write is decorative.

### 8. Run it, twice

```bash
npm run check
```

Identical results both times, or the data is not deterministic yet. Fix that before shipping.

## Outputs

- Accuracy, edge-case and performance tests for every artifact and entrypoint, with no gaps left.
- Deterministic fixtures (or generators) plus the seed, recorded in the test.
- A performance report: compute time and peak memory against input size, with the growth rate.
- For a bug: a named regression test proven to fail on the unfixed code.

## References

- `references/performance-testing.md` — measuring time and memory, choosing sizes, reading the report, setting budgets.
- `references/data-generation.md` — the generator's spec format, field types, edge corpus, referential integrity, no-real-data rule.
- `references/test-strategies.md` — picking the layer, the case checklist, and what not to test.
- `references/bug-to-regression.md` — turning a report into a permanent test.
- `templates/` — field spec, test plan, and a runnable test scaffold.
