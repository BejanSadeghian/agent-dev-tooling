// File templates the generators emit. Everything generated here must pass the
// format spec, the rubric, and its own tests immediately — a scaffold that does
// not run is a scaffold nobody finishes.

const pyName = (s) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();

export const moduleNameFor = (skillName) => pyName(skillName);
export const functionNameFor = (artifactId) => `build_${pyName(artifactId)}`;

export function skillMd({ name, title, whatItDoes, trigger, nonTrigger, kind, steps, artifacts, python }) {
  const artifactRows = artifacts.length
    ? artifacts.map((a) => `| \`${a.id}\` | \`${a.path}\` | ${a.description || a.kind} |`).join('\n')
    : '| _none_ | — | This skill produces no file artifacts. |';

  const workflow = steps
    .map((step, i) => `### ${i + 1}. ${step}\n\nWhat to read, what to run, what to produce. Name the file or command this step acts on.`)
    .join('\n\n');

  const pythonStep = python
    ? `\n### ${steps.length + 1}. Run the deterministic code, do not do the arithmetic yourself\n\n` +
      '```bash\n' +
      `python3 -c "\nimport sys; sys.path.insert(0, 'python')\nfrom ${python.module} import ${python.entrypoints[0].split('.').at(-1)}\nprint(${python.entrypoints[0].split('.').at(-1)}(...))\n"\n` +
      '```\n\n' +
      'Every number in the answer comes from this module. A value computed in the reply cannot be\nreproduced and cannot be tested.\n'
    : '';

  const artifactStep = artifacts.length
    ? `\n### ${steps.length + (python ? 2 : 1)}. Produce every artifact, then offer to drop parts\n\n` +
      'Generate all of them by default. Afterwards, mention that any part can be left out if they only\nwanted some of it — do not open by asking which parts they want.\n'
    : '';

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

# ${title}

${whatItDoes}

## When to use

Use when:

- ${trigger.replace(/^Use when\s*/i, '')}

Do **not** use for: ${nonTrigger}

## Inputs

| Input | Required | Notes |
|---|---|---|
| INPUT | yes | WHERE IT COMES FROM |

## Workflow

${workflow}
${pythonStep}${artifactStep}
## Outputs

| Artifact | Path | What it is |
|---|---|---|
${artifactRows}

## References

- \`skill.json\` — the artifacts and code this skill declares, and what the tests must cover.
${python ? `- \`python/${python.module}.py\` — the deterministic ${kind === 'analysis' ? 'analysis' : 'logic'}, with its error contract in the docstrings.\n- \`python/tests/\` — accuracy, edge-case, and performance tests, one file per kind.\n` : ''}`;
}

export function manifest({ name, kind, summary, artifacts, python, sequence, skipped }) {
  return (
    JSON.stringify(
      {
        name,
        kind,
        summary,
        artifacts: artifacts.map((a) => ({
          id: a.id,
          path: a.path,
          kind: a.kind,
          description: a.description,
          ...(a.producedBy ? { producedBy: a.producedBy } : {}),
          ...(a.generate === false ? { generate: false, skipReason: a.skipReason } : {}),
          testKinds: a.testKinds ?? ['accuracy', 'edge', 'performance'],
        })),
        ...(python ? { python: { dir: 'python', entrypoints: python.entrypoints, maxExponent: python.maxExponent ?? 1.35 } } : {}),
        ...(sequence ? { sequence } : {}),
        generation: {
          generatedBy: 'skill-builder',
          generatedAt: new Date().toISOString().slice(0, 10),
          skipped: skipped ?? [],
        },
      },
      null,
      2,
    ) + '\n'
  );
}

export function pythonModule({ skillName, artifacts, entrypoints }) {
  const functions = entrypoints
    .map((entry) => {
      const fn = entry.split('.').at(-1);
      return `def ${fn}(rows: Iterable[Mapping[str, Any]], **options: Any) -> list[dict[str, Any]]:
    """${fn.replace(/_/g, ' ')} — deterministic: same input, same output.

    Args:
        rows: input records. Each must carry ${JSON.stringify(REQUIRED_HINT)}.

    Returns:
        A list of result rows in a total order (never dict or input order).

    Raises:
        ValueError: a value is missing or unparseable — the message names the row.
        TypeError: a value is of the wrong type for its column.
    """
    results: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise TypeError(f"row {index}: expected a mapping, got {type(row).__name__}")
        results.append(dict(row))
    results.sort(key=lambda r: tuple(sorted(map(str, r.items()))))
    return results`;
    })
    .join('\n\n\n');

  const writer = artifacts.length
    ? `

def write_artifacts(
    rows: Iterable[Mapping[str, Any]],
    out_dir: str | Path,
    *,
    parts: Sequence[str] = (${artifacts.map((a) => `"${a.id}"`).join(', ')}),
) -> dict[str, Path]:
    """Write this skill's artifacts. The "parts" argument selects which ones —
    every artifact is produced by default; a caller may leave one out without a
    second code path.
    """
    directory = Path(out_dir)
    directory.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
