# The pair contract: doer, schema, observer

## Why every use case is two skills

Splitting a use case into a **doer** and an **observer** is what makes it testable:

- The doer is as low-level and procedural as the task allows. Deterministic code turns input data
  into ONE structured artifact — so "is it exactly right?" has a machine-checkable answer, three
  ways (accuracy, edge cases, performance).
- The observer reads that artifact and applies judgment. Judgment cannot be exactly verified,
  but its *discipline* can: facts first, each traceable to the artifact; interpretations second,
  clearly separated. The structural evals pin that discipline.

One skill that "processes the data and tells you what it means" can do neither.

## The schema is committed, not invented

The doer ships `references/schema.md`: the exact shape of its artifact.

```json
{
  "records": [ { } ],
  "deviations": [ "plain-language note of anything the input forced" ]
}
```

- The artifact ALWAYS conforms to this shape. Same schema on every run, whatever the input.
- When the input forces a departure from the ideal — a missing field, an unparseable value, an
  unexpected variant — the artifact still conforms structurally and the departure is written into
  `deviations`. The doer reports; it never restructures.
- `deviations` is always present, possibly empty. The format validator refuses a doer whose schema
  does not define it.

Changing the schema is an interface change: update `schema.md`, the code, the tests, and the
observer's Facts rules in the same edit.

## The handoff

The observer reads the doer's artifact — including its `deviations` field, which it carries
into Facts first, so the reader knows what the data could not say. It never recomputes the
doer's values. A number the observer produced is a number nobody can reproduce.

The observer's own output shape is committed in its `references/schema.md`: the reading is a
Markdown document with exactly two sections, in this order — `## Facts` (each fact citing the
artifact field or record it came from), then `## Interpretations` (judgment applying the lens).
Its `SKILL.md` never refers to the doer's schema file; the format validator refuses an observer
that does.

The observer's judgment is initialized, not invented: `references/voice.md` holds how the
reading sounds, `references/example-observations.md` holds accepted past readings, and
`scripts/thresholds.py` holds what counts as material (default materiality, author-overridable),
explained in `references/thresholds.md`. When a judgment turns on a number, the cutoff comes
from that script — never from prose.

## Coverage each half owes

| Requirement | doer | observer |
| --- | --- | --- |
| `evals/tests/` | ≥ 1, seeded by the generator — including an `artifact` test with a real input and a computed expected output | ≥ 1, structural: two-part output, own schema, lens, never-recompute |
| accuracy / edge / performance | required for the artifact and every module in `scripts/` | — (observer `scripts/` holds configuration, not computation) |
| `references/schema.md` | required, must define `deviations` | required — defines the reading's shape (Facts, then Interpretations) |
| `references/variations/` | optional — add when real variations exist | defaults to empty — add regional, edge-case, or sector variations as discovered |
| voice, examples, thresholds | — | `references/voice.md`, `references/example-observations.md`, `scripts/thresholds.py` (+ `references/thresholds.md`) — initialized at init, made real during refinement |

The pair itself is checked by `npm run health`: a doer without its observer (or the reverse) is
a **warning, never a blocker** — half a pair may land on a branch, but the report keeps naming it
until the other half exists (`npm run skill:new -- --only <role>` scaffolds it).

## Naming

`skills/<use-case>-doer/` and `skills/<use-case>-observer/`. The suffix is how the
tooling detects roles — there is no manifest. A product skill with neither suffix fails the format
check.

## The optional investigator

When the source material holds cross-analysis content — comparing across artifacts or runs, what
no single reading can see — init stubs a third skill, `skills/<use-case>-investigator/`: a folder
with a `SKILL.md` marked to be developed further, plus one seed test so the checks pass on it. It is
not part of the pair contract: no pair warning fires for it, and it owes no coverage until its
contract is defined.
