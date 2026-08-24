---
name: dev-helper
description: >-
  Runs the git and GitHub work for someone who does not use git: starts a branch, runs the checks,
  saves and uploads changes, opens a pull request with the right reviewers, and explains each step
  in plain language. Use when the person asks to save, commit, push, upload, branch, sync, open a
  PR, request review, or says something is not working with git or GitHub in this repo.
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
| `setup/reviewers.json` | for review requests | Created by `bash setup/configure-gh.sh`. |
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
| Save and upload | `npm run save "what I did"` | Checks first, then commits and pushes |
| Ask for review | `npm run ship "title"` | Opens the pull request, adds the reviewers |
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
| `scaling regressed: n^1.0 → n^2.1` | The code got much slower on big inputs | Look at what changed in `python/`, then re-measure |
| `missing required heading "## Workflow"` | The skill file lost a required section | Put the section back |

Fix the cause, then run `npm run check` again. Report the result in one line.

### 5. When they ask for review

```bash
npm run ship "what this changes"
```

Then tell them: the link, who was asked to review, and that they do not need to do anything until
someone comments. If `gh` is missing or not signed in, give them the browser link `ship` prints and
offer to run `bash setup/configure-gh.sh`.

### 6. After review

- Changes requested → make the changes, `npm run save`, and say "I've updated the same request".
  A new save always joins the existing pull request; never open a second one.
- Approved and merged → `npm run sync` to bring `main` up to date, then start the next piece with
  `npm run start`.

## Outputs

- Their work, saved and uploaded, with every check green.
- A pull request with the configured reviewers attached.
- A one-line explanation of what happened, in their language, every time.

## References

- `references/what-git-words-mean.md` — the words they will see, in plain English.
- `setup/configure-gh.sh` — sets up reviewers and (optionally) requires review before merge.
