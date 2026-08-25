// File templates the generators emit. Everything generated here must pass the
// format spec, the rubric, and its own tests immediately — a scaffold that does
// not run is a scaffold nobody finishes.
//
// A use case is generated as a PAIR:
//   <use-case>-doer         deterministic scripts/ code -> one structured artifact,
//                           shape fixed by references/schema.md, deviations reported
//   <use-case>-interpreter  reads that artifact, separates Facts from Interpretations

const pyName = (s) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();

export const moduleNameFor = (useCase) => pyName(useCase);
export const functionNameFor = (useCase) => `build_${pyName(useCase)}`;

const title = (name) => name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function doerSkillMd({ useCase, whatItDoes, trigger, nonTrigger, steps }) {
  const name = `${useCase}-doer`;
  const module = moduleNameFor(useCase);
  const fn = functionNameFor(useCase);
  const workflow = steps
    .map((step, i) => `### ${i + 1}. ${step}\n\nWhat to read, what to run, what to produce. Name the file or command this step acts on.`)
    .join('\n\n');

  return `---
name: ${name}
description: >-
  ${whatItDoes} ${trigger}
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---

# ${title(name)}

${whatItDoes}

This is the **doer** half of the \`${useCase}\` pair: low-level, procedural, deterministic.
It turns input data into ONE structured artifact whose shape is fixed by
\`references/schema.md\`. It never invents a new shape — when the input forces a
deviation, the artifact still conforms and the deviation is reported in the
schema's \`deviations\` field so the human and \`${useCase}-interpreter\` both see it.

## When to use

Use when:

- ${trigger.replace(/^Use when\s*/i, '')}

Do **not** use for: ${nonTrigger}. Interpreting the artifact — identifying facts and
applying judgment — is \`${useCase}-interpreter\`'s job, never this skill's.

## Inputs

| Input | Required | Notes |
|---|---|---|
| INPUT | yes | WHERE IT COMES FROM |

## Workflow

${workflow}

### ${steps.length + 1}. Run the deterministic code, do not do the arithmetic yourself

\`\`\`bash
python3 -c "
import sys; sys.path.insert(0, 'scripts')
from ${module} import ${fn}
print(${fn}(...))
"
\`\`\`

Every value in the artifact comes from this module. A value computed in the reply
cannot be reproduced and cannot be tested.

### ${steps.length + 2}. Write the artifact and report deviations

Write the artifact exactly as \`references/schema.md\` declares it. List every
deviation from the ideal input in the \`deviations\` field — never restructure the
output to fit unusual input.

## Outputs

| Artifact | Path | What it is |
|---|---|---|
| \`${useCase}\` | \`outputs/${useCase}.json\` | The structured artifact, conforming to \`references/schema.md\`. |

## References

- \`references/schema.md\` — the committed shape of the artifact. The doer always conforms to it.
- \`references/variations/\` — domain, use-case, and regional adaptations of this skill.
- \`scripts/${module}.py\` — the deterministic logic, with its error contract in the docstrings.
- \`scripts/tests/\` — accuracy, edge-case, and performance tests, one file per kind.
`;
}

export function interpreterSkillMd({ useCase, whatItInterprets, trigger, nonTrigger, lens }) {
  const name = `${useCase}-interpreter`;
  return `---
name: ${name}
description: >-
  ${whatItInterprets} ${trigger}
allowed-tools:
  - Read
  - Write
---

# ${title(name)}

${whatItInterprets}

This is the **interpreter** half of the \`${useCase}\` pair. It reads the artifact
\`${useCase}-doer\` produced (shape: the doer's \`references/schema.md\`), identifies
facts from it, and applies interpretations of those facts using this skill's own
lens. It never recomputes the doer's numbers and never mixes opinion into facts.

## When to use

Use when:

- ${trigger.replace(/^Use when\s*/i, '')}

Do **not** use for: ${nonTrigger}. Producing or transforming the data itself is
\`${useCase}-doer\`'s job, never this skill's.

## Inputs

| Input | Required | Notes |
|---|---|---|
| \`outputs/${useCase}.json\` | yes | The doer's artifact, conforming to its \`references/schema.md\`. Read its \`deviations\` field first. |

## Workflow

### 1. Read the artifact and its deviations

Open the doer's artifact. Confirm it matches the schema; read the \`deviations\`
field and carry every deviation into the Facts section — the reader must know
what the data could not say.

### 2. Identify the facts

State only what the artifact shows. Every fact cites the field or record it came
from. No judgment yet.

### 3. Apply the lens

${lens}

Check \`references/variations/\` for the domain, use-case, or regional variation
that matches this request and apply its adjustments.

### 4. Produce the two-part output

The output document has exactly two sections, in this order:

\`\`\`markdown
## Facts

- <statement traceable to the artifact> (from: <field or record>)

## Interpretations

- <judgment applying this skill's lens to the facts above>
\`\`\`

A reader must always be able to tell what is data and what is opinion.

## Outputs

| Artifact | Path | What it is |
|---|---|---|
| \`${useCase}-reading\` | \`outputs/${useCase}-reading.md\` | Facts then Interpretations, per the structure above. |

## References

- \`../${useCase}-doer/references/schema.md\` — the shape of the artifact this skill consumes.
- \`references/variations/\` — domain, use-case, and regional adaptations of the lens.
`;
}

