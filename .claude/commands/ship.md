---
description: Save my work and open a pull request with the right reviewers.
---

Use the `dev-helper` skill.

1. `npm run status` first — know where I am before touching anything.
2. If I am on `main` with changes, `npm run start` to move them onto a branch.
3. `npm run save "$ARGUMENTS"` — it runs the checks before saving. If they fail, fix the cause and
   tell me what it was; do not save around it.
4. `npm run ship "$ARGUMENTS"` and give me the link plus who was asked to review.

Never force-push, hard-reset, rebase, or commit to `main`.
