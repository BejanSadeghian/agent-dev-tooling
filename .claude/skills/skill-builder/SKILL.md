---
name: skill-builder
description: >-
  Builds a production agent skill from raw material: interviews the author, generates the whole
  skill (document, manifest, deterministic Python, artifacts, and accuracy/edge/performance tests),
  refines it by applying it to real work and folding the author's feedback back in, and gates it.
  Use when someone wants to create a new skill, rewrite or refine an existing one, split a chain of
  skills apart, or add regression coverage to a skill that has none.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
---

# Skill builder

Build a skill the way you would build a service: capture the requirement, generate the whole thing,
run it against reality, and lock every lesson into a test so it can never regress.

Two rules shape everything below:

- **Anything that must be exact is Python, not prose.** Calculations, parsing, thresholds, ranking
  — a number a language model produced cannot be reproduced and cannot be tested.
- **Every artifact a skill produces is declared, and every declared artifact is tested** for
  accuracy, edge cases, and performance. Artifacts are why skills are split apart: one skill per
  artifact means each one can be tested on its own.

## When to use

Use when the author wants to:

- create a new skill from raw material (notes, a transcript, a runbook, an existing prompt, "the way I do X");
- refine a skill after using it — a bad trigger, a missed step, a wrong default;
- split one overloaded skill into a sequence of smaller ones, or wire a new step into an existing sequence;
- retrofit deterministic Python, artifacts, or a regression suite onto a skill that has none.

Do **not** use for: writing a one-off prompt (no skill needed), editing this repo's tooling
(`scripts/`), authoring test data or extra tests for an existing skill (that is `test-generator`),
or git and GitHub work (that is `dev-helper`).

## Inputs

| Input | Required | Notes |
|---|---|---|
| Raw material | yes | Notes, transcripts, docs, a prompt, code. Read all of it before asking anything. |
| Author availability | yes | The interview is a real conversation. Do not invent answers. |
| Format spec | yes | `SKILL_FORMAT.md` + `skill.config.json` — the layout is not yours to choose. |
| A real task to apply it to | yes, by step 6 | Refinement without application is guesswork. |

## Workflow

### 1. Read the raw material first

Read everything the author gave you, plus any skill it resembles (`npm run health` lists them). Then
write, in three sentences, what you believe the skill does and when it should fire. Open the
interview with that — a wrong guess out loud extracts far more than an open question.

### 2. Interview the author

Work through `references/interview.md`. Rules:

- **One question at a time.** Batched questions get batched, shallow answers.
- **Ask for the last three real instances**, not the general case. "When did you last do this? What
  did you actually type?"
- **Chase the exceptions.** "When does this *not* apply?" is the question that produces a
  description precise enough to trigger correctly.
- **Find the exact parts.** "Which numbers must come out identical every time?" Everything that
  answers yes becomes Python, per `references/python-determinism.md`.
- **Find the artifacts.** "What files should exist when it's done?" Each one gets an id, a path, and
  its own tests — see `references/artifacts-and-sequences.md`.
- **Stop when the answers stop changing your draft.** Usually 8–15 questions.

### 3. Confirm the boundary before generating

Play back, one line each: what it does, when it fires, when it must not fire, what it leaves out,
which artifacts it produces, and which parts are exact. Get an explicit yes. If the "does" needs an
"and", it is two skills — say so now and plan the sequence.

### 4. Generate the skill

```bash
npm run skill:new
```

It asks the same questions and writes everything: `SKILL.md`, `skill.json` (the manifest of
artifacts and Python entrypoints), `python/<module>.py`, an accuracy test, an edge-case test, a
performance test, seed regression cases, and the interview record. It then validates and runs what
it generated.

**Generate every part by default.** Once it is done, tell the author that any part can be dropped —
`npm run skill:new -- --skip <artifact-id>`, or `"generate": false` with a `skipReason` in
`skill.json`. Never open by asking which parts they want; that question trades a complete draft for
a decision they cannot yet make.

