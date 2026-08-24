# How to use this repo (no coding needed)

This repo is where your skills live. A **skill** is a set of instructions an AI assistant follows,
plus the exact code and the tests that keep it honest.

You do not need to know git, Python, or JavaScript. You need six commands and an AI assistant
(Claude Code or GitHub Copilot) open in this folder.

---

## Day one: set up (once)

1. Open a terminal in this folder.
2. Run:

   ```bash
   bash setup/install.sh
   ```

   It checks what you have, installs nothing you do not need, switches on the safety checks, and
   proves it works by running everything once.

3. Tell it who reviews your work:

   ```bash
   bash setup/configure-gh.sh
   ```

   Type your teammates' GitHub usernames when it asks. From then on they are added to every review
   request automatically.

If anything looks wrong later, run `npm run doctor`. It re-checks the setup and fixes what it can.

---

## The six commands

| You want to | Type this |
|---|---|
| See what is going on | `npm run status` |
| Start something new | `npm run start "what you're working on"` |
| Check your work | `npm run check` |
| Save and back it up | `npm run save "what you did"` |
| Ask for review | `npm run ship "title"` |
| Fix your setup | `npm run doctor` |

That is the whole day-to-day loop: **start → work → check → save → ship**.

You can also just ask your assistant: *"save my work"*, *"open a pull request"*, *"why is the check
failing?"* — it has a `dev-helper` skill for exactly this and will run these commands for you.

---

## Making a new skill

Say to your assistant: **"make me a new skill for ..."**, or run:

```bash
npm run skill:new
```

It interviews you — a few plain questions, one at a time:

- What should it be called?
- What does it do, in a sentence?
- When should it kick in? When should it *not*?
- What files should it produce?
- Which parts have to be exactly right every time?
- What are the steps?

Then it writes everything: the instructions, the exact code for the parts that must not vary, three
kinds of test, and the record of your answers. It runs the tests and shows you the result.

**It generates every part by default.** If you did not want one of the files it produces, say so
afterwards — you are never asked to decide up front, before you have something to look at.

Then the important bit: **use the skill on a real job, and tell your assistant what was wrong with
the result.** Every piece of feedback becomes both a fix and a test, so the same mistake cannot come
back. Two clean runs on real work beats ten rounds of editing the instructions.

---

## What the checks are actually checking

When you run `npm run check`, five things happen:

| Check | In plain words |
|---|---|
| **lint** | Nothing in the repo is broken at the syntax level, and the house rules hold. |
| **format** | Every skill has its instructions, description, and required sections in the right shape. |
| **tests** | Every test passes: is the answer right, does it survive bad input, and is it fast enough on big input. |
| **rubric** | Nothing is untested, out of date, or missing a test for something it produces. |
| **health** | The library as a whole is still in good shape — nothing stale, overlapping, or drifting. |

Green means it is safe to save. Red always tells you which skill and which command fixes it. The
two most common:

| Message | What it means | Fix |
|---|---|---|
| `stale: skill edited after its last regression run` | You changed a skill and its tests have not been re-run | `npm run regression -- <skill-name>` |
| `artifact "x" has no accuracy test` | Something the skill produces has no test | `npm run test:new -- <skill-name>` |

You can always paste the red text to your assistant and ask "fix this".

---

## Why it will not let you skip the checks

The checks run automatically before every save. That is deliberate: the whole point of this repo is
that a skill cannot quietly stop working. If you are stuck, the fix is never to switch a check
off — GitHub runs the same checks again after you upload, so skipping just moves the problem
somewhere you cannot see it. Ask for help with the exact message instead.

---

## Reviewing and finishing

1. `npm run ship "title"` opens the review request and asks your reviewers.
2. If they ask for changes: make them, then `npm run save` again. It joins the same request — you
   never open a second one.
3. Once it is approved and merged, run `npm run sync` to catch up, and start the next thing.

---

## Keeping it good as it grows

One skill is easy. Forty is where quality quietly rots. `docs/KEEPING-QUALITY.md` is the short
routine that prevents it — read it once, and run `npm run health` every couple of weeks.