export function schemaMd({ useCase, fields }) {
  const rows = (fields.length ? fields : [{ name: 'FIELD', type: 'string', notes: 'WHAT IT MEANS' }])
    .map((f) => `| \`${f.name}\` | ${f.type} | ${f.notes} |`)
    .join('\n');
  return `# Artifact schema — \`${useCase}\`

The committed shape of \`outputs/${useCase}.json\`. The doer ALWAYS conforms to this
schema. It never invents a new shape at run time: when the input forces a
deviation, the artifact still conforms structurally and the deviation is listed
in \`deviations\`.

## Shape

\`\`\`json
{
  "records": [ { } ],
  "deviations": [ "plain-language note of anything the input forced" ]
}
\`\`\`

## \`records[]\` fields

| Field | Type | Meaning |
|---|---|---|
${rows}

## \`deviations\`

Always present, possibly empty. One entry per departure from the ideal input:
a missing field, an unparseable value that was skipped, an unexpected variant.
Downstream (\`${useCase}-interpreter\`) must read this before interpreting anything.
`;
}

export function variationMd({ name, useCase }) {
  return `# Variation: default

The baseline behaviour of \`${name}\`. Add one file per domain, use case, or
regional variation — each states what changes relative to this default and when
it applies.

| Aspect | Default |
|---|---|
| Applies when | no more specific variation in this folder matches |
| Adjustments | none — follow SKILL.md as written |

Provenance: generated with the \`${useCase}\` pair; replace with real variations as
they are discovered.
`;
}

export function pythonModule({ useCase }) {
  const module = moduleNameFor(useCase);
  const fn = functionNameFor(useCase);
  return `"""Deterministic code for the ${useCase}-doer skill.

Everything that must be reproducible lives here rather than in the prompt: the
same input produces byte-identical output on every run, which is what makes it
testable for accuracy, edge cases, and performance. The output ALWAYS matches
references/schema.md — deviations are reported, never structural.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Mapping

__all__ = ["${fn}", "write_artifact"]


def ${fn}(rows: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Build the ${useCase} artifact — deterministic: same input, same output.

    Args:
        rows: input records. Each must carry the columns SKILL.md documents.

    Returns:
        {"records": [...], "deviations": [...]} conforming to references/schema.md.
        Records are in a total order (never dict or input order); deviations is
        always present, possibly empty.

    Raises:
        ValueError: a value is missing or unparseable — the message names the row.
        TypeError: a value is of the wrong type for its column.
    """
    records: list[dict[str, Any]] = []
    deviations: list[str] = []
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise TypeError(f"row {index}: expected a mapping, got {type(row).__name__}")
        records.append(dict(row))
    records.sort(key=lambda r: tuple(sorted(map(str, r.items()))))
    return {"records": records, "deviations": deviations}


def write_artifact(rows: Iterable[Mapping[str, Any]], out_dir: str | Path) -> Path:
    """Write outputs/${useCase}.json exactly as the schema declares it."""
    directory = Path(out_dir)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / "${useCase}.json"
    target.write_text(
        json.dumps(${fn}(rows), indent=2, sort_keys=True, default=str) + "\\n",
        encoding="utf-8",
    )
    return target
`;
}

