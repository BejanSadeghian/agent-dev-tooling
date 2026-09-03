# Testing framework

**This document is the source of truth for how skills are tested.** Other pages (README,
FRAMEWORK.md, skill references) summarize it; where they disagree, this page wins.

## The idea

A skill is used by an agent, so testing has to cover more than the skill's parts. Code can be
unit-tested; documents can be pattern-checked; but the thing that actually ships is *an agent
following the skill across multiple steps, producing artifacts along the way* — and agents are
stochastic, so a single lucky run proves nothing. The framework therefore has three layers, each
answering a different question, plus one rule about what may block a commit.

| Layer | Question | Deterministic? | Gates commits? |
| --- | --- | --- | --- |
| 1. Code tests | Is the deterministic code exactly right? | yes | yes |
| 2. Document cases | Do the skill's written rules still hold? | yes | yes |
| 3. Scenario evals | Does an agent using the skill produce the right outcome, repeatably? | no (LLM-in-the-loop) | never — gates *shipping*, with a human |

## Layer 1 — code tests (`scripts/tests/`)

Python `unittest` classes on the stdlib-only harness (`.framework/harness/skillharness`), three
kinds, all three required for a doer's artifact and every module in its `scripts/`:

- **accuracy** — a small input whose correct answer was stated in advance; output must match it
  and be byte-identical across repeated runs (`assert_deterministic`).
- **edge** — empty/single/null/missing/wrong-type/unicode/oversized/boundary inputs must produce
  a valid result or a *declared* error (`ValueError`/`TypeError` naming the row) — never a crash
  or silent nonsense (`assert_survives_edge_cases`).
- **performance** — time and peak memory measured at ≥3 input sizes (`self.measure`); growth
  above the scaling budget (default n^1.35) fails, and regressions against the recorded run fail.

Each file declares `KIND = "..."` and `COVERS = [...]` so coverage is provable. Tests are not
JSON: JSON is only layer 2's format.

## Layer 2 — document regression cases (`evals/cases/*.json`)

Declarative assertions that pin the skill's written rules — every hard rule, every piece of
author feedback, the trigger boundary. One JSON object per file; types: `files_exist`,
`contains`, `not_contains`, `json_shape`, and `command` (which can run any executable, so tests
in any language can be wired in through it). Cases must be deterministic and offline; a case that
can flake is not a regression test.

## Layer 3 — scenario evals (`evals/scenarios/`)

The acceptance layer: it tests **the agent using the skill**, holistically.

**Anatomy.** A scenario is committed inside the skill:

```text
evals/scenarios/<name>/
  scenario.json    { description, trials?, steps: [ { role, prompt, checkpoints: [...] } ] }
  fixtures/        the starting workspace
```

**How a run works.** Each *trial* copies `fixtures/` into a fresh sandbox and walks the steps in
order with a clean sub-agent — the interpreter step consumes whatever the doer step actually
produced, so intermediate artifacts are part of what is tested. After each step, checkpoints run:

- artifact checkpoints — the layer-2 types, evaluated against the sandbox (`files_exist`,
  `contains`, `json_shape`, `command`);
- transcript checkpoints — `transcript_contains`, `transcript_not_contains`,
  `transcript_order` — behavioral evidence: the script was run, numbers were not hand-computed,
  the schema was read before writing;
- `judge` — an LLM grades the named files (or the transcript) against a rubric written in the
  scenario, replying PASS/FAIL with reasons.

**Repeatability is the measurement.** Default 3 trials (`scenarios.trials` in `framework.json`,
overridable per scenario). The machine verdict is strict: every checkpoint, every trial.

**One scenario = one verdict.** Trials are evidence inside it, never separate tests: "passed 2 of
3" is not two results, it is one result — *inconsistent*. The report is a checkpoint × trial grid
with a rate column, so the exact expectation that wavered is named.

**The human override.** `npm run scenario -- <uc> <name> --accept "reason"` (or `--reject`)
records who/when/why; the effective verdict flips but the machine verdict stays visible
underneath. An override without a reason is refused. Only a human overrides.

**Where results live.** Verdict + grid: `.framework/state/scenarios/<use-case>/<name>.{json,md}`
— committed, they are the acceptance record. Full transcripts: the skill's `evals/runs/` —
gitignored.

## The quick loop vs. acceptance

`npm run subagent -- <uc> "task"` is the fast inner loop while authoring: one fresh-agent run,
transcript captured, shallow deterministic checks. Scenarios are the acceptance pass: run them
(`npm run scenario -- <uc>`) before shipping, and turn the first real task a skill handles into
its first committed scenario.

## What gates what

- **Commits** are gated only by deterministic things: layers 1–2 green, format + role rules, and
  the **freshness rule** — each suite run records a content fingerprint in `.framework/state/`;
  editing a skill without re-running its suite fails the gate. Same gate in `npm run check`, the
  pre-commit hook, and CI (with a hook-parity job).
- **Shipping** (`npm run publish`) additionally expects scenario verdicts a human stands behind.
  Scenario runs never gate commits, because they are nondeterministic by nature.
