# The interview

There is ONE interview per use case. It makes the whole set — doer, observer, and investigator
if there is cross-analysis content. Never split it into a doer interview and an observer
interview: the builder answers once, and everything is generated from that.

Goal: extract a procedure precise enough that a stranger could follow it, a trigger precise
enough that it fires on the right prompts and no others, and a lens precise enough that two
readers produce the same reading — **without asking a single question the source file or an
earlier answer already covers.**

## 0. The source file comes first

The author gives you a source file — `.md` or `.docx` — describing the overall process flow.
Before any question:

1. **Read it completely.** For `.docx`, extract the text first (python-docx); for `.md`, read
   it as-is. Notes, transcripts, runbooks, prompts, examples — all of it.
2. **Play back what you learned**, in a short summary: what the use case does, how it seems to
   be done today, what a good output looks like. Ask what you got wrong.
3. **Collect the name.** If the material does not name it, ask now: "What should this use case
   be called?" (it becomes `<name>-doer`, `<name>-observer`, and `<name>-investigator` if there
   is cross-analysis content). Never generate under an invented name.
4. **Keep the material.** Once the set is generated, save what the author gave you into the
   doer's `references/source-material/` — it is provenance, same as the interview notes. The one
   exception: anything containing real or personal data stays OUT of the repo
   (`.framework/framework-data.md`); record in the interview notes where it lives instead.

Everything after this is gap work. A question about something the source file already covers is
a wasted question and tells the builder you did not read.

**Persist as you go.** After every few answers, write what you have so far to
`tmp/interview-<use-case>.json` (gitignored) — a closed laptop must never lose an answer. At the
start of any session, check `tmp/` for a partial interview and offer to resume it.

## 1. One interview to make the set

Compare the source file against what the finished set needs to know:

| Area | The set needs |
| --- | --- |
| Name | what the use case is called |
| Trigger | verbatim phrasings that should fire the doer; two near-misses that must not |
| Procedure | the steps in order; where it branches; the step people get wrong |
| Exactness | which values must be identical every run (those become doer code) |
| Artifact | the fields each record carries; what downstream reads |
| Observer trigger | verbatim phrasings that should fire the reading; two near-misses that must not |
| Reading | which artifact fields the observer leans on; how deviations change the reading |
| Facts contract | what a fact cites; what must never appear in Facts |
| Lens | notable / concerning / actionable, each with a concrete example |
| Voice | how the reading sounds — a past write-up they were happy with |
| Examples | an accepted and a rejected past observation, and why each |
| Thresholds | what counts as material — a number or percentage, with the default |
| Investigator | cross-analysis content, if any — what gets compared across artifacts or runs |
| Scope | what it deliberately does not cover; what it needs available; input size on a bad day |

Mark each area **answered by the source file**, **partly answered**, or **a gap**. Then show the
builder the gap list and ask where they want to start:

> "The material covers A, B, C well. The gaps I see are X and Y. Where do you want to dig in
> first — or is there an area you want me to focus on?"

**The builder steers — and can end it.** If they say "focus on the trigger" or "just ask me
about the lens", follow that lead and stay there until they move on. If they say an area does
not matter, record that decision in the interview notes and skip it — do not relitigate. If
they say they are done, the interview is over: thank them, do not squeeze in one more question.

## 2. Digging into a gap

Use these techniques inside whatever area is open:

- **Concrete over general.** "Describe the last three times you did this" outperforms "in
  general, how do you...". For triggers: collect what someone would *actually type*, verbatim,
  and push for two requests that look similar but must NOT fire it.
- **Walk-through, then replay.** For procedure gaps: "walk me through it start to finish" —
  do not interrupt — then replay it as numbered steps and ask what you got wrong.
- **Wrong guesses extract more than open questions.** "So you'd always start by X?" gets
  corrected in detail; "how do you start?" gets a shrug. Same for judgment: "so a dip in X
  would always be concerning?" gets corrected into the actual threshold.
- **Probe exactness concretely.** "If this number were 2% off, would you notice?" A yes means
  doer code (`references/python-determinism.md`), never prose.
- **Accepted vs rejected.** For the lens: "show me a reading you accepted and one you rejected
  — what's the difference?" The difference IS the lens; the rejected one becomes a never-again
  structural test.
- **Walk me through a reading.** Put a real artifact in front of them — the seed one the
  generator made will do — and have them narrate: what do you notice first, what do you skip,
  what makes you worried.
- **Deviations drill.** "The doer flagged this deviation — what does your reading say about it?"
  If the answer is "nothing", the Facts contract has a hole.
- **Name the action.** For every concerning thing: "and then the reader does what?" An
  interpretation with no action is decoration.
- **Silence is a tool.** After an answer, wait. The second half of the answer is the useful half.
- **One question at a time.** Batched questions get batched, shallow answers.

## 3. Close

When the builder ends the interview — or the gaps run out:

1. **Note the remaining gaps, on the record.** Every area still marked a gap goes into the
   interview notes as an explicit open question, not a confident sentence in `SKILL.md`.
   Gaps are recorded, never re-litigated and never silently filled.
2. **Play back the whole picture** in one breath: called / does / fires when / must not fire
   when / produces (fields) / judged by (notable, concerning, actionable) / cross-analysis (if
   any) / leaves out / still open (the gaps).
3. **Get an explicit yes** before generating anything.

## Rules

- **Never invent an answer.** An unanswered gap is a note in the interview record, not a
  confident sentence in `SKILL.md`.
- **Record the builder's skips.** "We decided not to cover X" is provenance, same as an answer.
- **The builder can end or redirect the interview at any point.** Honor it immediately — no
  "just one more question".
- **A vague lens fails the close.** "Use your judgment" is not a lens — push for the concrete
  example that makes it real.
- **Stop when answers stop changing the draft** — or when the builder says they are done.
