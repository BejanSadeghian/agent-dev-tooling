# What becomes Python

The rule: **if the author would notice a wrong answer, it is code.** Prose instructions produce a
different result each run and cannot be asserted on. Python can be run twice and compared.

## Always Python

- Arithmetic of any kind: totals, shares, margins, growth, weighted averages, currency.
- Parsing and coercion: dates, numbers, currencies, IDs, delimiters, encodings.
- Rules with thresholds: "flag anything below 12%", "exclude returns", "cap at 100".
- Ranking, sorting, deduplication, joins, grouping.
- Anything reconciling to a control total.
- Anything the author would re-check by hand.

## Stays in the skill document

- Judgement: which analysis answers the question, what to do when the data looks wrong.
- Framing: how to explain a result, what to lead with, when to ask before proceeding.
- Selecting inputs, naming outputs, deciding scope.

## How the generated module must behave

1. **Deterministic.** Same input, byte-identical output. No clock, no unseeded randomness, no
   network, no set/dict iteration order leaking into output. End every result with a total order:
   `results.sort(key=...)` on a tiebreaker that cannot repeat.
2. **An explicit error contract.** `ValueError` when a value is missing or unparseable, `TypeError`
   when a type is wrong; the message names the row and the column. Never return a partial result
   silently — a caller three steps downstream cannot tell.
3. **Streaming where it can be.** Aggregate in one pass, keeping state proportional to the number of
   groups, not rows. The performance test asserts this with `assert_memory_scaling`.
4. **Pure functions at the core, IO at the edge.** `summarize(rows) -> rows` and a thin
   `write_artifacts(rows, out_dir, parts=(...))`. Everything interesting is then testable without
   touching a disk.
5. **No hidden configuration.** Thresholds are arguments with documented defaults, not constants
   buried mid-file.
6. **Stdlib by default.** The harness needs nothing installed; keep it that way unless the author
   already depends on a library.

## The three tests the module always gets

| Kind | Asserts | Written with |
|---|---|---|
| accuracy | the numbers are right and reconcile | `assert_rows_equal`, `assert_sums_to`, `assert_close` |
| edge | empty, single, null, wrong type, unicode, huge, boundaries | `assert_survives_edge_cases`, explicit `assertRaises` |
| performance | time and memory against input size, within budget | `self.measure(...)`, `assert_scaling`, `assert_memory_scaling` |

All three come from `skillharness` (see `harness/skillharness/`), run under plain
`python3 -m unittest` with nothing installed, and are collected by pytest when the author has it.

## Budgets

The performance test declares what the code is allowed to cost:

```python
result = self.measure(summarize_sales, make_rows, target="summarize_sales")
result.assert_scaling(1.35)          # time must stay ~linear
result.assert_memory_scaling(0.6)    # memory must not grow with row count
result.assert_time(32_000, 0.5)      # and be under half a second at 32k rows
```

Set the sizes from the real data: the largest size should be the biggest input the author actually
has. `npm run regression` records the measurements, and a later run that scales worse fails the
suite — that is how "it got slow" becomes a test failure instead of a complaint.
