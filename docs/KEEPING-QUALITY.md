# Keeping quality as the library grows

One skill is easy to keep good. Forty is not. Quality does not collapse — it erodes, in five
predictable ways. Each one has a specific guard in this repo, and a specific habit that makes the
guard work.

Run this once every couple of weeks, or whenever something feels off:

```bash
npm run health
```

It prints every skill with its test count, when its tests last ran, whether it is green, and what
needs fixing — in plain language, with the command that fixes it.

---

## The five ways it rots, and what stops each one

### 1. Someone edits a skill and never re-runs its tests

**What it looks like:** the skill still passes, because nobody ran it. Six weeks later it is broken
and nobody knows when it broke.

**The guard:** every test run records a fingerprint of the skill's files. Change any file and the
fingerprint no longer matches, so the checks fail with *"stale: edited after its last regression
run"*. You cannot save past it, and GitHub re-checks it after you upload.

**The habit:** when you change a skill, run `npm run check` before you save. That is all.

---

### 2. Two skills start doing the same job

**What it looks like:** you ask for one thing and the assistant confidently uses the wrong skill.
This is the single most common failure in a growing library, and it is invisible until it bites.

**The guard:** `npm run health` compares every pair of skill descriptions and warns when two are too
alike ("descriptions are 61% alike — the agent may fire the wrong one"). It also fails outright when
two skills claim to produce the same output file.

**The habit:** every skill's description must say **when it must not fire**, and name the skill that
should fire instead. When health warns about a pair, sharpen one description or merge the two.

---

### 3. A skill grows a second job

**What it looks like:** "it also does X now." The instructions get longer, the tests do not, and no
single test failure can tell you which half broke.

**The guard:** each skill declares the artifacts it produces, and each artifact must have its own
accuracy, edge-case, and performance test. Adding an output without adding its tests fails the
checks.

**The habit:** when a skill's workflow has two unrelated halves, split it into two skills and wire
them as a sequence (`sequences/*.json`). One skill per output is what keeps each one testable.

---

### 4. The code quietly gets slower

**What it looks like:** fine on the ten-row sample, unusable on the real export. Nobody notices
until someone waits four minutes.

**The guard:** performance tests measure time *and* peak memory across at least three input sizes and
record the growth rate. A later run that grows faster than before fails the suite — even when both
runs look fast on a small fixture.

**The habit:** set the biggest test size to the biggest input you actually have. When you change how
something is calculated, look at the printed table: flat memory means it streams; memory rising with
row count means it is holding everything.

---

### 5. Tests stop meaning anything

**What it looks like:** tests that assert whatever the code currently does, so they never fail and
never catch anything. Usually created by regenerating a snapshot until it passes.

**The guard:** every test declares what it covers and why (`provenance`). Every regression test must
be shown to fail on the unfixed code before it counts.

**The habit:** when something goes wrong, fix it **and** add the test that would have caught it,
before you move on. Feedback becomes a test, always. That ratchet is what makes the library get
better rather than just bigger.

---

## The routine

**Every time you change a skill**

```bash
npm run check          # then: npm run save "what you did"
```

**Every couple of weeks**

```bash
npm run health
```

Fix anything red. Look at anything amber. Two questions worth asking yourself while you read it:

- Any skill not run in months? Either exercise it, or delete it. A skill nobody uses is a skill
  nobody maintains — and it still confuses the assistant when it fires by mistake.
- Any skill with only one or two tests? That is thin cover for something real. Add a test for each
  hard rule.

**Whenever you finish using a skill on real work**

Tell your assistant what was wrong with the result. That sentence becomes a fix and a test. This is
the only habit on this page that improves the library rather than just protecting it.

---

## Deleting is maintenance too

The cheapest way to keep a library healthy is to keep it small. Delete a skill when nobody has used
it in months, when another skill does the same job better, or when its job has gone away. Removing
the directory and its `.skill-state/` entry is the whole job — nothing else refers to it.
