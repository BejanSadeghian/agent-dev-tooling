---
name: dev-helper
description: >-
  Runs the git and GitHub work for someone who does not use git: starts a branch, runs the checks,
  and publishes finished pairs — one verb that confirms the tests, saves and uploads the work, and
  delivers to the team repo. Use when the person asks to save, commit, push, upload, branch, sync,
  publish, ship, or says something is not working with git or GitHub in this repo.
allowed-tools:
  - Bash
  - Read
  - Edit
---

# Dev helper

The person you are helping does not know git and does not want to. Your job is to move their work
safely from "changed on my computer" to "reviewed on GitHub", and to say what you are doing in
words that make sense without knowing what a commit is.

## When to use

Use when the person says any of: save this, commit, push, upload, back this up, start something
new, open a pull request, ask for review, get the latest, or "git is complaining".

Do **not** use for: writing or fixing the skills themselves (`skill-builder`, `test-generator`), or
for anything on a repository other than this one.

## Inputs

| Input | Required | Notes |
|---|---|---|
| The repo, checked out | yes | Every command runs from the repo folder. |
| `.framework/setup/reviewers.json` | for review requests | Created by `bash .framework/setup/configure-gh.sh`. |
| A signed-in `gh` | for review requests | Without it, fall back to the browser link. |

## Workflow

### 1. Find out where they are before doing anything

```bash
npm run status
```

Tells you the branch, what changed, and whether the safety checks are switched on. Never run a git
command before you know this — the right next step is entirely different on `main` versus a branch.

### 2. Use the friendly commands, not raw git

| They want to | Run | What it does |
|---|---|---|
| Start something new | `npm run start "topic"` | Fresh branch `skill/topic` from the latest `main` |
| Check their work | `npm run check` | Format, tests, rubric, library health |
| Publish a finished pair | `npm run publish -- <use-case>` | Confirms the test state, saves and uploads their work, delivers the pair to the team repo with a review request there |
| Get the latest main | `npm run sync` | Merges `main` into their branch |
| Fix their setup | `npm run doctor` | Checks tools, switches the hooks back on |

Prefer these over `git` directly. They refuse the two things that actually cause damage — committing
to `main`, and saving work whose checks have not passed — and they say what they are doing first.

### 3. Never do these

- **Never** `git push --force`, `git reset --hard`, `git rebase`, or delete a branch on their behalf.
- **Never** commit directly to `main`. If they are on `main` with changes, run `npm run start` first;
  the branch takes the changes with it.
- **Never** switch the pre-commit checks off. If a check fails, fix the cause. `SKIP_SKILL_GATE=1`
  exists for emergencies and CI still enforces the same gate, so skipping only moves the failure.
- **Never** delete or overwrite their files to make a check pass.

### 4. When a check fails, translate it

Every failure names a skill and the command that fixes it. Say it back in their terms:

| What they see | What it means | What you run |
|---|---|---|
| `R5 stale: skill edited after its last regression run` | The skill changed and its tests were not re-run | `npm run regression -- <skill>` |
| `R8 artifact "x" has no accuracy test` | Something the skill produces is untested | `npm run test:new -- <skill>` |
| `scaling regressed: n^1.0 → n^2.1` | The code got much slower on big inputs | Look at what changed in the doer's `scripts/`, then re-measure |
| `missing required heading "## Workflow"` | The skill file lost a required section | Put the section back |
| `Permission ... denied` / `403` at publish | Their account cannot write to the team repo yet — nothing is lost, their work is saved | Pause; they request access with the README's Step 0 sentence, then `npm run publish` again |

Fix the cause, then run `npm run check` again. Report the result in one line.

### 5. When they want to publish

```bash
npm run publish -- <use-case>
```

One verb, three things, in order: it confirms the test state (the same checks as
`npm run check`), quietly saves and uploads their work on its own branch, then delivers the pair
to the team repo with a review request there. Tell them the link when it prints.

If the checks do not confirm, nothing is published — read the failure back in their terms
(section 4) and offer the fix. **The decision to publish anyway is always theirs:** if they say
so, run `npm run publish -- <use-case> --override "their reason, in their words"` — the reason
goes on the record in the delivery. Never override on your own judgment.

### 6. After review on the team repo

- Changes requested → make the changes here, run `npm run publish -- <use-case>` again, and say
  "I've updated the same request". A re-publish joins the existing pull request; never open a
  second one.
- Approved and merged → `npm run sync` to bring `main` up to date, then start the next piece with
  `npm run start`.

## Outputs

- Their work, saved and uploaded, with every check confirmed (or overridden by them, on record).
- The pair delivered to the team repo with a review request open there.
- A one-line explanation of what happened, in their language, every time.

## References

- `references/what-git-words-mean.md` — the words they will see, in plain English.
- `.framework/setup/configure-gh.sh` — sets up reviewers and (optionally) requires review before merge.
