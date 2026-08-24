# Test plan — SUBJECT

Change under test: LINK/PATH · Layer(s): unit / api / e2e · Author: AGENT · Date: YYYY-MM-DD

## Contract

| # | Documented behaviour | Layer | Test name |
|---|---|---|---|
| C1 |  |  |  |

## Boundaries

| # | Boundary | Value | Test name |
|---|---|---|---|
| B1 | empty collection | `[]` |  |
| B2 | max length |  |  |

## Adversarial

| # | Input | Why it might break | Test name |
|---|---|---|---|
| A1 | embedded quote + comma + newline | serialization |  |

## Regression

| # | Report | Symptom to assert | Proven to fail before the fix? |
|---|---|---|---|
| R1 |  |  | yes/no |

## Data

- Spec: `PATH/spec.json` · seed `N` · rows `N`
- Edge corpus: `PATH/edge.csv` (`--rows 0 --edge-cases`)
- Regenerate: `node scripts/datagen.mjs --spec PATH/spec.json --seed N --rows N --out PATH`

## Out of scope

- WHAT AND WHY (load/perf, third-party behaviour, exploratory).
