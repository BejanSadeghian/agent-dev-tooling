# Measuring time and memory

Every performance test answers one question: **what does this cost as the data gets bigger?** Not
"is it fast on my laptop" — that number means nothing on anyone else's machine.

## What is measured

`skillharness.perf.measure()` runs the function at several input sizes and records, per size:

| Column | Meaning |
|---|---|
| `seconds` | Best of N repeats. Best, not mean — machine noise is one-sided. |
| `peak KiB` | `tracemalloc` peak *inside* the call, so it measures the code, not the interpreter. |
| `items/s` | Throughput, the number people actually feel. |

and across sizes, the **growth rate**: the slope of log(time) against log(n), plus its R². Slope
≈1 is linear, ≈2 is quadratic. The slope is the number that predicts what happens at 100× the data,
and the only one worth budgeting.

## Choosing sizes

- **At least three.** Two points fit any line; three show whether it is a line.
- **Span an order of magnitude.** `(2_000, 8_000, 32_000)` is a good default.
- **End at the real maximum.** Ask "how big does it get on a bad day?" and make that the last size.
- **Keep the whole test under a few seconds.** If the real maximum is too slow to measure, measure
  the shape at smaller sizes and assert the *scaling*, then add one `assert_time` at the real size.

## Reading the report

```
summarize_sales: linear (exponent 1.02, R^2 0.999) over n=2,000..32,000
| rows | seconds | items/s | peak KiB |
|---:|---:|---:|---:|
| 2,000 | 0.0010 | 1,979,030 | 1 |
| 8,000 | 0.0042 | 1,893,411 | 1 |
| 32,000 | 0.0170 | 1,879,911 | 1 |
```

- **Flat peak memory** across sizes means it streams. Memory rising with n means the whole input is
  being held — fine for small data, fatal for a big export.
- **R² below ~0.95** means the fit is noisy: sizes too small, or something else running on the
  machine. Raise the sizes rather than trusting the exponent.
- **Throughput falling as n rises** is the early signal of super-linear behaviour, before the
  exponent crosses a budget.

## Setting budgets

```python
result.assert_scaling(1.35)          # time may not grow worse than ~n^1.35
result.assert_memory_scaling(0.6)    # memory must stay ~flat: it aggregates, it does not collect
result.assert_time(32_000, 0.5)      # and it must be under 0.5s at the real size
result.assert_peak_kib(32_000, 50_000)
```

Budget the exponent tightly and the seconds loosely: the exponent is a property of the algorithm and
holds on any machine; seconds vary 5× between a laptop and a CI runner. `assert_time` is for the
one place where a hard human-facing limit exists.

## What the recorded report catches

`npm run regression` writes `.framework/state/perf/<skill>.json` and compares the next run against it:

- **exponent grew by more than the tolerance** → the suite fails. A `O(n)` function that became
  `O(n²)` is caught even though both are fast on a small fixture.
- **wall-clock more than the tolerance ratio slower at the same size** → a warning, since it may
  just be a busier machine.

This is how "it got slow after the refactor" becomes a test failure instead of a complaint three
weeks later.

## Anti-patterns

- **One size.** Says nothing about growth; passes forever while the code rots.
- **Timing the fixture build.** Build the input in `make_input(n)`, outside the timed region.
- **Asserting seconds only.** Green on a fast machine, red on CI, and blind to the algorithm.
- **Sleeping, or hitting a network or a database.** Not a measurement of your code.
- **Budgets set from the first measurement.** Set them from what the use case can tolerate, then
  tighten once the real shape is known.
