# The words, in plain English

Use these when explaining. They are not exact definitions; they are the right mental model.

| Word | What it actually means for them |
|---|---|
| repository / repo | The project folder, plus its full history. |
| branch | A private copy of the project where your changes live until they are reviewed. |
| `main` | The shared, agreed version everyone else uses. Never edited directly. |
| commit | A save point, with a note saying what changed. |
| push / upload | Copying your save points to GitHub so they are backed up and visible. |
| pull / sync | Bringing other people's changes into your copy. |
| pull request (PR) | "Please look at my work and, if it is good, add it to the shared version." |
| review | A teammate reading it and either approving or asking for changes. |
| merge | Your work becoming part of the shared version. |
| conflict | You and someone else changed the same lines; a person has to choose. |
| hook | A check that runs automatically before a save is allowed. |
| CI | The same checks, run again by GitHub after you upload, so nothing slips through. |

## Things that sound scary but are not

- **"Your branch is behind main."** Other people have added work. Run `npm run sync`.
- **"Nothing to commit."** Nothing has changed since the last save.
- **"Rejected — non-fast-forward."** Someone else changed the same branch. Run `npm run sync`, then save again.

## Things that are genuinely worth stopping for

- **A conflict.** Two changes to the same lines. Get a person, or ask Claude Code / Copilot to
  resolve it — never guess.
- **A failing check that keeps failing after the suggested fix.** Something real is broken. Do not
  switch the check off; ask for help with the exact message.
- **Anything asking to force-push, hard-reset, or delete a branch.** Stop and ask a person.
