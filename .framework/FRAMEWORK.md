# Skill framework spec

The contract every skill in this repo must satisfy. `framework.json` (next to this file) is the
machine-readable mirror — the pre-commit hook and CI both read that file, so **change the JSON in
the same commit you change this page**.

## 1. The two ideas

**Every use case ships as a pair.**

- `<use-case>-doer` — as low-level and procedural as the task allows. Deterministic code in
  `scripts/` turns input data into ONE structured artifact whose shape is committed in
  `references/schema.md`. Easy to verify exactly, three ways: accuracy, edge cases, performance.
- `<use-case>-interpreter` — reads that artifact, identifies **Facts** (each traceable to the
  artifact), then applies **Interpretations** (its own lens) — always in that order, always
  separated.

The role is detected from the directory-name suffix; there is no manifest. A skill under
`development/` with neither suffix fails the format check. A pair missing one half is a
**warning, never a blocker** (`npm run health` keeps naming it).

**Skills are developed here, used elsewhere.**

- `.github/skills/` — the dev tools (`skill-builder`, `test-generator`, `dev-helper`), each
  directly at this level, where GitHub Copilot discovers them. These are the skills the authoring
  agent uses.
- `development/` — product skills being built (created by `npm run skill:new` when the first
  pair is generated). Deliberately NOT auto-discovered: a work in progress never leaks into the
  authoring agent's skill list, and the authoring agent never executes one in its own context —
  `npm run subagent` launches a clean sub-agent instead.
- When a pair is green, `npm run publish -- <use-case>` ships it to a target repo (configured in
  `targets.json`, default destination `.github/skills/`).

## 2. Skill layout (agentskills.io)

Skills live one directory deep under a configured root (`skillsDirs`: `development/` and
`.github/skills/`). The directory name **is** the skill name.

```text
<skills-root>/<skill-name>/
  SKILL.md            # required — the only file the agent always reads
  assets/             # static fixtures, sample data, images, file templates
  references/         # deep-dive docs loaded on demand
    variations/       # required — domain / use-case / regional adaptations, one file each
    schema.md         # doers only — the committed artifact shape (must define "deviations")
  scripts/            # executable code; the doer's deterministic Python and its tests
    <module>.py
    tests/test_{accuracy,edge,performance}_<module>.py
  evals/
    cases/*.json      # required (>= 1) — the JSON regression suite for this skill
    runs/             # captured sub-agent transcripts (gitignored)
```

No other top-level directories are allowed inside a skill (`allowUnknownDirs: false`). Transient
dirs (`outputs/`, `__pycache__/`, `.pytest_cache/`, `evals/runs/`) are invisible to both the
layout check and the freshness hash.

## 3. `SKILL.md`

YAML frontmatter, first line of the file:

| Key | Required | Rule |
| --- | --- | --- |
| `name` | yes | `^[a-z0-9]+(-[a-z0-9]+)*$`, equals directory name, <= 64 chars |
| `description` | yes | 40–1024 chars, third person, WHAT + WHEN, must contain a trigger clause (`Use when` / `Use this` / `Use for` / `Use whenever`) |
| `license`, `allowed-tools`, `metadata` | no | Unknown keys are a hard error. |

Body: markdown, <= 5000 words. Required headings: `## When to use` and `## Workflow`. Forbidden
anywhere: `TODO`, `FIXME`, `<placeholder>`, `Lorem ipsum`. Ship it finished or do not ship it.

Role rules on top of that:

- **doer** — `references/schema.md` exists and defines `deviations`; `scripts/` is non-empty.
- **interpreter** — the body must contain `## Facts`, `## Interpretations`, and name `schema.md`
  (the output-structure contract and the input contract).

## 4. The schema contract

The doer ALWAYS conforms to its committed `references/schema.md`:

```json
{ "records": [ { } ], "deviations": [ "what the input forced" ] }
```

