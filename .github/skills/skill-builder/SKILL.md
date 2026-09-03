---
name: skill-builder
description: >-
  Builds a production use case as a doer/interpreter skill pair: interviews the author, generates
  both skills (documents, artifact schema, deterministic Python, accuracy/edge/performance tests),
  refines them by running clean sub-agents against real work, and gates everything. Use when
  someone wants to create a new skill or use case, rewrite or refine an existing one, or add
  regression coverage to a skill that has none.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
---

# Skill builder

Build a use case the way you would build a service: capture the requirement, generate the whole
pair, run it against reality, and lock every lesson into a test so it can never regress.

Three rules shape everything below:

- **Every use case is a pair.** The **doer** is as low-level and procedural as the task allows:
  deterministic code turning input data into ONE structured artifact whose shape is committed in
  `references/schema.md` — easy to verify exactly. The **interpreter** reads that artifact,
  states the facts it shows, and applies judgment — always in that order, always separated.
- **Anything that must be exact is Python in the doer's `scripts/`, not prose.** A number a
  language model produced cannot be reproduced and cannot be tested.
- **You never execute a skill you are developing.** You already know what it was meant to say, so
  you would silently compensate for unclear instructions. Testing is always
  `npm run subagent -- <use-case> "<task>"` — a fresh agent process with zero context that reads
  the latest skill from disk. See step 6.

## When to use

Use when the author wants to:

- create a new use case (a doer/interpreter pair) from raw material — notes, a transcript, a runbook, an existing prompt, "the way I do X";
- refine a skill after a sub-agent run — a bad trigger, a missed step, a wrong default, a schema gap;
- add the missing half of a pair (the health report warns about incomplete pairs);
- retrofit deterministic Python, a schema, or a regression suite onto a skill that has none.

Do **not** use for: writing a one-off prompt (no skill needed), editing this repo's tooling
(`.framework/`), authoring test data or extra tests for an existing skill (that is
`test-generator`), or git and GitHub work (that is `dev-helper`).

## Inputs

| Input | Required | Notes |
|---|---|---|
| Raw material | yes | Notes, transcripts, docs, a prompt, code. Read all of it before asking anything. |
| Author availability | yes | The interview is a real conversation. Do not invent answers. |
| Framework spec | yes | `.framework/FRAMEWORK.md` + `.framework/framework.json` — the layout and pair rules are not yours to choose. |
| A real task to run it on | yes, by step 6 | Refinement without a clean sub-agent run is guesswork. |

## Workflow

### 1. Read the raw material first

Read everything the author gave you, plus any skill it resembles (`npm run health` lists them). Then
write, in three sentences, what you believe the use case does and when it should fire. Open the
interview with that — a wrong guess out loud extracts far more than an open question.

### 2. Interview the author

Work through `references/interview.md`. Rules:

- **One question at a time.** Batched questions get batched, shallow answers.
- **Ask for the last three real instances**, not the general case. "When did you last do this? What
  did you actually type?"
- **Chase the exceptions.** "When does this *not* apply?" is the question that produces a
  description precise enough to trigger correctly.
- **Draw the pair boundary.** Which part is mechanical data processing (the doer), and which part is
  reading meaning out of the result (the interpreter)? "Which values must come out identical every
  time?" — everything that answers yes is doer Python, per `references/python-determinism.md`.
- **Pin the artifact schema.** "What fields does each record carry? What does the downstream reader
  need?" This becomes the doer's `references/schema.md` — see `references/the-pair-contract.md`.
- **Find the variations.** "Does this differ by domain, team, or region?" Each answer becomes a file
  in `references/variations/`.
- **Stop when the answers stop changing your draft.** Usually 8–15 questions.

### 3. Confirm the boundary before generating

Play back, one line each: what the doer does, what the interpreter reads out of the artifact, when
each fires, when each must not fire, the artifact's record fields, and the interpreter's lens. Get
an explicit yes. If the doer's "does" needs an "and", it is two use cases — say so now.

### 4. Generate the pair

```bash
npm run skill:new
```

It asks the same questions and writes both skills into `development/` (creating the folder if
this is the first pair): the doer (`SKILL.md`,
`references/schema.md`, `references/variations/`, `scripts/<module>.py`, an accuracy test, an
edge-case test, a performance test, seed regression cases, the interview record) and the
interpreter (`SKILL.md` with the Facts/Interpretations contract, `references/variations/`,
structural regression cases). It then validates and runs what it generated.

Generate both halves by default. `--only doer` / `--only interpreter` exists for completing a pair
the health report flagged — never as an opening question.

### 5. Make the generated scaffold real

The generator writes the structure and working scaffolds. You write the substance:

- doer `SKILL.md` — replace the scaffolded steps with the real procedure. Procedure here; depth in
  `references/` linked from the step that needs it. Imperative second person, defaults not options.
