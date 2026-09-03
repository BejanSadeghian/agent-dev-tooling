# Data generation

> Source of truth: `.framework/DATA.md`. This page is the generator's own reference detail.

`scripts/datagen.mjs` is the bundled generator. It is deterministic by construction: a seeded
mulberry32 PRNG, no clock, no network, no `Math.random`. Same spec + same seed = identical bytes.

## CLI

```
node scripts/datagen.mjs --spec <file> [--seed n] [--rows n] [--edge-cases]
                         [--format json|ndjson|csv] [--ref name=<file>] [--out <file>]
```

| Flag | Default | Notes |
|---|---|---|
| `--spec` | required | JSON field spec (below) |
| `--seed` | `1` | record it next to the fixture path in the test |
| `--rows` | `10` | random rows; `--rows 0 --edge-cases` gives a pure boundary corpus |
| `--edge-cases` | off | prepends one row per boundary/adversarial value, per field |
| `--format` | `json` | `csv` quotes and doubles embedded quotes correctly |
| `--ref` | none | `--ref users.id=fixtures/users.json` loads a pool for `ref` fields |
| `--out` | stdout | creates parent directories |

## Spec format

```json
{
  "name": "users",
  "fields": [
    { "name": "id", "type": "uuid" },
    { "name": "age", "type": "int", "min": 18, "max": 90 },
    { "name": "bio", "type": "text", "words": 6, "nullable": true, "nullRate": 0.2 }
  ]
}
```

| Type | Options | Emits |
|---|---|---|
| `uuid` | — | v4-shaped hex id |
| `int` | `min`, `max` | integer in range |
| `float` | `min`, `max`, `precision` | fixed-precision number |
| `bool` | — | `true`/`false` |
| `enum` | `values[]` | one of the values |
| `string` | `minLength`, `maxLength`, `alphabet` | random token |
| `text` | `words` | space-joined words |
| `name` | — | `first last` from a fixed word list |
| `email` | `domain` (default `example.test`) | `first.lastNN@domain` |
| `date` | `from`, `to`, `dateOnly` | day-aligned ISO date (or full timestamp) |
| `pattern` | `pattern` — `A` = letter, `#` = digit | e.g. `AA-####` |
| `ref` | `from` (pool name) | a value sampled from a `--ref` pool |

Any field may set `nullable: true` and `nullRate` (default `0.1`).

## The edge-case corpus

`--edge-cases` emits one row per boundary value per field, with the other fields left normal, so a
failing row names the boundary that broke it. Covered per type: min/max and just-outside for
numerics; empty, whitespace, 255 chars, apostrophe, `<script>` payload, unicode, and an embedded
`,"\n` triple for strings; malformed and max-length addresses for emails; epoch, 2038, and a leap
day for dates; explicit nulls for nullable fields.

Keep it as its own fixture (`--rows 0 --edge-cases`). Mixed into the bulk rows, a boundary failure
looks like a random-row failure.

## Referential integrity

Generate the parent first, then pass it as a pool:

```bash
node scripts/datagen.mjs --spec users.json  --seed 42 --rows 100 --out fixtures/users.json
node scripts/datagen.mjs --spec orders.json --seed 42 --rows 500 \
     --ref users.id=fixtures/users.json --out fixtures/orders.json
```

`{ "name": "user_id", "type": "ref", "from": "users.id" }` then samples only ids that exist. Orphan
rows are worth testing too — generate them deliberately as a separate small fixture, never by
accident.

## Rules

- **No real data.** Never copy production rows, real names, emails, phone numbers, or ids into a
  fixture. `example.test` is a reserved domain and nothing generated here can reach a real inbox.
- **Commit the spec always; commit the fixture when a human must read or diff it.** For large
  corpora, commit the spec + seed and regenerate at test time.
- **Record the seed in the test file**, next to the fixture path. A fixture nobody can regenerate is
  a liability.
- **Extending the generator?** Add the type to `GENERATORS`, its boundary values to `EDGE_VALUES`,
  and a case to this skill's `evals/cases/` in the same change.
