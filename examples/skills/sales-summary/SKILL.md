---
name: sales-summary
description: >-
  Turns transaction rows into a per-category summary table and a short markdown brief, using a
  deterministic Python aggregation rather than arithmetic done in the prompt. Use when someone
  wants sales, spend, or order rows summarised by category, or as the worked example of an
  analysis skill with artifacts, Python code, and the three kinds of test.
allowed-tools:
  - Read
  - Write
  - Bash
---

# Sales summary

The reference example of an **analysis** skill: the judgement lives in this document, the
arithmetic lives in `python/summarize.py`, and every artifact it produces is covered by accuracy,
edge-case, and performance tests.

## When to use

Use when:

- transaction-shaped rows (category, units, revenue) need summarising by category;
- you want a worked example of the artifact + Python + three-kinds-of-test structure to copy.

Do **not** use for: price-volume-mix bridges or trend analysis (different question, different
skill), or for data that has not been cleaned — this skill rejects bad rows rather than guessing.

## Inputs

| Input | Required | Notes |
|---|---|---|
| Transaction rows | yes | Each row needs `category`, `units`, `revenue`. Anything else is ignored. |
| Output directory | yes | Where the artifacts are written. |
| `top_n` | no | Keep only the largest N categories in the artifacts. |
| `parts` | no | Which artifacts to write. Defaults to all of them. |

## Workflow

### 1. Check the input has the required columns

`category`, `units`, `revenue`. If a column is missing, say which one and stop — do not infer it
from a similarly named column without asking.

### 2. Run the deterministic aggregation

```bash
python3 -c "
import sys; sys.path.insert(0, 'python')
from summarize import write_artifacts
import json
rows = json.load(open('rows.json'))
print(write_artifacts(rows, 'outputs', title='Q3 sales'))
"
```

Never compute the totals in the reply instead of running this. The whole reason the Python module
exists is that a number produced by a language model is not reproducible and cannot be tested.

### 3. Report what was produced

Name each artifact and its path, then quote the headline numbers **from the artifact** — total
revenue, category count, leading category and its share.

### 4. Offer, do not ask up front

Produce every artifact by default. Afterwards, mention that either part can be left out
(`parts=("category-summary",)`) if they only wanted one. Do not open with that question.

## Outputs

| Artifact | Path | What it is |
|---|---|---|
| `category-summary` | `outputs/category-summary.csv` | One row per category: units, revenue, share |
| `summary-brief` | `outputs/summary-brief.md` | Totals, the leading category, and the table |

## References

- `python/summarize.py` — the deterministic aggregation, with the error contract in its docstrings.
- `python/tests/` — accuracy, edge-case, and performance tests, one file per kind.
