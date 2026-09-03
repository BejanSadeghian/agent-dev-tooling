# The pair contract: doer, schema, interpreter

## Why every use case is two skills

Splitting a use case into a **doer** and an **interpreter** is what makes it testable:

- The doer is as low-level and procedural as the task allows. Deterministic code turns input data
  into ONE structured artifact — so "is it exactly right?" has a machine-checkable answer, three
  ways (accuracy, edge cases, performance).
- The interpreter reads that artifact and applies judgment. Judgment cannot be exactly verified,
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
interpreter's Facts rules in the same edit.

## The handoff

The interpreter's input contract IS the doer's `references/schema.md`:

- Its `SKILL.md` names the doer, the schema file, and the `deviations` field (the format validator
  checks this).
- Step one of its workflow is reading `deviations` and carrying every entry into the Facts section
  — the reader must know what the data could not say.
- It never recomputes the doer's values. A number the interpreter produced is a number nobody can
  reproduce.

## Coverage each half owes

| Requirement | doer | interpreter |
| --- | --- | --- |
| `evals/cases/` | ≥ 1, seeded by the generator | ≥ 1, structural: two-part output, schema reference |
| accuracy / edge / performance | required for the artifact and every module in `scripts/` | — |
| `references/schema.md` | required, must define `deviations` | consumed, referenced from SKILL.md |
| `references/variations/` | required | required |

The pair itself is checked by `npm run health`: a doer without its interpreter (or the reverse) is
a **warning, never a blocker** — half a pair may land on a branch, but the report keeps naming it
until the other half exists (`npm run skill:new -- --only <role>` scaffolds it).

## Naming

`skills/<use-case>-doer/` and `skills/<use-case>-interpreter/`. The suffix is how the
tooling detects roles — there is no manifest. A product skill with neither suffix fails the format
check.
