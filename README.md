# Skill development environment

This repo is where agent skills get **built and tested** before they ship to the repos that use
them. Every use case becomes a pair of skills — one that processes data exactly, one that
interprets the result — and nothing ships until its checks are green.

You do not need to know git, terminals, or Python to work here. The recommended way to do
everything is to talk to an AI assistant, which does the technical parts for you.

> **AI agents:** your instructions are in [`robot.txt`](robot.txt). Read this page too — the
> concepts live here — but the rules that apply specifically to you live there.

## Getting started — recommended (no CLI needed)

Open this repo in an AI coding assistant — **GitHub Copilot** (in VS Code: open the folder, then
open Copilot Chat) or **Claude Code**. The assistant picks up this repo's built-in skills
automatically and runs every command for you. You just say what you want:

| Say something like | What the assistant does |
| --- | --- |
| "Set this repo up on my computer" | Checks the tools, switches on the safety checks, runs everything once |
| "I want to build a skill for ___" | Interviews you about it (one question at a time), then generates the whole pair with its tests |
| "Test it on a real task: ___" | Runs the skill with a **fresh, separate agent** and shows you what it produced |
| "It should have done X instead" | Fixes the skill AND adds a test so that mistake can never come back |
| "Check my work" | Runs every check and explains anything that fails, in plain words |
| "Save my work" | Checks first, then saves and uploads it on its own branch |
| "Ask for a review" / "Open a pull request" | Opens the review request with the right reviewers |
| "Ship ___ to our team's repo" | Copies the finished pair to the repo that will use it |
| "How is the library doing?" | Shows the health report: anything untested, stale, or half a pair |

Two things worth knowing:

- **Nothing is saved without passing its checks.** The assistant literally cannot commit work
  that fails the gate — the same gate runs again in CI, so nothing slips through.
- **You develop in one chat, but testing happens in a fresh one.** The assistant that wrote a
  skill already knows what it *meant* to say, so it would paper over the gaps. Testing always
  uses a clean sub-agent that has never seen your conversation.

## Getting started — advanced (direct CLI)

There is nothing to `npm install` — the tooling has zero package dependencies (npm is only the
command runner, and the Python harness is stdlib-only). You need the runtimes: Node 22+,
Python 3.11+, git; `npm run doctor` checks them and prints the install command for anything
missing. On Windows, use Git Bash or WSL. Everything the assistant does maps to an npm command
you can run yourself:

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

## The pair

| Half | What it is |
| --- | --- |
| `<use-case>-doer` | As low-level and procedural as possible. Deterministic Python in `scripts/` turns input data into ONE structured artifact whose shape is committed in `references/schema.md`. It always conforms; anything the input forced is reported in the artifact's `deviations` field, never absorbed into a new shape. Verified exactly: accuracy, edge cases, performance. |
| `<use-case>-interpreter` | Reads that artifact and produces a two-part output: **Facts** (each traceable to the artifact, deviations included), then **Interpretations** (judgment applying its lens, adapted by `references/variations/`). A reader can always tell data from opinion. |

A missing half is a warning, never a blocker — the health report keeps naming it.

## What the folders are

| Folder | In plain words |
| --- | --- |
| `development/` | The workshop: skills being built, one directory per skill, in pairs. It appears when you build your first pair (`npm run skill:new` creates it). Deliberately invisible to your assistant's skill list, so a work in progress only ever runs inside a clean sub-agent. |
| `.github/skills/` | The assistant's tools for working *here* (described below). This is what Copilot discovers and loads. |
| `.framework/` | The machinery — never edited by hand. The spec (`FRAMEWORK.md`), the one contract every check reads (`framework.json`), the validators, the Python test harness, the pre-commit hook, and the tooling's own tests. |
| `.framework/state/` | The inspection stickers. After a skill's tests pass, the test runner records the result here with a fingerprint of exactly the version it tested. Change the skill and the sticker no longer matches — the gate refuses the work until the tests run again. Stickers travel with your change as proof; only the test runner writes them. |

## The built-in skills

These live in `.github/skills/` and are what your assistant reaches for when you ask for things —
you never invoke them directly:

| Skill | What it does |
| --- | --- |
| `skill-builder` | Builds a use case end to end: reads your raw material, interviews you one question at a time, generates the whole pair with `npm run skill:new`, then refines it through clean sub-agent runs — every piece of your feedback lands as both a fix and a regression test. It is forbidden from running a skill it is building in its own chat. |
| `test-generator` | Fills test gaps: finds every artifact or module missing an accuracy, edge-case, or performance test and writes it; generates deterministic fixture data from a seeded generator (never real or random data); turns any bug you report into a regression test that fails first, then passes. |
| `dev-helper` | Runs git and GitHub for people who do not use git: branch, check, save, upload, pull request with the right reviewers — in plain language, refusing the dangerous moves (committing to main, force-pushes, skipping the checks). |

## What keeps it honest

- **One contract, three enforcement points.** `.framework/framework.json` is read by
  `npm run check`, the pre-commit hook, and CI — the same gate everywhere, plus a CI job proving
  hook parity.
- **Freshness rule.** Editing a skill without re-running its suite fails the gate.
- **Exactness lives in code.** Anything that must be reproducible is deterministic Python in the
  doer, tested for accuracy, edge cases, and performance.
- **Clean sub-agents only.** The developing agent's context never contaminates a test run, and
  sub-agent runs (nondeterministic) never gate a commit.
