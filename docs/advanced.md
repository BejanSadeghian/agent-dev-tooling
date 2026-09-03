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

**6. Publish** — `npm run publish -- <uc>`. One verb: confirms the test state (the full gate
over the pair), quietly commits and pushes your work on a branch (never `main`), then delivers —
first run tells you to create `.framework/targets.json` (it prints the exact shape); after that
it copies both halves to the target's `.github/skills/` on branch `skill/<uc>` and opens the PR
there. If the gate fails, nothing is published; the human may direct
`npm run publish -- <uc> --override "reason"` — the reason lands in the delivery commit and PR
body. (`npm run start "topic"` still exists for starting work on its own branch.)

| Command | What it does |
| --- | --- |
| `npm run setup` | One-time: checks the runtimes, switches on the pre-commit safety checks, runs every check once to prove the clone works. |
| `npm run doctor` | Checks this computer — runtimes, hooks, reviewers, harness — and prints the one install command for anything missing. |
| `npm run skill:new` | Interviews you (name, trigger, artifact fields, steps, lens), then generates the complete pair into `skills/` — both SKILL.md files, the artifact schema, variations, deterministic Python, all three kinds of test, seed regression cases — and validates what it wrote. The folder appears with your first pair. |
| `npm run subagent -- <uc> "task"` | Runs the skill with a fresh agent process that has none of your conversation context, saves the transcript under the skill's `evals/runs/`, and checks the output (artifact matches the schema; Facts before Interpretations). `--role interpreter` runs the other half; `--discovery` hides the skill's name to test that its description alone triggers it. |
| `npm run test:new -- <skill>` | Lists every missing accuracy/edge/performance test for a doer's artifact and modules, and writes the file that closes each gap — a working scaffold whose expectations you make real. |
| `npm run scenario -- <uc> [name]` | Agent-level acceptance eval: stages the scenario's fixtures into a fresh sandbox, walks the steps with a clean sub-agent (3 trials), evaluates checkpoints over artifacts and transcript (plus an LLM judge), and writes one report per scenario to `.framework/state/scenarios/`. Report rows carry short IDs (`C1`, `C2`, …). Human decisions: `--waive C3 "reason"` (accept one failing check), `--accept "reason"` / `--reject "reason"` (overrule the whole verdict). `--list` shows every scenario's effective verdict and failing IDs. Spec: `.framework/framework-testing.md`. |
| `npm run check` | The whole gate in order: lint → format + pair rules → every regression case and Python test → rubric (nothing stale or uncovered) → library health. |
| `npm run regression -- <skill>` | Runs one skill's suite and records the result in `.framework/state/` — the "inspection sticker" the gate checks. |
| `npm run status` | Where you are — branch, changed files, whether the safety checks are on — and the next command to run. |
| `npm run start "topic"` | Begins a piece of work on its own branch, named after the topic. |
| `npm run publish -- <uc>` | The one delivery verb: confirms the test state, commits and pushes your work (never on `main`), then copies the pair to the target repo (from `.framework/targets.json`) on a branch with a pull request. `--override "reason"` publishes despite failing checks — human's call only, reason on the record. |
| `npm run health` | The whole library at a glance: anything untested, stale, thinly covered, colliding triggers, or half a pair. |

The full contract the gate enforces is `.framework/FRAMEWORK.md`, mirrored machine-readably in
`.framework/framework.json` — change both in the same commit.
