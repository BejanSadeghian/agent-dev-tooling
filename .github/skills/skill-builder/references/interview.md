# The interview

Goal: extract a procedure precise enough that a stranger could follow it, and a trigger precise
enough that it fires on the right prompts and no others — **without asking a single question the
author's material already answers.**

## 0. The material comes first

Before any question:

1. **Read everything the author gave you, completely.** Notes, transcripts, runbooks, prompts,
   examples — all of it.
2. **Play back what you learned**, in a short summary: what the use case does, how it seems to be
   done today, what a good output looks like. Ask what you got wrong.
3. **Collect the name.** If the material does not name it, ask now: "What should this use case be
   called?" (it becomes `<name>-doer` and `<name>-interpreter`). Never generate under an invented
   name.

Everything after this is gap work. A question about something the material already covers is a
wasted question and tells the author you did not read.

## 1. Build the gap map, and let the author steer

Compare the material against what a finished pair needs to know:

| Area | The pair needs |
| --- | --- |
| Name | what the use case is called |
| Trigger | verbatim phrasings that should fire it; two near-misses that must not |
| Procedure | the steps in order; where it branches; the step people get wrong |
| Exactness | which values must be identical every run (those become doer code) |
| Artifact | the fields each record carries; what downstream reads |
| Judgment | the interpreter's lens: what counts as notable, concerning, actionable |
| Scope | what it deliberately does not cover; what it needs available; input size on a bad day |

Mark each area **answered by the material**, **partly answered**, or **a gap**. Then show the
author the gap list and ask where they want to start:

> "The material covers A, B, C well. The gaps I see are X and Y. Where do you want to dig in
> first — or is there an area you want me to focus on?"

**The author steers.** If they say "focus on the trigger" or "just ask me about the judgment
part", follow that lead and stay there until they move on. If they say an area does not matter
for this use case, record that decision in the interview notes and skip it — do not relitigate.
Only when they have no preference do you work the gaps in the table's order.

## 2. Digging into a gap

Use these techniques inside whatever area is open:

- **Concrete over general.** "Describe the last three times you did this" outperforms "in
  general, how do you...". For triggers: collect what someone would *actually type*, verbatim,
  and push for two requests that look similar but must NOT fire it.
- **Walk-through, then replay.** For procedure gaps: "walk me through it start to finish" —
  do not interrupt — then replay it as numbered steps and ask what you got wrong.
- **Wrong guesses extract more than open questions.** "So you'd always start by X?" gets
  corrected in detail; "how do you start?" gets a shrug.
- **Probe exactness concretely.** "If this number were 2% off, would you notice?" A yes means
  doer code (`references/python-determinism.md`), never prose.
- **Ask for artifacts of judgment.** For the interpreter's lens: "show me an output you accepted
  and one you rejected — what's the difference?" The difference IS the lens; the rejected one
  becomes a never-again test.
- **Silence is a tool.** After an answer, wait. The second half of the answer is the useful half.
- **One question at a time.** Batched questions get batched, shallow answers.

## 3. Close

Play back the whole picture in one breath: called / does / fires when / must not fire when /
produces (fields) / judged by / leaves out. Get an explicit yes before generating anything.

## Rules

- **Never invent an answer.** An unanswered gap is a note in the interview record, not a
  confident sentence in `SKILL.md`.
- **Record the author's skips.** "We decided not to cover X" is provenance, same as an answer.
- **Stop when answers stop changing the draft** — or when the author says they are done.