- doer `references/schema.md` — the real record fields. The doer ALWAYS conforms to this shape and
  reports anything the input forced into the `deviations` field. It never invents a new shape.
- doer `scripts/<module>.py` — implement the exact parts. Total ordering on every output, an error
  contract in the docstring (`ValueError` for bad values, `TypeError` for wrong types), and a
  streaming pass where the input could be large.
- doer `scripts/tests/` — replace placeholder expectations: accuracy from the smallest inputs whose
  correct answer the author can state without running the code; the author's real "must never
  happen" edge cases; performance sizes and budgets from how big the real data gets.
- interpreter `SKILL.md` — the real lens: what counts as notable, concerning, actionable. Keep the
  two-part output contract exactly: `## Facts` (each fact citing the artifact field or record it
  came from, deviations carried in), then `## Interpretations`.
- both `references/variations/` — one file per domain/use-case/regional variation from the
  interview, each stating when it applies and what changes.

Run `npm run check` before showing the draft to anyone.

### 6. Test with a clean sub-agent — never in your own context

Pick a **real** task the use case claims to cover, then:

```bash
npm run subagent -- <use-case> "<the real task>"                    # doer
npm run subagent -- <use-case> "<the real task>" --role interpreter # interpreter, after the doer
npm run subagent -- <use-case> "<the real task>" --discovery       # does the description trigger?
```

Each run launches a fresh agent process that reads the latest skill from disk, captures the
transcript under the skill's `evals/runs/`, and judges the output deterministically (doer: artifact
parses and conforms; interpreter: Facts before Interpretations). Because every run re-reads disk,
edit-and-re-run is the whole loop — the author never has to switch contexts.

Read the transcript like a reviewer: every place the sub-agent improvised, re-read, or produced
something the author would change is a gap in the skill, not in the sub-agent. Then ask the author
about the *output*: "what would you have done differently?" Follow `references/refinement.md` to
turn each answer into exactly one of:

| Feedback | Lands as |
|---|---|
| "It should have done X" | a step in `SKILL.md` **and** a regression case asserting X |
| "It fired when it shouldn't" | tightened `description` **and** a re-run with `--discovery` |
| "That number is wrong" | a fix in `scripts/` **and** an accuracy test with the correct value |
| "It broke on this file" | an edge case in `scripts/tests/test_edge_*.py`, then the fix |
| "It took forever on the big export" | a size in the performance test, then the algorithm change |
| "The artifact shape is wrong" | a `references/schema.md` change **and** a schema assertion |
| "It mixed opinion into the facts" | a sharper Facts rule in the interpreter **and** a structural case |
| "Too long / I skipped that part" | move the section to `references/`, link it from the step |

Iterate until a sub-agent run needs no improvisation. Two clean runs beats ten edits.

### 7. Cover every artifact and module

```bash
npm run test:new -- <skill-name>
```

Reports and fills the gaps: the doer's artifact and every deterministic module need an accuracy, an
edge-case, and a performance test. The bar for the suite:

1. One case per **hard rule** in `SKILL.md`.
2. One case per **piece of author feedback** — the ratchet: a mistake made once cannot come back.
3. One trigger case pinning the description's boundary.
4. Accuracy, edge, and performance coverage for the artifact and every module in the doer's `scripts/`.
5. Structural cases pinning the interpreter's two-part output and its schema reference.

Write them with the author watching. "What would prove this is still working six months from now?"

### 8. Gate it, then ship it

```bash
npm run check
```

Format and roles → tests (cases, Python, performance budgets) → rubric → library health. Fix until
clean, then `npm run save`. The refreshed `.framework/state/<skill>.json` files are part of the change:
they are the evidence the suite ran after the last edit. When the pair is done and reviewed,
`npm run publish -- <use-case>` ships it to the repo that will use it.

## Outputs

- The pair under `development/`, valid against `.framework/FRAMEWORK.md`: both documents, the
  committed schema, variations, Python, tests, cases.
- A green suite covering every hard rule, the artifact, and every module.
- Clean sub-agent transcripts under `evals/runs/` showing runs that needed no improvisation.
- `references/interview-notes.md` — the provenance for every rule.

## Rubric

Before calling it done, self-check the advisory rows a machine cannot catch: trigger precision, a
real sub-agent run in both modes, feedback folded back in, case provenance, progressive disclosure,
determinism, and a clean facts/interpretation boundary.

## References

- `references/interview.md` — the question set, in order, with follow-ups.
- `references/the-pair-contract.md` — the pair contract: schema, deviations, handoff.
- `references/python-determinism.md` — what becomes doer Python, and how it must behave.
- `references/refinement.md` — the sub-agent feedback loop and how feedback maps to changes.
- `references/regression-tests.md` — case types, the three test kinds, and anti-patterns.
- `references/variations/` — how this skill itself adapts.
- `assets/templates/` — interview notes and case scaffolds.
