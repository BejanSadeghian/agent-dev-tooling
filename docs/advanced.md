# Advanced: driving the tooling from the command line

Everything the assistant does maps to an npm command you can run yourself from the repo root.

There is nothing to `npm install` — the tooling has zero package dependencies (npm is only the
command runner, and the Python harness is stdlib-only). You need the runtimes: Node 22+,
Python 3.11+, git; `npm run doctor` checks them and prints the install command for anything
missing. On Windows, use Git Bash or WSL.

| Command | What it does |
| --- | --- |
| `npm run setup` | One-time: checks the runtimes, switches on the pre-commit safety checks, runs every check once to prove the clone works. |
| `npm run doctor` | Checks this computer — runtimes, hooks, reviewers, harness — and prints the one install command for anything missing. |
| `npm run skill:new` | Interviews you (name, trigger, artifact fields, steps, lens), then generates the complete pair into `development/` — both SKILL.md files, the artifact schema, variations, deterministic Python, all three kinds of test, seed regression cases — and validates what it wrote. The folder appears with your first pair. |
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