export function pythonTest({ kind, useCase }) {
  const module = moduleNameFor(useCase);
  const fn = functionNameFor(useCase);
  const skillName = `${useCase}-doer`;
  const header = `"""${kind[0].toUpperCase()}${kind.slice(1)} tests for ${skillName}."""

KIND = "${kind}"
COVERS = ["${useCase}", "${module}.${fn}"]

`;

  if (kind === 'accuracy') {
    return `${header}import json
import tempfile
from pathlib import Path

from skillharness import SkillTestCase

from ${module} import ${fn}, write_artifact

ROWS = [
    {"id": 1, "value": 10.0},
    {"id": 2, "value": 32.5},
]


class TestAccuracy(SkillTestCase):
    skill = "${skillName}"

    def test_known_input_produces_the_expected_output(self):
        # Replace with the real expectation: the smallest input whose correct
        # answer you can state without running the code.
        result = ${fn}(ROWS)
        self.assertEqual(len(result["records"]), len(ROWS))

    def test_artifact_conforms_to_the_schema(self):
        result = ${fn}(ROWS)
        self.assertEqual(set(result), {"records", "deviations"})
        self.assertIsInstance(result["deviations"], list)

    def test_result_order_is_stable(self):
        self.assert_rows_equal(${fn}(ROWS)["records"], ${fn}(list(reversed(ROWS)))["records"])

    def test_artifact_is_identical_across_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            def produce():
                target = write_artifact(ROWS, Path(tmp) / "run")
                return {"artifact": target.read_text(encoding="utf-8")}

            first = self.assert_deterministic(produce, label="${useCase} artifact")
            parsed = json.loads(first["artifact"])
            self.assertEqual(set(parsed), {"records", "deviations"})
`;
  }

  if (kind === 'edge') {
    return `${header}from skillharness import SkillTestCase

from ${module} import ${fn}

ROWS = [
    {"id": 1, "value": 10.0},
    {"id": 2, "value": 32.5},
]


class TestEdgeCases(SkillTestCase):
    skill = "${skillName}"

    def test_empty_input_still_conforms(self):
        result = ${fn}([])
        self.assertEqual(result["records"], [])
        self.assertEqual(result["deviations"], [])

    def test_single_row_is_handled(self):
        self.assertEqual(len(${fn}(ROWS[:1])["records"]), 1)

    def test_bad_rows_raise_a_declared_error(self):
        with self.assertRaises((TypeError, ValueError)):
            ${fn}(["not a row"])

    def test_every_generated_edge_case_is_handled_or_declared(self):
        # skillharness.edge throws nulls, missing keys, wrong types, unicode,
        # oversized strings and numeric boundaries at the function. Each one must
        # return a value or raise ValueError/TypeError — never anything else.
        self.assert_survives_edge_cases(${fn}, ROWS, ["value"])
`;
  }

  return `${header}from skillharness import SkillTestCase

from ${module} import ${fn}


def make_rows(n: int) -> list[dict]:
    """Deterministic input of n rows, built outside the timed region."""
    return [{"id": i, "value": (i * 37 % 900) / 3.0} for i in range(n)]


class TestPerformance(SkillTestCase):
    skill = "${skillName}"
    sizes = (2_000, 8_000, 32_000)

    def test_${fn}_scales_within_budget(self):
        result = self.measure(${fn}, make_rows, target="${fn}")
        result.assert_scaling(1.35)
        print("\\n" + result.summary() + "\\n" + result.table())

    def test_${fn}_memory_stays_within_budget(self):
        result = self.measure(${fn}, make_rows, target="${fn}_memory")
        result.assert_memory_scaling(1.2)
`;
}

export function doerSeedCases({ useCase, nonTrigger }) {
  return [
    {
      file: 'trigger-boundary-stated.json',
      body: {
        id: 'trigger-boundary-stated',
        description: 'The skill still states when it must not fire.',
        type: 'contains',
        kind: 'edge',
        covers: [useCase],
        file: 'SKILL.md',
        patterns: ['Do \\*\\*not\\*\\* use for'],
        provenance: `interview: non-trigger is "${nonTrigger}"`,
      },
    },
    {
      file: 'schema-reports-deviations.json',
      body: {
        id: 'schema-reports-deviations',
        description: 'The committed schema still defines the deviations field the doer reports into.',
        type: 'contains',
        kind: 'accuracy',
        covers: [useCase],
        file: 'references/schema.md',
        patterns: ['deviations'],
        provenance: 'hard rule: the doer never invents a new shape — it conforms and reports',
      },
    },
  ].map((c) => ({ file: c.file, text: JSON.stringify(c.body, null, 2) + '\n' }));
}

export function interpreterSeedCases({ useCase }) {
  return [
    {
      file: 'output-separates-facts-from-interpretation.json',
      body: {
        id: 'output-separates-facts-from-interpretation',
        description: 'The skill still instructs the two-part output: Facts, then Interpretations.',
        type: 'contains',
        file: 'SKILL.md',
        patterns: ['## Facts', '## Interpretations'],
        provenance: 'hard rule: a reader must always be able to tell data from opinion',
      },
    },
    {
      file: 'reads-the-doers-schema.json',
      body: {
        id: 'reads-the-doers-schema',
        description: "The skill still names the doer's schema as its input contract.",
        type: 'contains',
        file: 'SKILL.md',
        patterns: [`${useCase}-doer`, 'schema\\.md', 'deviations'],
        provenance: 'the pair contract: the interpreter consumes exactly what the schema declares',
      },
    },
  ].map((c) => ({ file: c.file, text: JSON.stringify(c.body, null, 2) + '\n' }));
}

export function interviewNotes({ name, answers }) {
  const rows = answers.map((a) => `### ${a.question}\n\n${a.answer || '_(not answered)_'}\n`).join('\n');
  return `# Interview notes — ${name}

Captured by \`npm run skill:new\`. These answers are the provenance for the rules in \`SKILL.md\`
and for the regression cases. When a rule changes, update the answer that justified it.

${rows}
`;
}