${artifacts
  .map(
    (a) => `    if "${a.id}" in parts:
        target = directory / "${a.path.split('/').at(-1)}"
        target.write_text(json.dumps(${entrypoints[0].split('.').at(-1)}(rows), indent=2, sort_keys=True, default=str) + "\\n", encoding="utf-8")
        written["${a.id}"] = target`,
  )
  .join('\n')}
    return written`
    : '';

  return `"""Deterministic code for the ${skillName} skill.

Everything that must be reproducible lives here rather than in the prompt: the
same input produces byte-identical output on every run, which is what makes it
testable for accuracy, edge cases, and performance.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

__all__ = [${[...entrypoints.map((e) => `"${e.split('.').at(-1)}"`), ...(artifacts.length ? ['"write_artifacts"'] : [])].join(', ')}]


${functions}${writer}
`;
}

const REQUIRED_HINT = 'the columns this skill documents';

export function pythonTest({ kind, module, skillName, covers, entrypoints, artifacts }) {
  const fn = entrypoints[0].split('.').at(-1);
  const imports = artifacts.length ? `from ${module} import ${fn}, write_artifacts` : `from ${module} import ${fn}`;
  const header = `"""${kind[0].toUpperCase()}${kind.slice(1)} tests for ${skillName}."""

KIND = "${kind}"
COVERS = [${covers.map((c) => `"${c}"`).join(', ')}]

`;

  if (kind === 'accuracy') {
    return `${header}import tempfile
from pathlib import Path

from skillharness import SkillTestCase

${imports}

ROWS = [
    {"id": 1, "value": 10.0},
    {"id": 2, "value": 32.5},
]


class TestAccuracy(SkillTestCase):
    skill = "${skillName}"

    def test_known_input_produces_the_expected_output(self):
        # Replace with the real expectation: the smallest input whose correct
        # answer you can state without running the code.
        self.assertEqual(len(${fn}(ROWS)), len(ROWS))

    def test_result_order_is_stable(self):
        self.assert_rows_equal(${fn}(ROWS), ${fn}(list(reversed(ROWS))))
${
  artifacts.length
    ? `
    def test_artifacts_are_written_and_identical_across_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            def produce():
                written = write_artifacts(ROWS, Path(tmp) / "run")
                return {k: Path(v).read_text(encoding="utf-8") for k, v in written.items()}

            first = self.assert_deterministic(produce, label="${skillName} artifacts")
            self.assertEqual(set(first), {${artifacts.map((a) => `"${a.id}"`).join(', ')}})

    def test_a_part_can_be_left_out(self):
        with tempfile.TemporaryDirectory() as tmp:
            written = write_artifacts(ROWS, tmp, parts=("${artifacts[0].id}",))
            self.assertEqual(set(written), {"${artifacts[0].id}"})
`
    : ''
}`;
  }

  if (kind === 'edge') {
    return `${header}from skillharness import SkillTestCase

${imports}

ROWS = [
    {"id": 1, "value": 10.0},
    {"id": 2, "value": 32.5},
]


class TestEdgeCases(SkillTestCase):
    skill = "${skillName}"

    def test_empty_input_is_handled(self):
        self.assertEqual(${fn}([]), [])

    def test_single_row_is_handled(self):
        self.assertEqual(len(${fn}(ROWS[:1])), 1)

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

${imports}


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
${
  artifacts.length
    ? `
    def test_write_artifacts_scales_within_budget(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            result = self.measure(
                lambda rows: write_artifacts(rows, tmp),
                make_rows,
                sizes=(1_000, 4_000, 16_000),
                target="write_artifacts",
            )
            result.assert_scaling(1.35)
`
    : ''
}`;
}

export function seedCases({ artifacts, trigger, nonTrigger }) {
  const cases = [
    {
      file: 'trigger-boundary-stated.json',
      body: {
        id: 'trigger-boundary-stated',
        description: 'The skill still states when it must not fire.',
        type: 'contains',
        kind: 'edge',
        covers: artifacts.map((a) => a.id),
        file: 'SKILL.md',
        patterns: ['Do \\*\\*not\\*\\* use for'],
        provenance: `interview: non-trigger is "${nonTrigger}"`,
      },
    },
    {
      file: 'artifacts-are-declared.json',
      body: {
        id: 'artifacts-are-declared',
        description: 'Every artifact stays declared in the manifest with a path and a kind.',
        type: 'json_shape',
        kind: 'accuracy',
        covers: artifacts.map((a) => a.id),
        file: 'skill.json',
        requiredKeys: ['artifacts.id', 'artifacts.path', 'artifacts.kind'],
        provenance: 'hard rule: an artifact nobody declared is an artifact nobody tests',
      },
    },
  ];
  if (artifacts.length === 0) {
    cases[0].body.covers = [];
    cases[1] = {
      file: 'workflow-steps-present.json',
      body: {
        id: 'workflow-steps-present',
        description: 'The workflow still has numbered, actionable steps.',
        type: 'contains',
        kind: 'accuracy',
        covers: [],
        file: 'SKILL.md',
        patterns: ['## Workflow', '### 1\\.'],
        provenance: `interview: trigger is "${trigger}"`,
      },
    };
  }
  return cases.map((c) => ({ file: c.file, text: JSON.stringify(c.body, null, 2) + '\n' }));
}

export function interviewNotes({ name, answers }) {
  const rows = answers.map((a) => `### ${a.question}\n\n${a.answer || '_(not answered)_'}\n`).join('\n');
  return `# Interview notes — ${name}

Captured by \`npm run skill:new\`. These answers are the provenance for the rules in \`SKILL.md\`
and for the regression cases. When a rule changes, update the answer that justified it.

${rows}
`;
}
