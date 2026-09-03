# Advanced: driving the tooling from the command line

Everything the assistant does maps to an npm command you can run yourself from the repo root.

There is nothing to `npm install` — the tooling has zero package dependencies (npm is only the
command runner, and the Python harness is stdlib-only). You need the runtimes: Node 22+,
Python 3.11+, git; `npm run doctor` checks them and prints the install command for anything
missing. On Windows, use Git Bash or WSL.

## The walkthrough, in commands

The same steps as the README's getting-started guide. Each shows the command and what its output
looks like when things go right.

**1. Initialize** — `npm run setup`. It checks each tool (`ok git`, `ok Node.js v22...`), wires
the pre-commit hook (`git hooks path -> .framework/hooks`), then runs every check once. Ends with
the day-to-day command list. If a runtime is missing, `npm run doctor` prints one install command
for your package manager (brew/apt/winget) — run it, then re-run the doctor.

**2. Build a pair** — `npm run skill:new`. Interactive interview in the terminal; blank line
finishes list questions. Ends with `Generated N files across 2 skill(s): <uc>-doer,
<uc>-interpreter`, the file list, and a validation run over what it wrote. Then replace the
scaffolded parts: the real schema fields in `references/schema.md`, the real logic in
`scripts/<module>.py`, real expectations in `scripts/tests/`, the real lens in the interpreter's
SKILL.md.

**3. Test with a clean sub-agent** — `npm run subagent -- <uc> "a real task"`. Needs the Copilot
CLI installed (`copilot`); the run transcript is saved under the skill's `evals/runs/` and the
output ends with deterministic checks, e.g. `ok outputs/<uc>.json parses and carries records +
deviations`. Variants: `--role interpreter` (checks `## Facts` comes before
`## Interpretations`), `--discovery` (does not name the skill — tests that the description
triggers).

**4. Edit + lock in feedback** — make the fix, add a regression case (JSON in `evals/cases/` or a
Python test), then `npm run regression -- <skill>`. Expect `PASS <skill> (n/n)` and `recorded 1
run(s) in .framework/state/` — commit that state file with your change or the gate rejects it as
stale.

**5. Validate** — `npm run check`. Five stages in order (lint, format, tests, rubric, health);
each failure names the skill and the fixing command. Ends `All checks passed.`

**6. Save** — `npm run start "topic"` once per piece of work (creates branch `skill/topic`), then
`npm run save "what I did"`. Save re-runs the checks, commits with a conventional message, and
pushes; ends `Saved and uploaded.` On a failure: `Something is not right yet, so nothing was
saved.`

**7. Review + ship** — `npm run ship "title"` opens the PR in this repo (ends `Review request
opened: <url>`). `npm run publish -- <uc>` ships a green pair to the consuming repo: first run
tells you to create `.framework/targets.json` (it prints the exact shape); after that it
re-verifies the pair, copies both halves to the target's `.github/skills/` on branch
`skill/<uc>`, and opens the PR there.

| Command | What it does |
| --- | --- |
| `npm run setup` | One-time: checks the runtimes, switches on the pre-commit safety checks, runs every check once to prove the clone works. |
| `npm run doctor` | Checks this computer — runtimes, hooks, reviewers, harness — and prints the one install command for anything missing. |
| `npm run skill:new` | Interviews you (name, trigger, artifact fields, steps, lens), then generates the complete pair into `skills/` — both SKILL.md files, the artifact schema, variations, deterministic Python, all three kinds of test, seed regression cases — and validates what it wrote. The folder appears with your first pair. |
| `npm run subagent -- <uc> "task"` | Runs the skill with a fresh agent process that has none of your conversation context, saves the transcript under the skill's `evals/runs/`, and checks the output (artifact matches the schema; Facts before Interpretations). `--role interpreter` runs the other half; `--discovery` hides the skill's name to test that its description alone triggers it. |
| `npm run test:new -- <skill>` | Lists every missing accuracy/edge/performance test for a doer's artifact and modules, and writes the file that closes each gap — a working scaffold whose expectations you make real. |
| `npm run check` | The whole gate in order: lint → format + pair rules → every regression case and Python test → rubric (nothing stale or uncovered) → library health. |
| `npm run regression -- <skill>` | Runs one skill's suite and records the result in `.framework/state/` — the "inspection sticker" the gate checks. |
| `npm run status` | Where you are — branch, changed files, whether the safety checks are on — and the next command to run. |
| `npm run start "topic"` | Begins a piece of work on its own branch, named after the topic. |
| `npm run save "what I did"` | Runs every check; only if all pass does it commit and upload your work. |
| `npm run ship "title"` | Opens a pull request for this repo's changes, with the configured reviewers attached. |
| `npm run publish -- <uc>` | Verifies the pair is green, then copies it to the target repo (from `.framework/targets.json`) on a branch with a pull request. |
| `npm run health` | The whole library at a glance: anything untested, stale, thinly covered, colliding triggers, or half a pair. |

The full contract the gate enforces is `.framework/FRAMEWORK.md`, mirrored machine-readably in
`.framework/framework.json` — change both in the same commit.