### 5. Make the generated scaffold real

The generator writes the structure and working scaffolds. You write the substance:

- `SKILL.md` — replace the scaffolded steps with the real procedure. Procedure here; depth in
  `references/` linked from the step that needs it. Imperative second person, defaults not options.
- `python/<module>.py` — implement the exact parts. Total ordering on every output, an error
  contract in the docstring (`ValueError` for bad values, `TypeError` for wrong types), and a
  streaming pass where the input could be large.
- `python/tests/test_accuracy_*.py` — replace the placeholder expectations with the smallest inputs
  whose correct answer the author can state without running the code.
- `python/tests/test_edge_*.py` — keep `assert_survives_edge_cases`; add the author's real "must
  never happen" cases.
- `python/tests/test_performance_*.py` — set the sizes and the budgets from how big the real data gets.

Run `npm run check` before showing the draft to anyone.

### 6. Apply it, then collect feedback

Pick a **real** task the skill claims to cover and run the skill verbatim — no filling gaps from
your own knowledge; a gap you paper over is a gap that ships. Capture every step you had to
improvise, every place you had to re-read, and everything the author changed in the output.

Then ask the author about the *output*, not the document: "what would you have done differently?"
Follow `references/refinement.md` to turn each answer into exactly one of:

| Feedback | Lands as |
|---|---|
| "It should have done X" | a step in `SKILL.md` **and** a regression case asserting X |
| "It fired when it shouldn't" | tightened `description` **and** a trigger case |
| "That number is wrong" | a fix in `python/` **and** an accuracy test with the correct value |
| "It broke on this file" | an edge case in `python/tests/test_edge_*.py`, then the fix |
| "It took forever on the big export" | a size in the performance test, then the algorithm change |
| "It got the format wrong" | a template **and** an artifact assertion |
| "Too long / I skipped that part" | move the section to `references/`, link it from the step |

Iterate until an application run needs no improvisation. Two clean runs beats ten edits.

### 7. Cover every artifact and entrypoint

```bash
npm run test:new -- <skill-name>
```

Reports and fills the gaps: every artifact and every Python entrypoint needs an accuracy, an
edge-case, and a performance test. The bar for the suite:

1. One case per **hard rule** in `SKILL.md`.
2. One case per **piece of author feedback** — the ratchet: a mistake made once cannot come back.
3. One trigger case pinning the description's boundary.
4. Accuracy, edge, and performance coverage for every artifact and every Python entrypoint.

Write them with the author watching. "What would prove this is still working six months from now?"

### 8. Gate it

```bash
npm run check
```

Format → tests (cases, Python, performance budgets) → rubric → library health. Fix until clean, then
`npm run save`. The refreshed `.skill-state/<skill>.json` and `.skill-state/perf/<skill>.json` are
part of the change: they are the evidence the suite ran after the last edit.

## Outputs

- The skill directory, valid against `SKILL_FORMAT.md`: document, manifest, Python, tests, cases.
- A green suite covering every hard rule, every artifact, and every entrypoint.
- A performance report showing compute time and memory against input size.
- `references/interview-notes.md` — the provenance for every rule.

## Rubric

Before calling it done, self-check against `RUBRIC.md`. The advisory rows are the ones a machine
cannot catch: trigger precision, a real application run, feedback folded back in, case provenance,
progressive disclosure, determinism.

## References

- `references/interview.md` — the question set, in order, with follow-ups.
- `references/artifacts-and-sequences.md` — declaring artifacts, splitting a chain into testable skills.
- `references/python-determinism.md` — what becomes Python, and how it must behave.
- `references/refinement.md` — the apply/feedback loop and how feedback maps to changes.
- `references/regression-tests.md` — case types, the three test kinds, and anti-patterns.
- `templates/` — `SKILL.md` scaffold, interview notes, case scaffolds.
