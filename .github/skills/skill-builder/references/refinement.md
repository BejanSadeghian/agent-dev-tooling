# Refinement: sub-agent run, feedback, fold back

A skill that has never been run by a fresh agent is a hypothesis. This loop turns it into a
procedure. You — the agent developing the skill — never execute it yourself: you already know what
it was meant to say, so you would silently compensate for its gaps. The clean sub-agent cannot.

## The loop

1. **Pick a real task** the skill claims to cover — from the author's actual queue, not invented.
2. **Run the clean sub-agent:** `npm run subagent -- <use-case> "<task>"` (add
   `--role interpreter` for the second half, `--discovery` to test that the description alone
   triggers). It launches a fresh process that reads the latest skill from disk and captures the
   transcript under the skill's `evals/runs/`.
3. **Read the transcript like a reviewer:**
   - every improvisation is a gap in the skill;
   - every re-read or backtrack is an ambiguity;
   - a wrong or missing artifact is a schema or step failure — the deterministic checks under the
     transcript name which.
4. **Get the author's feedback on the output** — not on the document. "What would you have done
   differently here?" Documents get polite feedback; outputs get honest feedback.
5. **Fold each item back in** using the mapping below. Every item lands as a change **and** a case.
6. **Re-run** on a fresh task — the sub-agent picks up the edits automatically, since it reads disk
   at launch. Stop when a run needs no improvisation twice running.

## Mapping feedback to changes

| What you heard | Change in the skill | Regression case |
|---|---|---|
| "It should have done X" | add/extend the step | `contains`: the step text is present |
| "It did X when it shouldn't" | add the exception to the step, or narrow the scope line | `not_contains` on the removed behaviour |
| "It fired on the wrong request" | tighten `description`; add an explicit non-trigger to `## When to use` | `contains`: the non-trigger clause — then re-run `--discovery` |
| "It missed a step I always do" | insert the step in `## Workflow` | `contains` on the step's key phrase |
| "The artifact shape was wrong" | fix `references/schema.md`; the doer conforms, never invents | `contains` on the schema field |
| "It absorbed bad input silently" | report it in the artifact's `deviations` field | `contains`: the deviation rule |
| "It mixed opinion into the facts" | sharpen the interpreter's Facts rule | `contains` on the Facts/Interpretations contract |
| "I stopped reading halfway" | move depth to `references/`, leave a one-line link | `contains` on the link; word-count shrinks |
| "It was right but slow" | reorder so the common path is first; make the rare path a branch | none (advisory) |
| "It hallucinated a value" | name the source of truth in the step | `contains` on the source-of-truth path |

## Rules

- **One feedback item, one case.** If you cannot write a case, the feedback is not concrete enough —
  go back and ask what the observable difference would be.
- **Never widen scope to absorb feedback.** Feedback about a neighbouring job is a new skill; say so.
  Feedback about judgment belongs in the interpreter; feedback about processing belongs in the doer.
- **Edits shrink as often as they grow.** Most refinement is deletion — options nobody uses,
  background nobody reads.
- **Re-run the suite after every edit** (`npm run regression -- <skill>`); the rubric gate fails a
  skill edited after its last recorded run.