It never invents a new shape at run time. When the input forces a departure — a missing field, an
unparseable value, an unexpected variant — the artifact still conforms structurally and the
departure is reported in `deviations`, so the human and the downstream interpreter both see it.
The interpreter reads `deviations` first and carries every entry into its Facts section.

## 5. Deterministic Python (`scripts/`)

Anything that must be exact — arithmetic, parsing, thresholds, ranking, reconciliation — is code,
not prose. Modules must be deterministic (no clock, no unseeded randomness, no network, total
ordering on every output), must raise `ValueError` for bad values and `TypeError` for wrong types
with the row named in the message, and should stream rather than materialise where the input can
be large.

Tests live in `scripts/tests/`, one file per kind, as `unittest.TestCase` subclasses built on
`skillharness` (`.framework/harness/`, stdlib-only) — they run under plain `python3 -m unittest`
and under pytest when available.

## 6. Test kinds and coverage

| Kind | Question it answers |
| --- | --- |
| `accuracy` | Is the output right, and does it conform to the schema? |
| `edge` | Empty, single, null, missing, wrong type, unicode, oversized, boundary values. |
| `performance` | How do compute time and peak memory grow with input size? |

Coverage owed, by role:

- **doer** — all three kinds for its artifact (target: the use-case name) and for every `*.py`
  module in `scripts/`. A JSON case declares `{ "kind": "accuracy", "covers": ["<use-case>"] }`;
  a Python test declares `KIND = "..."` and `COVERS = [...]` at the top of the file.
- **interpreter** — structural evals: the two-part output contract and the schema reference
  (seeded by the generator).
- **tools** (`.github/skills/`) — role-exempt: evals required, three-kind regime only if they own
  Python.

`npm run test:new -- <skill>` reports every missing combination and writes the file that closes it.

## 7. Regression suite (`evals/cases/*.json`)

One JSON object per file: `id`, `description`, `type` required. Types — see
`scripts/lib/cases.mjs`:

| type | passes when |
| --- | --- |
| `files_exist` | every `paths[]` entry exists inside the skill dir |
| `contains` / `not_contains` | every / no `patterns[]` regex matches `file` |
| `json_shape` | `file` parses as JSON and has `requiredKeys[]` (dot paths) |
| `command` | `cmd` exits `expectExitCode` (default 0) and matches `expectStdout[]` |

`command` cases run from the skill directory and must be deterministic and offline. A case that
can flake is not a regression test.

## 8. The clean sub-agent rule

The agent developing a skill never executes it in its own context — it would compensate for the
skill's gaps from conversation memory. `npm run subagent -- <use-case> "<task>"` launches a fresh
Copilot CLI process (configurable in `framework.json` `subagent`) that reads the latest skill from
disk, captures the transcript under `evals/runs/`, and judges the output deterministically:

- doer runs: the artifact parses and carries `records` + `deviations`;
- interpreter runs (`--role interpreter`): `## Facts` appears before `## Interpretations`;
- `--discovery` omits the skill path to test that the description alone triggers.

Sub-agent runs are LLM-in-the-loop and therefore nondeterministic: they never gate pre-commit.
The gate below is purely deterministic.

## 9. Freshness rule and the gate

`npm run regression` runs each skill's JSON cases and Python tests, hashes every (non-transient)
file in the skill directory, and records the result in `.framework/state/<skill>.json` (performance in
`.framework/state/perf/<skill>.json`). The rubric fails if the current hash differs from the recorded
one — **you edited the skill and did not re-run its suite**. The state files are committed with
the change; they are the evidence.

The same gate runs in three places:

- `npm run check` — lint → format+roles → tests → rubric → health;
- `.framework/hooks/pre-commit` — the gate over the staged skills (wired by `npm run setup`;
  `SKIP_SKILL_GATE=1` is the visible escape hatch, and CI does not skip);
- `.github/workflows/skills-ci.yml` — the identical gate, plus hook parity, on every push and PR.
