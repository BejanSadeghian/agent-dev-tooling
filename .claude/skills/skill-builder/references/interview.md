# The interview

Goal: extract a procedure precise enough that a stranger could follow it, and a trigger precise
enough that it fires on the right prompts and no others. One question at a time, in this order.
Skip a question only when the raw material already answers it — then confirm your reading instead
of asking cold.

## A. Trigger (do this first — it is the hardest part to get right)

1. "Describe the last three times you did this. What were you actually doing right before?"
2. "What would someone type that should make this fire?" — collect **verbatim phrasings**, not paraphrases.
3. "What is a request that looks like this but should *not* fire it?" — push until you get two.
4. "Is there a neighbouring skill that overlaps? Where is the line?"

## B. Procedure

5. "Walk me through it start to finish, as if I'm doing it for the first time." Do not interrupt.
   Then replay it back as numbered steps and ask what you got wrong.
6. For each step: "What do you look at to do this? What do you produce?"
7. "Which step do people get wrong most often?" — that step needs the most words and a regression case.
8. "Where do you branch?" Get the condition and the default. If there is no default, ask what they
   do when they cannot tell — that is the default.

## B2. What must be exact, and what it produces

These four questions decide how much of the skill is code rather than prose. Ask them before you
generate anything.

9. "Which parts must come out identical every single time?" — every yes becomes a Python function
   (`references/python-determinism.md`). Push: "if this number were 2% off, would you notice?"
10. "What files should exist when it's finished?" — each becomes a declared artifact with an id, a
    path, and its own accuracy, edge-case and performance tests.
11. "Would you ever want one of those without the others?" — a yes means separate skills in a
    sequence, not one skill with two outputs.
12. "How big does the input get, on a bad day?" — that number becomes the largest size in the
    performance test, and the budget it must stay under.

## C. Quality bar

13. "How do you know the output is good? What makes you reject one?" — this becomes the rubric and
   the assertions in the regression suite.
14. "Show me a good output and a bad one." Keep both; the good one becomes a template, the bad one
    becomes a `not_contains` case.
15. "What must never happen?" — hard constraints. Each becomes its own case.

## D. Scope and inputs

12. "What does this deliberately not cover?"
17. "What does it need available to work — files, credentials, tools, a running service?"
18. "Who is the reader of the output, and what do they do with it next?"

## E. Close

19. Play back: does / fires when / produces which artifacts / must not fire when / leaves out. Get an explicit yes.

## Interviewing rules

- **Concrete over general.** "The last three times" outperforms "in general, how do you...".
- **Silence is a tool.** After an answer, wait. The second half of the answer is the useful half.
- **Wrong guesses extract more than open questions.** "So you'd always start by X?" gets corrected
  in detail; "how do you start?" gets a shrug.
- **Never invent an answer.** An unanswered question is a note in the interview record, not a
  confident sentence in `SKILL.md`.
- **Stop when answers stop changing the draft.** Typically 10-19 questions; the exactness and
  artifact questions (B2) are never the ones to skip.
