# Artifacts, and splitting a chain into skills

## Why artifacts are declared

An artifact is a file the skill produces: a dataset, a report, a chart, a config. Declaring it in
`skill.json` is what makes it testable — the rubric then insists it has an accuracy test, an
edge-case test, and a performance test, and the health report notices when it loses one.

```json
{
  "artifacts": [
    {
      "id": "category-summary",
      "path": "outputs/category-summary.csv",
      "kind": "data",
      "description": "One row per category: units, revenue, share of revenue.",
      "producedBy": "summarize.write_artifacts",
      "testKinds": ["accuracy", "edge", "performance"]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Stable name, kebab-case. Tests declare which id they cover; sequences wire steps by id. |
| `path` | Where the skill writes it, relative to the working directory. |
| `kind` | `data`, `document`, `report`, `chart`, `code`, `config`. |
| `producedBy` | The Python function that writes it — so a reader can go straight to the code. |
| `testKinds` | Override the required kinds for this artifact. Rarely needed; the default is all three. |
| `generate` | `false` switches the part off. Requires `skipReason`. |

## Optional parts

Generate everything by default. If the author decides they only want some of it:

```bash
npm run skill:new -- --skip summary-brief
```

or in `skill.json`:

```json
{ "id": "summary-brief", "generate": false, "skipReason": "the team reads the CSV in the BI tool" }
```

A skipped artifact is exempt from coverage and is not produced, but it stays visible in the
manifest with the reason. Never ask which parts they want before generating — offer it after, when
they have something concrete to react to.

The same idea belongs in the Python: one `write_artifacts(rows, out_dir, parts=(...))` with a
`parts` argument, not two code paths. Leaving a part out must not change how the others are built.

## One skill per artifact

Split artifact generation across skills. A skill that produces one artifact can be tested for
accuracy, edge cases, and speed on its own; a skill that produces five hides which of the five
broke. Split when:

- two outputs have different inputs, different failure modes, or different owners;
- one output is expensive and the other is not;
- someone would plausibly want the first output without the second.

Keep them together only when neither is meaningful alone.

## Sequences

A sequence is the ordered chain: each step consumes what an earlier step produced.

```json
{
  "id": "example-analysis",
  "title": "Example analysis chain",
  "inputs": ["raw-transactions"],
  "steps": [
    { "skill": "clean-transactions", "consumes": ["raw-transactions"], "produces": ["clean-transactions"] },
    { "skill": "sales-summary", "consumes": ["clean-transactions"], "produces": ["category-summary", "summary-brief"] }
  ]
}
```

Live in `sequences/*.json`. `npm run health` checks that every named skill exists, that everything a
step consumes was produced upstream (or is listed in `inputs`), and that no two skills claim the
same artifact id.

Each step also records its own place in its `skill.json`:

```json
{ "sequence": { "id": "example-analysis", "position": 2, "consumes": ["clean-transactions"], "produces": ["category-summary"] } }
```

When the author hands you a framework of skills in markdown, translate it into exactly this: one
skill per step, one artifact per output, one sequence file for the chain. Then generate each step
with `npm run skill:new` in order, so each one's artifacts exist before the next step consumes them.
