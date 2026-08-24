# Refinement: apply, feedback, fold back

A skill that has never been applied is a hypothesis. This loop turns it into a procedure.

## The loop

1. **Pick a real task** the skill claims to cover — from the author's actual queue, not invented.
2. **Run the skill verbatim.** Follow only what is written. When you hit a gap, do *not* fill it
   from your own knowledge; write the gap down and then improvise, marked.
3. **Log the run** in `references/application-log.md` inside the skill:
   - task, date, outcome;
   - every improvisation (the gaps);
   - every re-read (the ambiguities);
   - what the author changed in the output (the misses).
4. **Get the author's feedback on the output** — not on the document. "What would you have done
   differently here?" Documents get polite feedback; outputs get honest feedback.
5. **Fold each item back in** using the mapping below. Every item lands as a change **and** a case.
6. **Re-run** on a fresh task. Stop when a run needs no improvisation twice running.

## Mapping feedback to changes

| What you heard | Change in the skill | Regression case |
|---|---|---|
| "It should have done X" | add/extend the step | `contains`: the step text is present |
| "It did X when it shouldn't" | add the exception to the step, or narrow the scope line | `not_contains` on the removed behaviour |
| "It fired on the wrong request" | tighten `description`; add an explicit non-trigger to `## When to use` | `contains`: the non-trigger clause |
| "It missed a step I always do" | insert the step in `## Workflow` | `contains` on the step's key phrase |
| "The output format was wrong" | add a file under `templates/` and reference it | `files_exist` + `contains` on the template |
| "I stopped reading halfway" | move depth to `references/`, leave a one-line link | `contains` on the link; word-count shrinks |
| "It was right but slow" | reorder so the common path is first; make the rare path a branch | none (advisory) |
| "It hallucinated a value" | name the source of truth in the step | `contains` on the source-of-truth path |

## Rules

- **One feedback item, one case.** If you cannot write a case, the feedback is not concrete enough —
  go back and ask what the observable difference would be.
- **Never widen scope to absorb feedback.** Feedback about a neighbouring job is a new skill; say so.
- **Edits shrink as often as they grow.** Most refinement is deletion — options nobody uses,
  background nobody reads.
- **Re-run the suite after every edit** (`node scripts/run-regression.mjs <skill>`); the rubric gate
  fails a skill edited after its last recorded run.
